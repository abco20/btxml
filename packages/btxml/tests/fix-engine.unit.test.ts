import assert from "node:assert/strict";
import test from "node:test";
import type { Diagnostic, TextEdit } from "@btxml/foundation";
import type { CheckProjectResult } from "@btxml/project";
import type { BtDocument } from "@btxml/syntax";
import { applyFixPlan } from "../src/fix/apply.ts";
import { type LintFixEngineOptions, runLintFixEngineCore } from "../src/fix/engine.ts";
import type { FixCandidate } from "../src/fix/types.ts";

function diagnostic(code: string, uri = "tree.xml"): Diagnostic {
  return {
    code,
    severity: "error",
    message: code,
    uri,
  };
}

function makeResult(diagnostics: Diagnostic[]): CheckProjectResult {
  return {
    ok: diagnostics.length === 0,
    files: [],
    projectDiagnostics: diagnostics,
    summary: {
      files: 1,
      errors: diagnostics.filter((entry) => entry.severity === "error").length,
      warnings: diagnostics.filter((entry) => entry.severity === "warning").length,
      infos: diagnostics.filter((entry) => entry.severity === "info").length,
      suppressed: 0,
      baselineFiltered: 0,
    },
  };
}

function makeDoc(uri: string, text: string): BtDocument {
  return {
    uri,
    originalText: text,
  } as BtDocument;
}

function replaceWholeTextEdit(text: string, newText: string): TextEdit {
  return {
    range: {
      start: { line: 0, character: 0, offset: 0 },
      end: { line: 0, character: 0, offset: text.length },
    },
    newText,
  };
}

function candidateFromText(input: {
  id: string;
  uri?: string;
  code?: string;
  safety?: "safe" | "unsafe";
  from: string;
  to: string;
}): FixCandidate {
  return {
    id: input.id,
    uri: input.uri ?? "tree.xml",
    diagnosticCode: input.code ?? "BT_TEST",
    diagnosticSeverity: "error",
    diagnosticMessage: input.id,
    safety: input.safety ?? "safe",
    title: input.id,
    edits: [replaceWholeTextEdit(input.from, input.to)],
    source: {
      kind: "diagnostic",
      diagnosticFingerprint: input.id,
    },
  };
}

async function runCore(input: {
  initialText: string;
  options?: Partial<LintFixEngineOptions>;
  getDiagnostics: (text: string) => Diagnostic[];
  getCandidates: (text: string, diagnostics: Diagnostic[]) => FixCandidate[];
  parseHasErrors?: (text: string) => boolean;
  formatText?: (text: string) => { ok: boolean; skipped?: boolean; text?: string } | undefined;
}) {
  let text = input.initialText;
  const uri = "tree.xml";

  const options: LintFixEngineOptions = {
    unsafe: false,
    dryRun: false,
    maxPasses: 10,
    formatAfterFix: true,
    ...input.options,
  };

  return runLintFixEngineCore({
    options,
    getState: async () => {
      const diagnostics = input.getDiagnostics(text);
      return {
        documents: [makeDoc(uri, text)],
        result: makeResult(diagnostics),
      };
    },
    getCandidates: ({ diagnostics }) => input.getCandidates(text, diagnostics),
    applyPlan: applyFixPlan,
    parseHasErrors: ({ text: candidateText }) => input.parseHasErrors?.(candidateText) ?? false,
    formatText: ({ text: candidateText }) => input.formatText?.(candidateText),
    readCurrentText: () => text,
    writeCurrentText: (_uri, nextText) => {
      text = nextText;
    },
    toDisplayPath: (value) => value,
  });
}

test("fix-engine multipass dry-run preview reaches final state", async () => {
  const result = await runCore({
    initialText: "A",
    options: { dryRun: true, formatAfterFix: false },
    getDiagnostics: (text) => (text === "C" ? [] : [diagnostic("BT_TEST")]),
    getCandidates: (text) => {
      if (text === "A") return [candidateFromText({ id: "A->B", from: "A", to: "B" })];
      if (text === "B") return [candidateFromText({ id: "B->C", from: "B", to: "C" })];
      return [];
    },
  });

  assert.equal(result.summary.passes, 3);
  assert.equal(result.summary.appliedDiagnostics, 2);
  assert.equal(result.summary.fixedTextByPath?.["tree.xml"], "C");
});

test("fix-engine detects circular fixes", async () => {
  const result = await runCore({
    initialText: "A",
    options: { maxPasses: 8, formatAfterFix: false },
    getDiagnostics: () => [diagnostic("BT_LOOP")],
    getCandidates: (text) =>
      text === "A"
        ? [candidateFromText({ id: "A->B", from: "A", to: "B" })]
        : [candidateFromText({ id: "B->A", from: "B", to: "A" })],
  });

  assert.equal(result.summary.circularFixesDetected, true);
});

test("fix-engine rolls back pass on parse failure", async () => {
  let current = "OK";
  const result = await runLintFixEngineCore({
    options: {
      unsafe: false,
      dryRun: false,
      maxPasses: 5,
      formatAfterFix: false,
    },
    getState: async () => ({
      documents: [makeDoc("tree.xml", current)],
      result: makeResult(current === "OK" ? [diagnostic("BT_PARSE")] : []),
    }),
    getCandidates: ({ diagnostics }) =>
      diagnostics.length > 0
        ? [candidateFromText({ id: "break", from: "OK", to: "BROKEN", code: "BT_PARSE" })]
        : [],
    applyPlan: applyFixPlan,
    parseHasErrors: ({ text }) => text.includes("BROKEN"),
    formatText: () => undefined,
    readCurrentText: () => current,
    writeCurrentText: (_uri, text) => {
      current = text;
    },
    toDisplayPath: (uri) => uri,
  });

  assert.equal(current, "OK");
  assert.equal(
    result.summary.skipped.some((entry) => entry.reason === "parse-failed"),
    true,
  );
});

test("fix-engine records formatter-failed without rollback", async () => {
  let current = "A";
  const result = await runLintFixEngineCore({
    options: {
      unsafe: false,
      dryRun: false,
      maxPasses: 5,
      formatAfterFix: true,
    },
    getState: async () => ({
      documents: [makeDoc("tree.xml", current)],
      result: makeResult(current === "A" ? [diagnostic("BT_FORMAT")] : []),
    }),
    getCandidates: ({ diagnostics }) =>
      diagnostics.length > 0
        ? [candidateFromText({ id: "A->B", from: "A", to: "B", code: "BT_FORMAT" })]
        : [],
    applyPlan: applyFixPlan,
    parseHasErrors: () => false,
    formatText: () => ({ ok: false }),
    readCurrentText: () => current,
    writeCurrentText: (_uri, text) => {
      current = text;
    },
    toDisplayPath: (uri) => uri,
  });

  assert.equal(current, "B");
  assert.equal(
    result.summary.skipped.some((entry) => entry.reason === "formatter-failed"),
    true,
  );
});

test("fix-engine skips formatter when fix-no-format is enabled", async () => {
  let current = "A";
  let formatCalls = 0;

  const result = await runLintFixEngineCore({
    options: {
      unsafe: false,
      dryRun: false,
      maxPasses: 5,
      formatAfterFix: false,
    },
    getState: async () => ({
      documents: [makeDoc("tree.xml", current)],
      result: makeResult(current === "A" ? [diagnostic("BT_NO_FORMAT")] : []),
    }),
    getCandidates: ({ diagnostics }) =>
      diagnostics.length > 0
        ? [candidateFromText({ id: "A->B", from: "A", to: "B", code: "BT_NO_FORMAT" })]
        : [],
    applyPlan: applyFixPlan,
    parseHasErrors: () => false,
    formatText: () => {
      formatCalls += 1;
      return { ok: true, text: "formatted" };
    },
    readCurrentText: () => current,
    writeCurrentText: (_uri, text) => {
      current = text;
    },
    toDisplayPath: (uri) => uri,
  });

  assert.equal(formatCalls, 0);
  assert.equal(result.summary.appliedDiagnostics, 1);
  assert.equal(current, "B");
});

test("fix-engine stops at max passes", async () => {
  const result = await runCore({
    initialText: "0",
    options: { maxPasses: 2, formatAfterFix: false },
    getDiagnostics: () => [diagnostic("BT_MAX")],
    getCandidates: (text) => [candidateFromText({ id: `inc-${text}`, from: text, to: `${text}x` })],
  });

  assert.equal(result.summary.passes, 2);
  assert.equal(result.summary.circularFixesDetected, false);
});
