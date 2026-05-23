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

function dedupeDocumentsByUri(documents: BtDocument[]): BtDocument[] {
  const map = new Map<string, BtDocument>();
  for (const document of documents) {
    map.set(document.uri, document);
  }
  return [...map.values()];
}

function skippedSummaryKey(entry: FixRunSummary["skipped"][number]) {
  return `${entry.code}\u0000${entry.uri}\u0000${entry.reason}\u0000${entry.title}`;
}

function appendSkippedEntries(input: {
  summary: FixRunSummary;
  dedupeKeys: Set<string>;
  entries: FixRunSummary["skipped"];
}) {
  for (const entry of input.entries) {
    const key = skippedSummaryKey(entry);
    if (input.dedupeKeys.has(key)) continue;
    input.dedupeKeys.add(key);
    input.summary.skipped.push(entry);
  }
  input.summary.unsafeSkippedDiagnostics = input.summary.skipped.filter(
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
  externalModelDocuments: BtDocument[];
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
  dedupeKeys: Set<string>;
  summary: FixRunSummary;
  plan: ReturnType<typeof planFixes>;
  originalTextByUri: Map<string, string>;
  writeCurrentText: (uri: string, text: string) => void;
}) {
  appendSkippedEntries({
    summary: input.summary,
    dedupeKeys: input.dedupeKeys,
    entries: input.plan.applied.map((candidate) => ({
      code: candidate.diagnosticCode,
      uri: candidate.uri,
      reason: "parse-failed" as const,
      title: candidate.title,
    })),
  });

  for (const [uri, text] of input.originalTextByUri) {
    input.writeCurrentText(uri, text);
  }
}

function formatAndValidate(input: {
  options: LintFixEngineOptions;
  fixedTextByUri: Map<string, string>;
  parseHasErrors: LintFixEngineCoreInput["parseHasErrors"];
  formatText: LintFixEngineCoreInput["formatText"];
  writeCurrentText: LintFixEngineCoreInput["writeCurrentText"];
}): { ok: boolean } {
  if (!input.options.formatAfterFix) return { ok: true };

  for (const [uri, text] of input.fixedTextByUri) {
    const formatted = input.formatText({ uri, text });
    if (!formatted) continue;

    if (!formatted.ok || formatted.skipped || !formatted.text) {
      return { ok: false };
    }

    if (input.parseHasErrors({ uri, text: formatted.text })) {
      return { ok: false };
    }

    input.fixedTextByUri.set(uri, formatted.text);
    input.writeCurrentText(uri, formatted.text);
  }

  return { ok: true };
}

function recordFormatterFailed(input: {
  dedupeKeys: Set<string>;
  summary: FixRunSummary;
  plan: ReturnType<typeof planFixes>;
  originalTextByUri: Map<string, string>;
  writeCurrentText: (uri: string, text: string) => void;
}) {
  appendSkippedEntries({
    summary: input.summary,
    dedupeKeys: input.dedupeKeys,
    entries: input.plan.applied.map((candidate) => ({
      code: candidate.diagnosticCode,
      uri: candidate.uri,
      reason: "formatter-failed" as const,
      title: candidate.title,
    })),
  });

  for (const [uri, text] of input.originalTextByUri) {
    input.writeCurrentText(uri, text);
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
  const skippedDedupeKeys = new Set<string>();
  const changedUris = new Set<string>();

  let state = await input.getState();
  let result = state.result;

  for (let pass = 1; pass <= maxPasses; pass++) {
    summary.passes = pass;

    const diagnostics = collectFixDiagnostics(result);
    const allDocuments = dedupeDocumentsByUri([
      ...state.documents,
      ...state.externalModelDocuments,
    ]);
    let candidates = input.getCandidates({
      documents: allDocuments,
      diagnostics,
    });
    if (process.env.BTXML_TEST_FORCE_OVERLAP_SKIP === "1" && candidates[0]) {
      const first = candidates[0];
      candidates = [
        ...candidates,
        {
          ...first,
          id: `${first.id}#overlap-test`,
          diagnosticCode: `${first.diagnosticCode}__OVERLAP_TEST`,
          title: `${first.title} (overlap-test)`,
        },
      ];
    }
    const textByUri = new Map(
      allDocuments.map((document) => [document.uri, document.originalText]),
    );
    const plan = planFixes({
      pass,
      candidates,
      textByUri,
      unsafe: input.options.unsafe,
    });

    appendSkippedEntries({
      summary,
      dedupeKeys: skippedDedupeKeys,
      entries: createSummarySkippedEntries(plan),
    });

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
        dedupeKeys: skippedDedupeKeys,
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

    const formatResult = formatAndValidate({
      options: input.options,
      fixedTextByUri: applied.fixedTextByUri,
      parseHasErrors: input.parseHasErrors,
      formatText: input.formatText,
      writeCurrentText: input.writeCurrentText,
    });

    if (!formatResult.ok) {
      recordFormatterFailed({
        dedupeKeys: skippedDedupeKeys,
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
      externalModelDocuments: loaded.externalModelDocuments,
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
      const filePath = toDisplayPath(input.project, uri);
      const effective = getEffectiveConfigForFile(input.options.resolvedConfig, filePath);
      if (process.env.BTXML_TEST_FORCE_INVALID_FORMATTER_OUTPUT === "1") {
        return {
          ok: true,
          text: "<root",
        };
      }
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
