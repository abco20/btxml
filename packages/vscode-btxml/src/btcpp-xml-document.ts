import fs from "node:fs/promises";
import * as path from "node:path";
import {
  type EffectiveFileConfig,
  getEffectiveConfigForFile,
  isIncludedFilePath,
  type normalizeBtxmlConfig,
} from "@btxml/config";
import * as vscode from "vscode";
import {
  BTCPP_XML_LANGUAGE_ID,
  XML_LANGUAGE_IDS,
  hasBtCppXmlDetectionSignals,
  shouldTreatAsBtCppXmlDocument,
} from "./btcpp-xml-classifier.ts";
import { isBtCppConfigPath, resolveBtCppConfigPath } from "./btcpp-xml-config-path.ts";
import { readBtCppXmlConfigFromDisk } from "./config-disk-reader.ts";
import { getSettings } from "./config.ts";
import { getFileUriRelativeWorkspacePath } from "./file-uri.ts";

type ConfigCacheEntry = {
  mtimeMs: number;
  size: number;
  resolved: ReturnType<typeof normalizeBtxmlConfig>["config"] | undefined;
};

const configCache = new Map<string, Promise<ConfigCacheEntry | undefined>>();

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}

function getRelativeWorkspacePath(
  workspaceFolder: vscode.WorkspaceFolder,
  document: vscode.TextDocument,
) {
  const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return normalizePath(relativePath);
}

export function getWorkspaceConfigUri(workspaceFolder: vscode.WorkspaceFolder) {
  return vscode.Uri.file(
    resolveBtCppConfigPath(workspaceFolder.uri.fsPath, getSettings().configPath),
  );
}

export function listWorkspaceConfigUris(
  workspaceFolders = vscode.workspace.workspaceFolders ?? [],
) {
  const uris = new Map<string, vscode.Uri>();
  for (const workspaceFolder of workspaceFolders) {
    const uri = getWorkspaceConfigUri(workspaceFolder);
    uris.set(uri.toString(), uri);
  }
  return [...uris.values()];
}

export function isBtCppConfigDocument(document: vscode.TextDocument) {
  if (document.uri.scheme !== "file") return false;
  return isBtCppConfigPath({
    documentPath: document.uri.fsPath,
    workspacePaths: (vscode.workspace.workspaceFolders ?? []).map(
      (workspaceFolder) => workspaceFolder.uri.fsPath,
    ),
    configuredPath: getSettings().configPath,
  });
}

async function readResolvedWorkspaceConfig(workspaceFolder: vscode.WorkspaceFolder) {
  const configUri = getWorkspaceConfigUri(workspaceFolder);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(configUri.fsPath);
  } catch {
    configCache.delete(configUri.toString());
    return undefined;
  }

  const key = configUri.toString();
  const cached = configCache.get(key);
  if (cached) {
    const entry = await cached;
    if (entry && entry.mtimeMs === stat.mtimeMs && entry.size === stat.size) return entry.resolved;
  }

  const loading = (async (): Promise<ConfigCacheEntry | undefined> => {
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      resolved: await readBtCppXmlConfigFromDisk(configUri.fsPath),
    };
  })();

  configCache.set(key, loading);
  return (await loading)?.resolved;
}

async function getEffectiveWorkspaceConfig(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePath: string,
): Promise<EffectiveFileConfig | undefined> {
  const config = await readResolvedWorkspaceConfig(workspaceFolder);
  if (!config) return undefined;
  return getEffectiveConfigForFile(config, relativePath);
}

export function invalidateBtCppXmlConfigCache(uri?: vscode.Uri | string) {
  if (!uri) {
    clearBtCppXmlConfigCache();
    return;
  }
  const key = typeof uri === "string" ? uri : uri.toString();
  configCache.delete(key);
}

export async function isConfigIncludedBtCppXmlDocument(document: vscode.TextDocument) {
  if (document.uri.scheme !== "file") return false;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) return false;
  const relativePath = getRelativeWorkspacePath(workspaceFolder, document);
  if (!relativePath) return false;
  const config = await readResolvedWorkspaceConfig(workspaceFolder);
  if (!config) return false;
  return isIncludedFilePath(config, relativePath);
}

export async function getEffectiveBtCppConfigForDocument(document: vscode.TextDocument) {
  if (document.uri.scheme !== "file") return undefined;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) return undefined;
  const relativePath = getRelativeWorkspacePath(workspaceFolder, document);
  if (!relativePath) return undefined;
  return getEffectiveWorkspaceConfig(workspaceFolder, relativePath);
}

export async function getEffectiveBtCppConfigForUri(uri: vscode.Uri | string) {
  const parsedUri = typeof uri === "string" ? vscode.Uri.parse(uri) : uri;
  if (parsedUri.scheme !== "file") return undefined;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(parsedUri);
  if (!workspaceFolder) return undefined;
  const relativePath = getFileUriRelativeWorkspacePath(
    workspaceFolder.uri.fsPath,
    parsedUri.toString(),
  );
  if (!relativePath) return undefined;
  return getEffectiveWorkspaceConfig(workspaceFolder, relativePath);
}

export async function isBtCppXmlDocument(document: vscode.TextDocument) {
  return shouldTreatAsBtCppXmlDocument({
    includedByConfig: await isConfigIncludedBtCppXmlDocument(document),
    languageId: document.languageId,
    fsPath: document.uri.fsPath,
    text: document.getText(),
  });
}

export async function hasBtCppXmlDetectionForDocument(document: vscode.TextDocument) {
  return hasBtCppXmlDetectionSignals({
    includedByConfig: await isConfigIncludedBtCppXmlDocument(document),
    fsPath: document.uri.fsPath,
    text: document.getText(),
  });
}

export function clearBtCppXmlConfigCache() {
  configCache.clear();
}

export { BTCPP_XML_LANGUAGE_ID, XML_LANGUAGE_IDS, shouldTreatAsBtCppXmlDocument };
