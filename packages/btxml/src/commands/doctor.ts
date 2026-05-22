import fs from "node:fs";
import {
  type BtxmlProject,
  getProjectSkippedFiles,
  loadProjectSemanticIndex,
} from "@btxml/project";
import {
  getNodeProjectConfigPath,
  getNodeProjectDefinitionFiles,
  getNodeProjectModelFiles,
  getNodeProjectRootDir,
  getNodeProjectSelectedFiles,
} from "@btxml/project/node";
import type { CommandModule } from "yargs";
import { runDoctorCommand } from "../context.ts";
import { parseCommandOptions } from "../options/common.ts";
import { doctorOptionsSchema } from "../options/doctor.ts";
import { TOOL_VERSION } from "../output.ts";

export async function runDoctor(project: BtxmlProject, options: { output?: string }) {
  const configPath = getNodeProjectConfigPath(project);
  const configFound = Boolean(configPath && fs.existsSync(configPath));
  const semantic = await loadProjectSemanticIndex({ project, resolveGraph: true });
  const issues = semantic.includeGraph?.issues ?? [];

  const missingIncludes = issues.filter((issue) => issue.kind === "not-found");

  const output = options.output ?? "human";
  if (output !== "human" && output !== "json") {
    console.error(`Invalid --output: ${output}`);
    return { ok: false };
  }

  const report = {
    version: 1,
    packageVersion: TOOL_VERSION,
    cliVersion: TOOL_VERSION,
    lspVersion: TOOL_VERSION,
    configPath,
    configFound,
    configValid: configFound,
    projectRoot: getNodeProjectRootDir(project),
    selectedFiles: getNodeProjectSelectedFiles(project).length,
    ignoredFiles: getProjectSkippedFiles(project).length,
    externalModels: getNodeProjectModelFiles(project).length,
    nodeDefinitions: getNodeProjectDefinitionFiles(project).length,
    includeGraphStatus: issues.length === 0 ? "ok" : "has-diagnostics",
    missingIncludes: missingIncludes.length,
    missingExternalModels: 0,
    missingNodeDefinitions: 0,
    workspaceHealth:
      issues.length === 0 && missingIncludes.length === 0 ? "healthy" : "issues-found",
    hints: [
      getNodeProjectModelFiles(project).length === 0
        ? "No external TreeNodesModel files configured"
        : undefined,
      getNodeProjectDefinitionFiles(project).length === 0
        ? "No node definition files configured"
        : undefined,
      "VS Code: install packaged VSIX or run extension tests for editor integration checks",
    ].filter(Boolean),
  };

  if (output === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Package version: ${report.packageVersion}`);
    console.log(`CLI version: ${report.cliVersion}`);
    console.log(`Project root: ${report.projectRoot}`);
    console.log(`Config path: ${report.configPath || "none"}`);
    console.log(`Config found: ${report.configFound}`);
    console.log(`Selected files: ${report.selectedFiles}`);
    console.log(`Ignored files: ${report.ignoredFiles}`);
    console.log(`External models: ${report.externalModels}`);
    console.log(`Node definitions: ${report.nodeDefinitions}`);
    console.log(`Include graph: ${report.includeGraphStatus}`);
    console.log(`Missing includes: ${report.missingIncludes}`);
    console.log(`Missing external models: ${report.missingExternalModels}`);
    console.log(`Missing node definitions: ${report.missingNodeDefinitions}`);
    console.log(`Workspace health: ${report.workspaceHealth}`);
    for (const hint of report.hints) console.log(`Hint: ${hint}`);
  }
  return { ok: true };
}

export const doctorCommand: CommandModule = {
  command: "doctor [files..]",
  describe: "Diagnose workspace health",
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
      .option("json", { type: "boolean" }),
  handler: async (argv) => {
    const options = parseCommandOptions(doctorOptionsSchema, argv);
    process.exitCode = await runDoctorCommand(options);
  },
};
