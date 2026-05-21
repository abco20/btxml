import * as vscode from "vscode";

export type ExtensionSettings = {
  enabled: boolean;
  configPath: string | null;
  diagnosticsEnabled: boolean;
  formatEnabled: boolean;
  completionEnabled: boolean;
  traceServer: "off" | "messages" | "verbose";
  serverPath: string | null;
};

export function getSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration("btxml");
  return {
    enabled: config.get<boolean>("enabled", true),
    configPath: config.get<string | null>("configPath", null),
    diagnosticsEnabled: config.get<boolean>("diagnostics.enabled", true),
    formatEnabled: config.get<boolean>("format.enabled", true),
    completionEnabled: config.get<boolean>("completion.enabled", true),
    traceServer: config.get<ExtensionSettings["traceServer"]>("trace.server", "off"),
    serverPath: config.get<string | null>("server.path", null),
  };
}
