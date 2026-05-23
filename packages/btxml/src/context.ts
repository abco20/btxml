import type { ResolvedBtxmlConfig } from "@btxml/config";
import { getNodeProjectModelFiles, getNodeProjectSelectedFiles } from "@btxml/project/node";
import { maybeUpdateBaseline, resolveBaseline } from "./baseline-options.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runExplain } from "./commands/explain.ts";
import { runInit } from "./commands/init.ts";
import { runLanguageServer } from "./commands/language-server.ts";
import { runLint } from "./commands/lint.ts";
import { runRepair } from "./commands/repair.ts";
import { CliError } from "./errors.ts";
import { resolveFiles } from "./glob.ts";
import { discoverCommandProject } from "./project-context.ts";
import { runCheck } from "./use-cases/check.ts";
import { runFormat } from "./use-cases/format.ts";

export type ProjectCommandOptions = {
  _?: string[];
  files?: string[];
  configPath?: string;
  projectRoot?: string;
  noConfig?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  noColor?: boolean;
  output?: "human" | "json";
  json?: boolean;
  check?: boolean;
  diff?: boolean;
  stdout?: boolean;
  write?: boolean;
  force?: boolean;
  reporter?: "human" | "json";
  maxWarnings?: number;
  showSkipped?: boolean;
  showSuppressed?: boolean;
  baseline?: string;
  updateBaseline?: string;
  noBaseline?: boolean;
  noFormat?: boolean;
  noLint?: boolean;
  formatOnly?: boolean;
  lintOnly?: boolean;
  fix?: boolean;
  fixDryRun?: boolean;
  unsafe?: boolean;
  fixMaxPasses?: number;
  fixNoFormat?: boolean;
  show?: string;
};

type FormatRunOptions = ProjectCommandOptions & {
  output: "human" | "json";
  config: ResolvedBtxmlConfig;
};

function resolveExplicitTargets(targets: string[]) {
  return resolveFiles(
    targets.map((target) => target.replace(/\\/g, "/")),
    process.cwd(),
    [],
  );
}

export async function runFormatCommand(options: ProjectCommandOptions): Promise<number> {
  const projectResult = await discoverCommandProject("format", options);
  if (!projectResult) return 2;

  const output: "human" | "json" = options.output ?? "human";
  const runOptions: FormatRunOptions = {
    ...options,
    output,
    config: projectResult.resolvedConfig,
  };

  if (options.stdout) {
    const explicitTargets = resolveExplicitTargets(options.files ?? []);
    if (explicitTargets.length !== 1) {
      throw new CliError(
        "`--stdout` requires exactly one file",
        2,
        "pass exactly one XML file when using `--stdout`",
      );
    }
    if (options.check) {
      throw new CliError(
        "`--stdout` cannot be used with `--check`",
        2,
        "remove either `--stdout` or `--check`",
      );
    }
    if (options.diff) {
      throw new CliError(
        "`--stdout` cannot be used with `--diff`",
        2,
        "remove either `--stdout` or `--diff`",
      );
    }
    return runFormat(explicitTargets, runOptions).ok ? 0 : 1;
  }

  const formatFiles =
    (options.files ?? []).length > 0
      ? getNodeProjectSelectedFiles(projectResult.project)
      : [
          ...getNodeProjectSelectedFiles(projectResult.project),
          ...getNodeProjectModelFiles(projectResult.project),
        ];

  return runFormat(
    [...new Map(formatFiles.map((file) => [file.absolutePath, file])).values()].map(
      (file) => file.absolutePath,
    ),
    runOptions,
  ).ok
    ? 0
    : 1;
}

export async function runLintCommand(options: ProjectCommandOptions): Promise<number> {
  if (options.unsafe && !options.fix && !options.fixDryRun) {
    throw new CliError("--unsafe can only be used with --fix or --fix-dry-run", 2);
  }

  const projectResult = await discoverCommandProject("lint", options);
  if (!projectResult) return 2;

  const reporter: "human" | "json" = options.reporter ?? options.output ?? "human";
  const baseline = resolveBaseline(projectResult.project, options);
  const runOptions = {
    ...options,
    reporter,
    baseline,
    resolvedConfig: projectResult.resolvedConfig,
    projectDiagnostics: projectResult.diagnostics,
  };

  const result = await runLint(projectResult.project, runOptions);

  maybeUpdateBaseline(projectResult.project, options, [
    ...result.projectDiagnostics,
    ...result.files.flatMap((file) => file.rawDiagnostics ?? file.diagnostics),
  ]);

  return result.ok ? 0 : 1;
}

export async function runCheckCommand(options: ProjectCommandOptions): Promise<number> {
  const projectResult = await discoverCommandProject("check", options);
  if (!projectResult) return 2;

  const reporter: "human" | "json" = options.reporter ?? options.output ?? "human";
  const baseline = resolveBaseline(projectResult.project, options);
  const runOptions = {
    ...options,
    reporter,
    baseline,
    resolvedConfig: projectResult.resolvedConfig,
    projectDiagnostics: projectResult.diagnostics,
  };

  const result = await runCheck(projectResult.project, runOptions);

  maybeUpdateBaseline(projectResult.project, options, [
    ...result.projectDiagnostics,
    ...result.files.flatMap((file) => file.rawDiagnostics ?? file.diagnostics),
  ]);

  return result.ok ? 0 : 1;
}

export async function runRepairCommand(options: ProjectCommandOptions): Promise<number> {
  const projectResult = await discoverCommandProject("repair", options);
  if (!projectResult) return 2;

  const output: "human" | "json" = options.output ?? "human";
  const result = await runRepair(projectResult.project, {
    ...options,
    output,
    show: options.show,
  });
  return result.ok ? 0 : 1;
}

export async function runDoctorCommand(options: ProjectCommandOptions): Promise<number> {
  const projectResult = await discoverCommandProject("check", options);
  if (!projectResult) return 2;
  const output: "human" | "json" = options.output ?? "human";
  return (await runDoctor(projectResult.project, { output })).ok ? 0 : 1;
}

export async function runInitCommand(options: { type?: string; force?: boolean }): Promise<number> {
  return runInit({ type: options.type, force: options.force }).ok ? 0 : 2;
}

export async function runExplainCommand(options: { rule?: string }): Promise<number> {
  return runExplain(options.rule).ok ? 0 : 2;
}

export async function runLanguageServerCommand(options: { stdio?: boolean }): Promise<number> {
  await runLanguageServer({ stdio: options.stdio });
  return 0;
}
