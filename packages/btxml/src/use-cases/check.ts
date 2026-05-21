import path from "node:path";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import { formatBtXml, getEffectiveConfigForFile } from "@btxml/core";
import { type Diagnostic, DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import {
  type BtxmlProject,
  type DiagnosticBaseline,
  checkProject,
  loadProjectDocuments,
} from "@btxml/project";
import {
  createNodeProjectHost,
  getNodeProjectModelFiles,
  getNodeProjectRootDir,
  getNodeProjectSelectedFiles,
} from "@btxml/project/node";
import { hasFailingDiagnostics } from "../diagnostics.ts";
import { unifiedDiff } from "../diff.ts";
import { readText } from "../io.ts";
import {
  type FileReport,
  collectAllDiagnostics,
  printCheckSummary,
  printDiagnostics,
  printProjectDiagnostics,
  printStaleBaselineNote,
  summarizeDiagnostics,
  toJsonReport,
} from "../output.ts";

function dedupeByPath<T extends { path: string }>(files: T[]) {
  return [...new Map(files.map((file) => [file.path, file])).values()];
}

export type CheckRunOptions = {
  reporter: "human" | "json";
  quiet?: boolean;
  diff?: boolean;
  noFormat?: boolean;
  noLint?: boolean;
  formatOnly?: boolean;
  lintOnly?: boolean;
  resolvedConfig?: ResolvedBtxmlConfig;
  maxWarnings?: number;
  showSkipped?: boolean;
  showSuppressed?: boolean;
  baseline?: DiagnosticBaseline;
  updateBaseline?: boolean | string;
  projectDiagnostics?: Diagnostic[];
};

function formatDiagnostics(file: string, input: string, options: CheckRunOptions) {
  if (options.noFormat || options.lintOnly) {
    return {
      diagnostics: [] as Diagnostic[],
      needsFormat: false,
      formatted: undefined as string | undefined,
    };
  }
  if (!options.resolvedConfig) {
    return {
      diagnostics: [] as Diagnostic[],
      needsFormat: false,
      formatted: undefined as string | undefined,
    };
  }
  const effective = getEffectiveConfigForFile(options.resolvedConfig, file);
  const formatted = formatBtXml(input, {
    indentWidth: effective.formatter.indentWidth,
    xmlDeclaration: effective.formatter.xmlDeclaration,
    blankLineBetweenBehaviorTrees: effective.formatter.blankLineBetweenBehaviorTrees,
    lineEnding: effective.formatter.lineEnding,
  });
  const diagnostics: Diagnostic[] = [];
  let needsFormat = false;
  if (formatted.ok && !formatted.skipped) {
    needsFormat = formatted.text !== input;
  }
  if (needsFormat) {
    diagnostics.push(
      createDiagnostic(
        "BTXML_FORMAT",
        DiagnosticSeverity.Error,
        "file is not formatted",
        undefined,
        file,
        { help: `run \`btxml format ${file}\`` },
      ),
    );
  }
  return {
    diagnostics: [...formatted.diagnostics, ...diagnostics],
    needsFormat,
    formatted: formatted.ok && !formatted.skipped ? formatted.text : undefined,
    skipped: formatted.skipped,
  };
}

export async function runCheck(project: BtxmlProject, options: CheckRunOptions) {
  const projectRoot = getNodeProjectRootDir(project);
  const host = createNodeProjectHost(projectRoot);
  const {
    documents,
    externalModelDocuments,
    diagnostics: externalDiagnostics,
  } = await loadProjectDocuments(project, host);
  const texts = new Map<string, string>();
  for (const file of getNodeProjectSelectedFiles(project)) {
    texts.set(file.path, readText(file.absolutePath));
  }

  const lintResult =
    options.noLint || options.formatOnly
      ? undefined
      : await checkProject({
          project,
          documents,
          externalModelDocuments,
          mode: "check",
          showSuppressed: options.showSuppressed,
          baseline: options.baseline,
          maxWarnings: options.maxWarnings,
          includeRawDiagnostics: true,
          projectDiagnostics: [...(options.projectDiagnostics || []), ...externalDiagnostics],
          host,
        });

  const projectDiagnostics = lintResult?.projectDiagnostics ?? options.projectDiagnostics ?? [];
  const lintByPath = new Map((lintResult?.files || []).map((file) => [file.path, file] as const));
  const reports: FileReport[] = [];

  const fallbackFiles = dedupeByPath([
    ...getNodeProjectSelectedFiles(project),
    ...getNodeProjectModelFiles(project),
  ]).map((file) => {
    const originalText = readText(file.absolutePath);
    texts.set(file.path, originalText);
    return {
      path: file.path,
      uri: file.path,
      diagnostics: [] as Diagnostic[],
      originalText,
    };
  });

  const targetFiles = lintResult?.files || fallbackFiles;
  for (const file of targetFiles) {
    const input = texts.get(file.path) ?? readText(path.resolve(projectRoot, file.path));
    const format = formatDiagnostics(file.path, input, options);
    const lint = lintByPath.get(file.path);
    const diagnostics = [...(lint?.diagnostics || file.diagnostics || []), ...format.diagnostics];
    const report: FileReport = {
      path: file.path,
      diagnostics,
      rawDiagnostics: lint?.rawDiagnostics,
      needsFormat: format.needsFormat,
      skipped: lint?.skipped,
      skipReason: lint?.skipReason,
      formatted: format.formatted,
    };
    reports.push(report);
  }

  const allDiagnostics = collectAllDiagnostics({
    projectDiagnostics,
    files: reports,
  });
  const ok = !hasFailingDiagnostics(allDiagnostics, options.maxWarnings);
  const summary = summarizeDiagnostics({
    projectDiagnostics,
    files: reports,
  });

  if (options.reporter === "json") {
    console.log(
      toJsonReport({
        ok,
        files: reports,
        projectDiagnostics,
        summary: lintResult?.summary,
      }),
    );
  }

  if (!options.quiet && options.reporter === "human") {
    const printed = printProjectDiagnostics(projectDiagnostics, options.reporter, texts);
    if (printed) console.error(printed);
    for (const report of reports) {
      const input = texts.get(report.path) ?? "";
      const text = printDiagnostics(report.path, report.diagnostics, options.reporter, texts);
      if (text) console.error(text);
      if (report.needsFormat && options.diff && report.formatted) {
        console.log(unifiedDiff(input, report.formatted, report.path));
      }
    }
    const staleCount = lintResult?.summary?.staleEntries?.length;
    const checkSummary = printCheckSummary(
      ok,
      reports.length,
      staleCount,
      "check",
      summary.errors,
      summary.warnings,
      options.maxWarnings === 0,
    );
    if (ok) {
      console.log(checkSummary);
    } else {
      console.error(checkSummary);
      const staleNote = printStaleBaselineNote(staleCount);
      if (staleNote) console.error(staleNote);
    }
  }

  return {
    ok,
    files: reports,
    projectDiagnostics,
    summary,
  };
}
