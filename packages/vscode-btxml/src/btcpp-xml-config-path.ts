import * as path from "node:path";

function normalizeFsPath(fsPath: string) {
  return path.resolve(fsPath);
}

function isWithinWorkspacePath(workspacePath: string, targetPath: string) {
  const relativePath = path.relative(normalizeFsPath(workspacePath), normalizeFsPath(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function resolveBtCppConfigPath(workspacePath: string, configuredPath: string | null) {
  if (!configuredPath) {
    return path.join(workspacePath, "btxml.config.json");
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(workspacePath, configuredPath);
}

export function collectBtCppConfigPaths(
  workspacePaths: readonly string[],
  configuredPath: string | null,
) {
  const paths = new Set<string>();
  for (const workspacePath of workspacePaths) {
    paths.add(normalizeFsPath(resolveBtCppConfigPath(workspacePath, configuredPath)));
  }
  return [...paths];
}

export function collectExternalBtCppConfigPaths(
  workspacePaths: readonly string[],
  configuredPath: string | null,
) {
  return collectBtCppConfigPaths(workspacePaths, configuredPath).filter(
    (configPath) =>
      !workspacePaths.some((workspacePath) => isWithinWorkspacePath(workspacePath, configPath)),
  );
}

export function isBtCppConfigPath(options: {
  documentPath: string;
  workspacePaths: readonly string[];
  configuredPath: string | null;
}) {
  return collectBtCppConfigPaths(options.workspacePaths, options.configuredPath).includes(
    normalizeFsPath(options.documentPath),
  );
}
