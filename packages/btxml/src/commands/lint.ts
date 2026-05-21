import type { ResolvedBtxmlConfig } from "@btxml/config";
import { type Diagnostic, applyTextEdits } from "@btxml/foundation";
import {
  type BtxmlProject,
  type DiagnosticBaseline,
  checkProject,
  loadProjectDocuments,
} from "@btxml/project";
import {
  createNodeProjectHost,
  fileUriToPath,
  getNodeProjectRootDir,
  getNodeProjectSelectedFiles,
} from "@btxml/project/node";
import type { CommandModule } from "yargs";
import { runLintCommand } from "../context.ts";
import { hasFailingDiagnostics } from "../diagnostics.ts";
import { CliError } from "../errors.ts";
import { readText, writeTextAtomic } from "../io.ts";
import { parseCommandOptions } from "../options/common.ts";
import { lintOptionsSchema } from "../options/lint.ts";
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
import { getSafeLintFixes } from "../repair/lint-fixes.ts";

type LintRunOptions = {
  reporter: "human" | "json";
  quiet?: boolean;
  resolvedConfig?: ResolvedBtxmlConfig;
  maxWarnings?: number;
  showSkipped?: boolean;
  showSuppressed?: boolean;
  baseline?: DiagnosticBaseline;
  updateBaseline?: boolean | string;
  projectDiagnostics?: Diagnostic[];
  fix?: boolean;
};

export async function runLint(project: BtxmlProject, options: LintRunOptions) {
  const host = createNodeProjectHost(getNodeProjectRootDir(project));
  let {
    documents,
    externalModelDocuments,
    diagnostics: externalDiagnostics,
  } = await loadProjectDocuments(project, host);

  let result = await checkProject({
    project,
    documents,
    externalModelDocuments,
    mode: "lint",
    showSuppressed: options.showSuppressed,
    baseline: options.baseline,
    maxWarnings: options.maxWarnings,
    includeRawDiagnostics: true,
    projectDiagnostics: [...(options.projectDiagnostics || []), ...externalDiagnostics],
    host,
  });

  let fixedCount = 0;
  let fixedFiles = 0;

  if (options.fix) {
    const allDiagnostics = [
      ...(options.projectDiagnostics || []),
      ...result.projectDiagnostics,
      ...result.files.flatMap((f) => f.rawDiagnostics ?? f.diagnostics),
    ];
    const fixes = getSafeLintFixes({ documents, diagnostics: allDiagnostics });
    if (fixes.length > 0) {
      const seenUris = new Set<string>();
      for (const edit of fixes) {
        const file = getNodeProjectSelectedFiles(project).find(
          (f) => f.absolutePath === edit.uri || f.path === edit.uri || f.uri === edit.uri,
        );
        const filePath =
          file?.absolutePath ??
          (edit.uri.startsWith("file://") ? fileUriToPath(edit.uri) : edit.uri);
        const text = readText(filePath);
        const newText = applyTextEdits(text, edit.edits);
        writeTextAtomic(filePath, newText);
        if (!seenUris.has(edit.uri)) {
          seenUris.add(edit.uri);
          fixedFiles++;
        }
        fixedCount += edit.edits.length;
      }
      // Reload and re-check after fixes
      const reload = await loadProjectDocuments(project, host);
      documents = reload.documents;
      externalModelDocuments = reload.externalModelDocuments;
      externalDiagnostics = reload.diagnostics;
      result = await checkProject({
        project,
        documents,
        externalModelDocuments,
        mode: "lint",
        showSuppressed: options.showSuppressed,
        baseline: options.baseline,
        maxWarnings: options.maxWarnings,
        includeRawDiagnostics: true,
        projectDiagnostics: [...(options.projectDiagnostics || []), ...externalDiagnostics],
        host,
      });
    }
  }

  const projectDiagnostics = [...(options.projectDiagnostics || []), ...result.projectDiagnostics];

  const reports: FileReport[] = result.files.map((file) => ({
    path: file.path,
    diagnostics: file.diagnostics,
    rawDiagnostics: file.rawDiagnostics,
    skipped: file.skipped,
    skipReason: file.skipReason,
  }));

  const ok = !hasFailingDiagnostics(
    collectAllDiagnostics({ projectDiagnostics, files: reports }),
    options.maxWarnings,
  );
  const summary = summarizeDiagnostics({ projectDiagnostics, files: reports });

  if (options.reporter === "json") {
    console.log(
      toJsonReport({
        ok,
        files: reports,
        projectDiagnostics,
        summary: result.summary,
      }),
    );
  }

  if (!options.quiet && options.reporter === "human") {
    if (options.fix) {
      if (fixedCount > 0) {
        console.log(
          `fixed ${fixedCount} problem${fixedCount === 1 ? "" : "s"} in ${fixedFiles} file${fixedFiles === 1 ? "" : "s"}`,
        );
      } else {
        console.log("fixed 0 problems");
      }
    }
    const texts = new Map<string, string>();
    for (const file of getNodeProjectSelectedFiles(project)) {
      texts.set(file.path, readText(file.absolutePath));
    }
    const printed = printProjectDiagnostics(projectDiagnostics, options.reporter, texts);
    if (printed) console.error(printed);
    for (const report of reports) {
      const text = printDiagnostics(report.path, report.diagnostics, options.reporter, texts);
      if (text) console.error(text);
    }
    const staleCount = result.summary?.staleEntries?.length;
    const lintSummary = printCheckSummary(
      ok,
      reports.length,
      staleCount,
      "lint",
      summary.errors,
      summary.warnings,
      options.maxWarnings === 0,
    );
    if (ok) {
      if (!options.fix) {
        console.log(lintSummary);
      } else if (fixedCount === 0) {
        console.log("ok: lint passed");
      }
    } else {
      console.error(lintSummary);
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

export const lintCommand: CommandModule = {
  command: "lint [files..]",
  describe: "Lint BT/XML files",
  builder: (yargs) =>
    yargs
      .positional("files", { type: "string", array: true })
      .option("config", { type: "string" })
      .option("project-root", { type: "string" })
      .option("no-config", { type: "boolean" })
      .option("quiet", { type: "boolean" })
      .option("verbose", { type: "boolean" })
      .option("no-color", { type: "boolean" })
      .option("output", { type: "string" })
      .option("reporter", { type: "string" })
      .option("json", { type: "boolean" })
      .option("warnings-as-errors", { type: "boolean" })
      .option("max-warnings", { type: "number" })
      .option("show-skipped", { type: "boolean" })
      .option("show-suppressed", { type: "boolean" })
      .option("baseline", { type: "string" })
      .option("update-baseline", { type: "string" })
      .option("no-baseline", { type: "boolean" })
      .option("fix", { type: "boolean" })
      .option("stdout", { type: "boolean", hidden: true }),
  handler: async (argv) => {
    if (argv.stdout) {
      throw new CliError(
        "--stdout is not supported for `lint`",
        2,
        "use `--output json` for machine-readable output",
      );
    }
    const options = parseCommandOptions(lintOptionsSchema, argv);
    process.exitCode = await runLintCommand(options);
  },
};
