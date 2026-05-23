import { getEffectiveConfigForFile } from "@btxml/config";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import { formatBtXml } from "@btxml/core";
import { type Diagnostic, DiagnosticSeverity } from "@btxml/foundation";
import {
  type BtxmlProject,
  type CheckProjectResult,
  type DiagnosticBaseline,
  type ProjectHost,
  checkProject,
  loadProjectDocuments,
} from "@btxml/project";
import {
  fileUriToPath,
  getNodeProjectModelFiles,
  getNodeProjectSelectedFiles,
} from "@btxml/project/node";
import { type BtDocument, parseBtXml } from "@btxml/syntax";
import { readText, writeTextAtomic } from "../io.ts";
import { applyFixPlan } from "./apply.ts";
import { getLintFixCandidates } from "./candidates.ts";
import { planFixes } from "./plan.ts";
import { createFixRunSummary } from "./report.ts";
import type { FixRunSummary } from "./types.ts";

export type LintFixEngineOptions = {
  unsafe: boolean;
  dryRun: boolean;
  maxPasses: number;
  formatAfterFix: boolean;
  resolvedConfig?: ResolvedBtxmlConfig;
  baseline?: DiagnosticBaseline;
  maxWarnings?: number;
  showSuppressed?: boolean;
  projectDiagnostics?: Diagnostic[];
};

type CheckProjectResultWithFixMetadata = CheckProjectResult & {
  suppressedDiagnostics?: Diagnostic[];
  baselineDiagnostics?: Diagnostic[];
};

function resolvePathFromUri(project: BtxmlProject, uri: string): string {
  const knownFiles = [
    ...getNodeProjectSelectedFiles(project),
    ...getNodeProjectModelFiles(project),
  ];
  const known = knownFiles.find(
    (file) => file.uri === uri || file.absolutePath === uri || file.path === uri,
  );
  if (known?.absolutePath) return known.absolutePath;
  if (uri.startsWith("file://")) return fileUriToPath(uri);
  return uri;
}

function toDisplayPath(project: BtxmlProject, uri: string): string {
  const knownFiles = [
    ...getNodeProjectSelectedFiles(project),
    ...getNodeProjectModelFiles(project),
  ];
  const known = knownFiles.find(
    (file) => file.uri === uri || file.absolutePath === uri || file.path === uri,
  );
  if (known?.path) return known.path;
  if (known?.absolutePath) return known.absolutePath;
  return uri;
}

function hashTouchedState(input: { uris: string[]; readTextByUri: (uri: string) => string }) {
  return input.uris
    .map((uri) => `${uri}:${input.readTextByUri(uri)}`)
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

function collectFixDiagnostics(result: CheckProjectResultWithFixMetadata): Diagnostic[] {
  const suppressed = new Set(
    (result.suppressedDiagnostics ?? []).map((diagnostic) =>
      [
        diagnostic.code,
        diagnostic.uri,
        diagnostic.range?.start.offset ?? -1,
        diagnostic.range?.end.offset ?? -1,
        diagnostic.message,
      ].join(":"),
    ),
  );
  const baselineFiltered = new Set(
    (result.baselineDiagnostics ?? []).map((diagnostic) =>
      [
        diagnostic.code,
        diagnostic.uri,
        diagnostic.range?.start.offset ?? -1,
        diagnostic.range?.end.offset ?? -1,
        diagnostic.message,
      ].join(":"),
    ),
  );

  const diagnostics = [
    ...result.projectDiagnostics,
    ...result.files.flatMap((file) => file.diagnostics),
  ];

  return diagnostics.filter((diagnostic) => {
    if (diagnostic.suppressed) return false;
    const fingerprint = [
      diagnostic.code,
      diagnostic.uri,
      diagnostic.range?.start.offset ?? -1,
      diagnostic.range?.end.offset ?? -1,
      diagnostic.message,
    ].join(":");
    if (suppressed.has(fingerprint)) return false;
    if (baselineFiltered.has(fingerprint)) return false;
    return true;
  });
}

function appendSkippedFromPlan(summary: FixRunSummary, planSkipped: FixRunSummary["skipped"]) {
  summary.skipped.push(...planSkipped);
  summary.unsafeSkippedDiagnostics += planSkipped.filter(
    (entry) => entry.reason === "unsafe-not-enabled",
  ).length;
}

function createSummarySkippedEntries(plan: ReturnType<typeof planFixes>): FixRunSummary["skipped"] {
  return plan.skipped.map((skipped) => ({
    code: skipped.candidate.diagnosticCode,
    uri: skipped.candidate.uri,
    reason: skipped.reason,
    title: skipped.candidate.title,
  }));
}

export type LintFixEngineCoreState = {
  documents: BtDocument[];
  result: CheckProjectResult;
};

type LintFixEngineCoreInput = {
  options: LintFixEngineOptions;
  getState: () => Promise<LintFixEngineCoreState>;
  getCandidates: (value: {
    documents: LintFixEngineCoreState["documents"];
    diagnostics: Diagnostic[];
  }) => ReturnType<typeof getLintFixCandidates>;
  applyPlan: typeof applyFixPlan;
  parseHasErrors: (value: { uri: string; text: string }) => boolean;
  formatText: (value: { uri: string; text: string }) =>
    | {
        ok: boolean;
        skipped?: boolean;
        text?: string;
      }
    | undefined;
  readCurrentText: (uri: string) => string;
  writeCurrentText: (uri: string, text: string) => void;
  toDisplayPath: (uri: string) => string;
};

function setDryRunPreview(input: {
  options: LintFixEngineOptions;
  summary: FixRunSummary;
  changedUris: Set<string>;
  readCurrentText: (uri: string) => string;
  toDisplayPath: (uri: string) => string;
}) {
  if (!input.options.dryRun) return;
  input.summary.fixedTextByPath = Object.fromEntries(
    [...input.changedUris]
      .sort((left, right) => left.localeCompare(right))
      .map((uri) => [input.toDisplayPath(uri), input.readCurrentText(uri)]),
  );
}

function recordParseFailed(input: {
  summary: FixRunSummary;
  plan: ReturnType<typeof planFixes>;
  originalTextByUri: Map<string, string>;
  writeCurrentText: (uri: string, text: string) => void;
}) {
  input.summary.skipped.push(
    ...input.plan.applied.map((candidate) => ({
      code: candidate.diagnosticCode,
      uri: candidate.uri,
      reason: "parse-failed" as const,
      title: candidate.title,
    })),
  );

  for (const [uri, text] of input.originalTextByUri) {
    input.writeCurrentText(uri, text);
  }
}

function applyFormatting(input: {
  options: LintFixEngineOptions;
  summary: FixRunSummary;
  plan: ReturnType<typeof planFixes>;
  fixedTextByUri: Map<string, string>;
  formatText: LintFixEngineCoreInput["formatText"];
  writeCurrentText: LintFixEngineCoreInput["writeCurrentText"];
}) {
  if (!input.options.formatAfterFix) return;

  for (const [uri, text] of input.fixedTextByUri) {
    const formatted = input.formatText({ uri, text });
    if (!formatted) continue;

    if (!formatted.ok || formatted.skipped || !formatted.text) {
      input.summary.skipped.push(
        ...input.plan.applied
          .filter((candidate) => candidate.uri === uri)
          .map((candidate) => ({
            code: candidate.diagnosticCode,
            uri: candidate.uri,
            reason: "formatter-failed" as const,
            title: candidate.title,
          })),
      );
      continue;
    }

    input.fixedTextByUri.set(uri, formatted.text);
    input.writeCurrentText(uri, formatted.text);
  }
}

function collectChangedUris(input: {
  fixedTextByUri: Map<string, string>;
  originalTextByUri: Map<string, string>;
}) {
  return [...input.fixedTextByUri.entries()]
    .filter(([uri, fixedText]) => fixedText !== input.originalTextByUri.get(uri))
    .map(([uri]) => uri);
}

function detectCircular(input: {
  plan: ReturnType<typeof planFixes>;
  seenHashes: Set<string>;
  readCurrentText: (uri: string) => string;
}) {
  const touchedUris = [...input.plan.touchedUris].sort((a, b) => a.localeCompare(b));
  const stateHash = hashTouchedState({
    uris: touchedUris,
    readTextByUri: input.readCurrentText,
  });
  if (input.seenHashes.has(stateHash)) return true;
  input.seenHashes.add(stateHash);
  return false;
}

export async function runLintFixEngineCore(input: {
  options: LintFixEngineOptions;
  getState: () => Promise<LintFixEngineCoreState>;
  getCandidates: (value: {
    documents: LintFixEngineCoreState["documents"];
    diagnostics: Diagnostic[];
  }) => ReturnType<typeof getLintFixCandidates>;
  applyPlan: typeof applyFixPlan;
  parseHasErrors: (value: { uri: string; text: string }) => boolean;
  formatText: (value: { uri: string; text: string }) =>
    | {
        ok: boolean;
        skipped?: boolean;
        text?: string;
      }
    | undefined;
  readCurrentText: (uri: string) => string;
  writeCurrentText: (uri: string, text: string) => void;
  toDisplayPath: (uri: string) => string;
}): Promise<{
  result: CheckProjectResult;
  summary: FixRunSummary;
}> {
  const maxPasses = input.options.maxPasses ?? 10;
  const summary = createFixRunSummary({
    enabled: true,
    unsafe: input.options.unsafe,
    dryRun: input.options.dryRun,
    maxPasses,
  });

  const seenHashes = new Set<string>();
  const changedUris = new Set<string>();

  let state = await input.getState();
  let result = state.result;

  for (let pass = 1; pass <= maxPasses; pass++) {
    summary.passes = pass;

    const diagnostics = collectFixDiagnostics(result);
    const candidates = input.getCandidates({ documents: state.documents, diagnostics });
    const textByUri = new Map(
      state.documents.map((document) => [document.uri, document.originalText]),
    );
    const plan = planFixes({
      pass,
      candidates,
      textByUri,
      unsafe: input.options.unsafe,
    });

    appendSkippedFromPlan(summary, createSummarySkippedEntries(plan));

    if (plan.applied.length === 0) {
      summary.changedFiles = changedUris.size;
      setDryRunPreview({
        options: input.options,
        summary,
        changedUris,
        readCurrentText: input.readCurrentText,
        toDisplayPath: input.toDisplayPath,
      });
      return { result, summary };
    }

    const applied = await input.applyPlan({
      plan,
      dryRun: false,
      readText: input.readCurrentText,
      writeText: input.writeCurrentText,
    });

    const parseFailed = [...applied.fixedTextByUri.entries()].some(([uri, text]) =>
      input.parseHasErrors({ uri, text }),
    );

    if (parseFailed) {
      recordParseFailed({
        summary,
        plan,
        originalTextByUri: applied.originalTextByUri,
        writeCurrentText: input.writeCurrentText,
      });

      state = await input.getState();
      result = state.result;
      summary.changedFiles = changedUris.size;
      setDryRunPreview({
        options: input.options,
        summary,
        changedUris,
        readCurrentText: input.readCurrentText,
        toDisplayPath: input.toDisplayPath,
      });
      return { result, summary };
    }

    applyFormatting({
      options: input.options,
      summary,
      plan,
      fixedTextByUri: applied.fixedTextByUri,
      formatText: input.formatText,
      writeCurrentText: input.writeCurrentText,
    });

    const changedThisPass = collectChangedUris({
      fixedTextByUri: applied.fixedTextByUri,
      originalTextByUri: applied.originalTextByUri,
    });

    for (const uri of changedThisPass) {
      changedUris.add(uri);
    }

    summary.appliedDiagnostics += plan.applied.length;
    summary.appliedEdits += plan.applied.reduce(
      (sum, candidate) => sum + candidate.edits.length,
      0,
    );
    summary.unsafeAppliedDiagnostics += plan.applied.filter(
      (candidate) => candidate.safety === "unsafe",
    ).length;
    summary.changedFiles = changedUris.size;

    if (detectCircular({ plan, seenHashes, readCurrentText: input.readCurrentText })) {
      summary.circularFixesDetected = true;
      state = await input.getState();
      result = state.result;
      setDryRunPreview({
        options: input.options,
        summary,
        changedUris,
        readCurrentText: input.readCurrentText,
        toDisplayPath: input.toDisplayPath,
      });
      return { result, summary };
    }

    state = await input.getState();
    result = state.result;
  }

  summary.changedFiles = changedUris.size;
  setDryRunPreview({
    options: input.options,
    summary,
    changedUris,
    readCurrentText: input.readCurrentText,
    toDisplayPath: input.toDisplayPath,
  });
  return { result, summary };
}

export async function runLintFixEngine(input: {
  project: BtxmlProject;
  host: ProjectHost;
  options: LintFixEngineOptions;
}): Promise<{
  result: CheckProjectResult;
  summary: FixRunSummary;
}> {
  const shadowTextByUri = new Map<string, string>();
  const baseProjectDiagnostics = [...(input.options.projectDiagnostics ?? [])];

  const host: ProjectHost = {
    ...input.host,
    async readFile(uri: string) {
      if (shadowTextByUri.has(uri)) {
        return shadowTextByUri.get(uri) ?? "";
      }
      return input.host.readFile(uri);
    },
  };

  async function getState(): Promise<LintFixEngineCoreState> {
    const loaded = await loadProjectDocuments(input.project, host);
    const result = await checkProject({
      project: input.project,
      documents: loaded.documents,
      externalModelDocuments: loaded.externalModelDocuments,
      mode: "lint",
      showSuppressed: input.options.showSuppressed,
      baseline: input.options.baseline,
      maxWarnings: input.options.maxWarnings,
      includeRawDiagnostics: true,
      projectDiagnostics: [...baseProjectDiagnostics, ...loaded.diagnostics],
      host,
    });
    return {
      documents: loaded.documents,
      result,
    };
  }

  function readCurrentText(uri: string): string {
    if (shadowTextByUri.has(uri)) return shadowTextByUri.get(uri) ?? "";
    return readText(resolvePathFromUri(input.project, uri));
  }

  function writeCurrentText(uri: string, text: string) {
    if (input.options.dryRun) {
      shadowTextByUri.set(uri, text);
      return;
    }

    shadowTextByUri.set(uri, text);
    writeTextAtomic(resolvePathFromUri(input.project, uri), text);
  }

  return runLintFixEngineCore({
    options: input.options,
    getState,
    getCandidates: ({ documents, diagnostics }) => getLintFixCandidates({ documents, diagnostics }),
    applyPlan: applyFixPlan,
    parseHasErrors: ({ uri, text }) => {
      const parsed = parseBtXml(text, { uri });
      return parsed.diagnostics.some(
        (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
      );
    },
    formatText: ({ uri, text }) => {
      if (!input.options.resolvedConfig) return undefined;
      const filePath = resolvePathFromUri(input.project, uri);
      const effective = getEffectiveConfigForFile(input.options.resolvedConfig, filePath);
      return formatBtXml(text, {
        indentWidth: effective.formatter.indentWidth,
        xmlDeclaration: effective.formatter.xmlDeclaration,
        blankLineBetweenBehaviorTrees: effective.formatter.blankLineBetweenBehaviorTrees,
        lineEnding: effective.formatter.lineEnding,
        force: false,
      });
    },
    readCurrentText,
    writeCurrentText,
    toDisplayPath: (uri) => toDisplayPath(input.project, uri),
  });
}
