import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { getSettings } from "./config.ts";
import { BTCPP_XML_LSP_DOCUMENT_SELECTOR } from "./document-selector.ts";

function findWorkspaceRoot() {
  return (
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || vscode.workspace.rootPath || process.cwd()
  );
}

export function createLanguageClient(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
) {
  const settings = getSettings();
  const serverModule = settings.serverPath
    ? path.resolve(findWorkspaceRoot(), settings.serverPath)
    : context.asAbsolutePath(path.join("dist", "server.cjs"));

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { cwd: findWorkspaceRoot(), env: process.env },
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { cwd: findWorkspaceRoot(), env: process.env },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [...BTCPP_XML_LSP_DOCUMENT_SELECTOR],
    outputChannel,
    synchronize: {
      configurationSection: "btxml",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/{btxml.config.json,*.xml,*.json}"),
    },
    initializationOptions: {
      btxml: {
        configPath: settings.configPath,
        trace: settings.traceServer,
        diagnostics: { enabled: settings.diagnosticsEnabled },
        format: { enabled: settings.formatEnabled },
        completion: { enabled: settings.completionEnabled },
      },
    },
  };

  return new LanguageClient("btxml", "BehaviorTree.CPP XML Tools", serverOptions, clientOptions);
}
