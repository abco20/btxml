import {
  collectBtCppConfigPaths,
  collectExternalBtCppConfigPaths,
} from "./btcpp-xml-config-path.ts";

export const FILE_CHANGE_TYPE = {
  Created: 1,
  Changed: 2,
  Deleted: 3,
} as const;

export type WatchedFileChangeType = (typeof FILE_CHANGE_TYPE)[keyof typeof FILE_CHANGE_TYPE];

export type BtCppConfigWatchTarget = {
  configPath: string;
  notifyLanguageServer: boolean;
};

export function collectBtCppConfigWatchTargets(
  workspacePaths: readonly string[],
  configuredPath: string | null,
): BtCppConfigWatchTarget[] {
  const externalPaths = new Set(collectExternalBtCppConfigPaths(workspacePaths, configuredPath));
  return collectBtCppConfigPaths(workspacePaths, configuredPath).map((configPath) => ({
    configPath,
    notifyLanguageServer: externalPaths.has(configPath),
  }));
}

export function refreshDetectionForWatchedConfigChange(options: {
  uri: string;
  type: WatchedFileChangeType;
  invalidateConfigCache: (uri: string) => void;
  detectVisibleEditors: () => void;
  onWatchedConfigChange?: (uri: string, type: WatchedFileChangeType) => void;
  notifyLanguageServer: boolean;
}) {
  options.invalidateConfigCache(options.uri);
  options.detectVisibleEditors();
  if (options.notifyLanguageServer) {
    options.onWatchedConfigChange?.(options.uri, options.type);
  }
}
