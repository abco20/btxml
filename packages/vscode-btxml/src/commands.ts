import * as path from "node:path";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";
import { createWorkspaceConfig, openWorkspaceConfig } from "./config-file.ts";

function workspaceRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  clientRef: { current: LanguageClient | undefined },
  outputChannel: vscode.OutputChannel,
  restart: () => Thenable<void>,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.restartLanguageServer", async () => {
      await restart();
      vscode.window.showInformationMessage("BTXML language server restarted");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.showOutput", async () => {
      outputChannel.show(true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.formatDocument", async () => {
      await vscode.commands.executeCommand("editor.action.formatDocument");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.checkWorkspace", async () => {
      const root = workspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage("Open a workspace to run BTXML Checker");
        return;
      }
      const cliPath = context.asAbsolutePath(path.join("dist", "cli.cjs"));
      const terminal = vscode.window.createTerminal({
        name: "BTXML Check",
        cwd: root,
      });
      terminal.show(true);
      terminal.sendText(`node "${cliPath}" check`, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.showProjectSummary", async () => {
      const root = workspaceRoot();
      const client = clientRef.current;
      const server = client?.initializeResult?.serverInfo?.name || "running";
      vscode.window.showInformationMessage(
        root ? `BTXML workspace: ${path.basename(root)} (${server})` : `BTXML server: ${server}`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.openConfig", async () => {
      const root = workspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage("Open a workspace to edit btxml.config.json");
        return;
      }
      await openWorkspaceConfig(false);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btxml.createConfig", async () => {
      const root = workspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage("Open a workspace to create btxml.config.json");
        return;
      }
      await createWorkspaceConfig();
    }),
  );
}
