import { getProjectResolvedConfig } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";
import type { ProjectCommandOptions } from "./context.ts";
import { renderHumanDiagnostics } from "./render/human-diagnostic.ts";

export async function discoverCommandProject(command: string, argv: ProjectCommandOptions) {
  const projectResult = await discoverNodeProject({
    cwd: process.cwd(),
    cliFiles: argv.files ?? argv._?.slice(1) ?? [],
    configPath: argv.configPath,
    noConfig: argv.noConfig,
    command: command as
      | "format"
      | "lint"
      | "check"
      | "repair"
      | "dump-model"
      | "list-files"
      | "graph",
    projectRoot: argv.projectRoot,
  });

  if (!projectResult.project) {
    const text = renderHumanDiagnostics({ diagnostics: projectResult.diagnostics });
    if (text) console.error(text);
    return null;
  }

  const project = projectResult.project;
  const resolvedConfig = getProjectResolvedConfig(project);
  if (!resolvedConfig) {
    return null;
  }
  return { ...projectResult, project, resolvedConfig };
}
