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
        externalModelDocuments: [],
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
      externalModelDocuments: [],
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

test("fix-engine dedupes unsafe skips across multipass", async () => {
  const result = await runCore({
    initialText: "A",
    options: { unsafe: false, formatAfterFix: false, maxPasses: 10 },
    getDiagnostics: (text) => {
      const diagnostics: Diagnostic[] = [diagnostic("BT_UNSAFE")];
      if (text === "A" || text === "B") diagnostics.push(diagnostic("BT_SAFE"));
      return diagnostics;
    },
    getCandidates: (text, diagnostics) => {
      const candidates: FixCandidate[] = [];
      if (diagnostics.some((entry) => entry.code === "BT_SAFE")) {
        candidates.push(
          candidateFromText({
            id: `safe-${text}`,
            code: "BT_SAFE",
            from: text,
            to: text === "A" ? "B" : "C",
          }),
        );
      }
      if (diagnostics.some((entry) => entry.code === "BT_UNSAFE")) {
        candidates.push(
          candidateFromText({
            id: "unsafe",
            code: "BT_UNSAFE",
            safety: "unsafe",
            from: text,
            to: text,
          }),
        );
      }
      return candidates;
    },
  });

  assert.equal(result.summary.passes, 3);
  assert.equal(result.summary.unsafeSkippedDiagnostics, 1);
  assert.equal(
    result.summary.skipped.filter((entry) => entry.reason === "unsafe-not-enabled").length,
    1,
  );
});

test("fix-engine records overlap skip from competing candidates", async () => {
  const result = await runCore({
    initialText: "AB",
    options: { formatAfterFix: false, maxPasses: 2 },
    getDiagnostics: (text) => (text === "XB" ? [] : [diagnostic("BT_OVERLAP")]),
    getCandidates: (text) => {
      if (text !== "AB") return [];
      return [
        candidateFromText({ id: "left", code: "BT_OVERLAP", from: "AB", to: "XB" }),
        candidateFromText({ id: "right", code: "BT_OVERLAP", from: "AB", to: "AX" }),
      ];
    },
  });

  assert.equal(result.summary.appliedDiagnostics, 1);
  assert.equal(
    result.summary.skipped.some((entry) => entry.reason === "overlap"),
    true,
  );
});

test("fix-engine includes external model documents in fix candidates", async () => {
  const texts = new Map<string, string>([
    ["tree.xml", "TREE"],
    ["models.xml", "MODEL"],
  ]);

  const result = await runLintFixEngineCore({
    options: {
      unsafe: false,
      dryRun: false,
      maxPasses: 3,
      formatAfterFix: false,
    },
    getState: async () => ({
      documents: [makeDoc("tree.xml", texts.get("tree.xml") ?? "")],
      externalModelDocuments: [makeDoc("models.xml", texts.get("models.xml") ?? "")],
      result: makeResult(
        texts.get("models.xml") === "MODEL_FIXED" ? [] : [diagnostic("BT_EXTERNAL", "models.xml")],
      ),
    }),
    getCandidates: ({ documents, diagnostics }) => {
      if (!documents.some((document) => document.uri === "models.xml")) return [];
      if (!diagnostics.some((entry) => entry.code === "BT_EXTERNAL")) return [];
      const current = texts.get("models.xml") ?? "";
      return [
        candidateFromText({
          id: "model-fix",
          uri: "models.xml",
          code: "BT_EXTERNAL",
          from: current,
          to: "MODEL_FIXED",
        }),
      ];
    },
    applyPlan: applyFixPlan,
    parseHasErrors: () => false,
    formatText: () => undefined,
    readCurrentText: (uri) => texts.get(uri) ?? "",
    writeCurrentText: (uri, text) => {
      texts.set(uri, text);
    },
    toDisplayPath: (uri) => uri,
  });

  assert.equal(texts.get("models.xml"), "MODEL_FIXED");
  assert.equal(result.summary.appliedDiagnostics, 1);
});

test("fix-engine rolls back pass when formatter output becomes parse-invalid", async () => {
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
      externalModelDocuments: [],
      result: makeResult(current === "A" ? [diagnostic("BT_FORMAT")] : []),
    }),
    getCandidates: ({ diagnostics }) =>
      diagnostics.length > 0
        ? [candidateFromText({ id: "A->B", from: "A", to: "B", code: "BT_FORMAT" })]
        : [],
    applyPlan: applyFixPlan,
    parseHasErrors: ({ text }) => text.includes("BROKEN"),
    formatText: () => ({ ok: true, text: "BROKEN" }),
    readCurrentText: () => current,
    writeCurrentText: (_uri, text) => {
      current = text;
    },
    toDisplayPath: (uri) => uri,
  });

  assert.equal(current, "A");
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
      externalModelDocuments: [],
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
