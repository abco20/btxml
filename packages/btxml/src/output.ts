import type { Diagnostic } from "@btxml/foundation";
import { collectDiagnostics } from "./diagnostics.ts";
import { renderHumanDiagnostics } from "./render/human-diagnostic.ts";

declare const __BTXML_VERSION__: string | undefined;

export const TOOL_VERSION = typeof __BTXML_VERSION__ === "string" ? __BTXML_VERSION__ : "unknown";

export type FileReport = {
  path: string;
  diagnostics: Diagnostic[];
  rawDiagnostics?: Diagnostic[];
  needsFormat?: boolean;
  formatted?: string;
  skipped?: boolean;
  skipReason?: string;
};

export function collectAllDiagnostics(input: {
  projectDiagnostics: Diagnostic[];
  files: FileReport[];
}) {
  return collectDiagnostics([
    input.projectDiagnostics,
    input.files.flatMap((file) => file.diagnostics),
  ]);
}

export function summarizeDiagnostics(input: {
  projectDiagnostics: Diagnostic[];
  files: FileReport[];
}) {
  const diagnostics = collectAllDiagnostics(input);
  return {
    files: input.files.length,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    infos: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length,
    suppressed: 0,
    baselineFiltered: 0,
  };
}

export function printDiagnostics(
  filePath: string | undefined,
  diagnostics: Diagnostic[],
  output = "human",
  sourceTextByUri?: Map<string, string>,
) {
  if (output !== "human") return "";
  return renderHumanDiagnostics({
    diagnostics,
    defaultPath: filePath,
    sourceTextByUri,
  });
}

export function printProjectDiagnostics(
  diagnostics: Diagnostic[],
  output = "human",
  sourceTextByUri?: Map<string, string>,
) {
  if (diagnostics.length === 0) return "";
  if (output !== "human") return "";
  return renderHumanDiagnostics({
    diagnostics,
    sourceTextByUri,
  });
}

export function toJsonFileReport(
  filePath: string,
  diagnostics: Diagnostic[],
  needsFormat = false,
): FileReport {
  return { path: filePath, needsFormat, diagnostics };
}

export function summarizeReports(files: FileReport[]) {
  const diagnostics = files.flatMap((file) => file.diagnostics);
  return {
    files: files.length,
    errors: diagnostics.filter((diag) => diag.severity === "error").length,
    warnings: diagnostics.filter((diag) => diag.severity === "warning").length,
    infos: diagnostics.filter((diag) => diag.severity === "info").length,
    formatErrors: files.filter((file) => file.needsFormat).length,
  };
}

export function toJsonReport(input: {
  ok: boolean;
  files: FileReport[];
  projectDiagnostics?: Diagnostic[];
  summary?: { suppressed?: number; baselineFiltered?: number };
}) {
  const files = [...input.files]
    .map((file) => {
      const { sourceText, rawDiagnostics, formatted, ...rest } = file as FileReport & {
        sourceText?: string;
      };
      return {
        ...rest,
        diagnostics: collectDiagnostics([rest.diagnostics]),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const projectDiagnostics = collectDiagnostics([input.projectDiagnostics ?? []]);
  const summary = summarizeDiagnostics({ projectDiagnostics, files });
  return JSON.stringify(
    {
      ok: input.ok,
      version: 2,
      schemaVersion: "2",
      toolVersion: TOOL_VERSION,
      project: {},
      projectDiagnostics,
      files,
      summary: {
        ...summary,
        suppressed: input.summary?.suppressed || 0,
        baselineFiltered: input.summary?.baselineFiltered || 0,
      },
    },
    null,
    2,
  );
}

export function printCheckSummary(
  ok: boolean,
  count: number,
  staleCount: number | undefined,
  command: "check" | "lint",
  errors: number,
  warnings: number,
  warningsAsErrors: boolean,
) {
  if (ok) {
    const verb = command === "lint" ? "linted" : "checked";
    return `ok: ${verb} ${count} files`;
  }
  const verb = command === "lint" ? "lint" : "check";
  if (warningsAsErrors && errors === 0 && warnings > 0) {
    return `error: ${verb} failed with 0 errors and ${warnings} warnings treated as errors in ${count} files`;
  }
  return `error: ${verb} failed with ${errors} errors and ${warnings} warnings in ${count} files`;
}

export function printStaleBaselineNote(staleCount: number | undefined) {
  if (!staleCount || staleCount === 0) return "";
  return `note: ${staleCount} stale baseline entries were found`;
}

export function printFormatHint(filePath: string): string {
  return renderHumanDiagnostics({
    diagnostics: [
      {
        code: "BTXML_FORMAT",
        severity: "error",
        message: "file is not formatted",
        uri: filePath,
        details: {
          help: `run \`btxmlc format ${filePath}\``,
        },
      },
    ],
  });
}

export function printFormatDiffHint(filePath: string) {
  return printFormatHint(filePath);
}
