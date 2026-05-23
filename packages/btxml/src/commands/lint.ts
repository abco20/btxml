import type { ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
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
import type { CommandModule } from "yargs";
import { runLintCommand } from "../context.ts";
import { hasFailingDiagnostics } from "../diagnostics.ts";
import { CliError } from "../errors.ts";
import { runLintFixEngine } from "../fix/engine.ts";
import { formatFixSummaryLines } from "../fix/report.ts";
import type { FixRunSummary } from "../fix/types.ts";
import { readText } from "../io.ts";
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
  fixDryRun?: boolean;
  unsafe?: boolean;
  fixMaxPasses?: number;
  fixNoFormat?: boolean;
};

type LoadedLintState = {
  documents: Awaited<ReturnType<typeof loadProjectDocuments>>["documents"];
  externalModelDocuments: Awaited<
    ReturnType<typeof loadProjectDocuments>
  >["externalModelDocuments"];
  externalDiagnostics: Awaited<ReturnType<typeof loadProjectDocuments>>["diagnostics"];
};

async function loadLintState(
  project: BtxmlProject,
  host: ReturnType<typeof createNodeProjectHost>,
) {
  const loaded = await loadProjectDocuments(project, host);
  return {
    documents: loaded.documents,
    externalModelDocuments: loaded.externalModelDocuments,
    externalDiagnostics: loaded.diagnostics,
  } satisfies LoadedLintState;
}

async function runLintCheck(input: {
  project: BtxmlProject;
  host: ReturnType<typeof createNodeProjectHost>;
  state: LoadedLintState;
  options: LintRunOptions;
}) {
  return checkProject({
    project: input.project,
    documents: input.state.documents,
    externalModelDocuments: input.state.externalModelDocuments,
    mode: "lint",
    showSuppressed: input.options.showSuppressed,
    baseline: input.options.baseline,
    maxWarnings: input.options.maxWarnings,
    includeRawDiagnostics: true,
    projectDiagnostics: [
      ...(input.options.projectDiagnostics || []),
      ...input.state.externalDiagnostics,
    ],
    host: input.host,
  });
}

function toFileReports(result: Awaited<ReturnType<typeof checkProject>>): FileReport[] {
  return result.files.map((file) => ({
    path: file.path,
    diagnostics: file.diagnostics,
    rawDiagnostics: file.rawDiagnostics,
    skipped: file.skipped,
    skipReason: file.skipReason,
  }));
}

function buildHumanSourceTextMap(input: {
  project: BtxmlProject;
  fixSummary?: FixRunSummary;
}) {
  const texts = new Map<string, string>();
  for (const file of [
    ...getNodeProjectSelectedFiles(input.project),
    ...getNodeProjectModelFiles(input.project),
  ]) {
    if (texts.has(file.path)) continue;
    texts.set(file.path, readText(file.absolutePath));
  }

  if (input.fixSummary?.dryRun && input.fixSummary.fixedTextByPath) {
    for (const [path, text] of Object.entries(input.fixSummary.fixedTextByPath)) {
      texts.set(path, text);
    }
  }

  return texts;
}

function printHumanLintOutput(input: {
  project: BtxmlProject;
  options: LintRunOptions;
  ok: boolean;
  reports: FileReport[];
  projectDiagnostics: Diagnostic[];
  summary: ReturnType<typeof summarizeDiagnostics>;
  resultSummary: Awaited<ReturnType<typeof checkProject>>["summary"];
  fixSummary?: FixRunSummary;
}) {
  if (input.fixSummary) {
    for (const line of formatFixSummaryLines(input.fixSummary)) {
      console.log(line);
    }
  }

  const texts = buildHumanSourceTextMap({
    project: input.project,
    fixSummary: input.fixSummary,
  });

  const printed = printProjectDiagnostics(input.projectDiagnostics, input.options.reporter, texts);
  if (printed) console.error(printed);

  for (const report of input.reports) {
    const text = printDiagnostics(report.path, report.diagnostics, input.options.reporter, texts);
    if (text) console.error(text);
  }

  const staleCount = input.resultSummary?.staleEntries?.length;
  const lintSummary = printCheckSummary(
    input.ok,
    input.reports.length,
    staleCount,
    "lint",
    input.summary.errors,
    input.summary.warnings,
    input.options.maxWarnings === 0,
  );

  if (input.ok) {
    if (!input.fixSummary) {
      console.log(lintSummary);
    } else if (input.fixSummary.appliedDiagnostics === 0) {
      console.log("ok: lint passed");
    }
    return;
  }

  console.error(lintSummary);
  const staleNote = printStaleBaselineNote(staleCount);
  if (staleNote) console.error(staleNote);
}

async function runLintFixIfNeeded(input: {
  project: BtxmlProject;
  host: ReturnType<typeof createNodeProjectHost>;
  options: LintRunOptions;
}) {
  if (!input.options.fix && !input.options.fixDryRun) return undefined;

  return runLintFixEngine({
    project: input.project,
    host: input.host,
    options: {
      unsafe: input.options.unsafe === true,
      dryRun: input.options.fixDryRun === true,
      maxPasses: input.options.fixMaxPasses ?? 10,
      formatAfterFix: input.options.fixNoFormat !== true,
      resolvedConfig: input.options.resolvedConfig,
      baseline: input.options.baseline,
      maxWarnings: input.options.maxWarnings,
      showSuppressed: input.options.showSuppressed,
      projectDiagnostics: input.options.projectDiagnostics ?? [],
    },
  });
}

export async function runLint(project: BtxmlProject, options: LintRunOptions) {
  const host = createNodeProjectHost(getNodeProjectRootDir(project));
  const state = await loadLintState(project, host);
  let result = await runLintCheck({ project, host, state, options });

  let fixSummary: FixRunSummary | undefined;
  const fixed = await runLintFixIfNeeded({ project, host, options });
  if (fixed) {
    result = fixed.result;
    fixSummary = fixed.summary;
  }

  const projectDiagnostics = [...(options.projectDiagnostics || []), ...result.projectDiagnostics];
  const reports = toFileReports(result);

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
        fixes: fixSummary,
      }),
    );
  }

  if (!options.quiet && options.reporter === "human") {
    printHumanLintOutput({
      project,
      options,
      ok,
      reports,
      projectDiagnostics,
      summary,
      resultSummary: result.summary,
      fixSummary,
    });
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
      .option("fix-dry-run", { type: "boolean" })
      .option("unsafe", { type: "boolean" })
      .option("fix-max-passes", { type: "number" })
      .option("fix-no-format", { type: "boolean" })
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
