import * as fs from "node:fs";
import * as path from "node:path";
import { createInitConfig } from "@btxml/core";
import * as vscode from "vscode";

function workspaceRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function writeInitialConfig(configPath: string) {
  const config = createInitConfig();
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function openWorkspaceConfig(createIfMissing: boolean) {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage("Open a workspace to edit btxml.config.json");
    return;
  }

  const configPath = path.join(root, "btxml.config.json");
  if (!fs.existsSync(configPath)) {
    if (!createIfMissing) {
      const choice = await vscode.window.showInformationMessage(
        "btxml.config.json does not exist.",
        "Create config",
        "Cancel",
      );
      if (choice !== "Create config") return;
    }
    writeInitialConfig(configPath);
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
  await vscode.window.showTextDocument(doc);
}

export async function createWorkspaceConfig() {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage("Open a workspace to create btxml.config.json");
    return;
  }

  const configPath = path.join(root, "btxml.config.json");
  if (fs.existsSync(configPath)) {
    vscode.window.showWarningMessage("btxml.config.json already exists");
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    await vscode.window.showTextDocument(doc);
    return;
  }

  writeInitialConfig(configPath);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
  await vscode.window.showTextDocument(doc);
}
