import path from "node:path";
import { discoverProject } from "../discover.js";
import type { DiscoverProjectResult, ProjectCommand } from "../types.js";
import type { NodeProjectHostOptions } from "./host.js";
import { createNodeProjectHost } from "./host.js";
import { pathToFileUri } from "./uri.js";

export type DiscoverNodeProjectInput = {
  cwd?: string;
  configPath?: string;
  projectRoot?: string;
  noConfig?: boolean;
  cliFiles?: readonly string[];
  command?: ProjectCommand;
  hostOptions?: NodeProjectHostOptions;
};

export async function discoverNodeProject(
  input: DiscoverNodeProjectInput = {},
): Promise<DiscoverProjectResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const rootPath = input.projectRoot ? path.resolve(cwd, input.projectRoot) : cwd;
  const host = createNodeProjectHost(rootPath, input.hostOptions);
  return discoverProject({
    rootUri: pathToFileUri(rootPath),
    host,
    configUri: input.configPath ? pathToFileUri(path.resolve(cwd, input.configPath)) : undefined,
    noConfig: input.noConfig,
    cliFiles: input.cliFiles,
    command: input.command,
  });
}
