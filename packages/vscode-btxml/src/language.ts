import * as path from "node:path";
import * as vscode from "vscode";
import { createAutoPromotionTracker } from "./auto-promotion-tracker.ts";
import {
  BTCPP_XML_LANGUAGE_ID,
  clearBtCppXmlConfigCache,
  hasBtCppXmlDetectionForDocument,
  invalidateBtCppXmlConfigCache,
  isBtCppConfigDocument,
} from "./btcpp-xml-document.ts";
import { getBtCppXmlLanguageAction } from "./btcpp-xml-language-state.ts";
import { shouldRefreshDetectionForConfigDocument } from "./config-refresh-policy.ts";
import { getSettings } from "./config.ts";
import {
  FILE_CHANGE_TYPE,
  type WatchedFileChangeType,
  collectBtCppConfigWatchTargets,
  refreshDetectionForWatchedConfigChange,
} from "./language-config-watch.ts";

function isSupportedScheme(document: vscode.TextDocument) {
  return document.uri.scheme === "file" || document.uri.scheme === "untitled";
}

const autoPromotionTracker = createAutoPromotionTracker();

async function autoDetectBtCppXmlLanguage(document: vscode.TextDocument) {
  if (!isSupportedScheme(document)) return;

  const uri = document.uri.toString();
  if (document.languageId !== BTCPP_XML_LANGUAGE_ID) {
    autoPromotionTracker.clear(uri);
  }

  const action = getBtCppXmlLanguageAction({
    languageId: document.languageId,
    detectedAsBtCppXml: await hasBtCppXmlDetectionForDocument(document),
    autoPromotedFromLanguageId: autoPromotionTracker.get(uri),
  });

  if (action.type === "none") return;

  autoPromotionTracker.markLanguageSwitch(uri);
  let updatedDocument: vscode.TextDocument;
  try {
    updatedDocument = await vscode.languages.setTextDocumentLanguage(document, action.toLanguageId);
  } catch (error) {
    autoPromotionTracker.rollbackLanguageSwitch(uri);
    throw error;
  }

  if (action.type === "promote") {
    autoPromotionTracker.setPromotedFromLanguage(
      updatedDocument.uri.toString(),
      action.fromLanguageId,
    );
    return;
  }

  autoPromotionTracker.clear(updatedDocument.uri.toString());
}

export function registerBtCppXmlLanguageDetection(
  context: vscode.ExtensionContext,
  onWatchedConfigChange?: (uri: vscode.Uri, type: WatchedFileChangeType) => void,
) {
  const detectVisibleEditors = () => {
    for (const editor of vscode.window.visibleTextEditors) {
      void autoDetectBtCppXmlLanguage(editor.document);
    }
  };

  const configWatchers = new Map<string, vscode.FileSystemWatcher>();

  const refreshConfigWatchers = () => {
    const workspacePaths = (vscode.workspace.workspaceFolders ?? []).map(
      (workspaceFolder) => workspaceFolder.uri.fsPath,
    );
    const nextTargets = collectBtCppConfigWatchTargets(workspacePaths, getSettings().configPath);
    const nextPaths = new Set(nextTargets.map((target) => target.configPath));
    const notifyLanguageServerByPath = new Map(
      nextTargets.map((target) => [target.configPath, target.notifyLanguageServer]),
    );

    for (const [configPath, watcher] of configWatchers) {
      if (nextPaths.has(configPath)) continue;
      watcher.dispose();
      configWatchers.delete(configPath);
    }

    for (const configPath of nextPaths) {
      if (configWatchers.has(configPath)) continue;

      const refreshForConfigChange = (uri: vscode.Uri, type: WatchedFileChangeType) => {
        refreshDetectionForWatchedConfigChange({
          uri: uri.toString(),
          type,
          invalidateConfigCache: (uriString) => invalidateBtCppXmlConfigCache(uriString),
          detectVisibleEditors,
          onWatchedConfigChange: (uriString, watchedType) =>
            onWatchedConfigChange?.(vscode.Uri.parse(uriString), watchedType),
          notifyLanguageServer: notifyLanguageServerByPath.get(configPath) ?? false,
        });
      };

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(path.dirname(configPath), path.basename(configPath)),
      );
      watcher.onDidCreate((uri) => {
        refreshForConfigChange(uri, FILE_CHANGE_TYPE.Created);
      });
      watcher.onDidChange((uri) => {
        refreshForConfigChange(uri, FILE_CHANGE_TYPE.Changed);
      });
      watcher.onDidDelete((uri) => {
        refreshForConfigChange(uri, FILE_CHANGE_TYPE.Deleted);
      });
      configWatchers.set(configPath, watcher);
    }
  };

  detectVisibleEditors();
  refreshConfigWatchers();
  context.subscriptions.push(
    {
      dispose: () => {
        for (const watcher of configWatchers.values()) watcher.dispose();
        configWatchers.clear();
      },
    },
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("btxml.configPath")) return;
      clearBtCppXmlConfigCache();
      refreshConfigWatchers();
      detectVisibleEditors();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshConfigWatchers();
      detectVisibleEditors();
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      autoPromotionTracker.finishReopen(document.uri.toString());
      void autoDetectBtCppXmlLanguage(document);
    }),
    vscode.window.onDidChangeVisibleTextEditors(detectVisibleEditors),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const uri = document.uri.toString();
      if (autoPromotionTracker.preserveOnClose(uri)) return;
      autoPromotionTracker.clear(uri);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length === 0) return;
      void autoDetectBtCppXmlLanguage(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (
        !shouldRefreshDetectionForConfigDocument({
          isConfigDocument: isBtCppConfigDocument(document),
          reason: "save",
        })
      ) {
        return;
      }
      invalidateBtCppXmlConfigCache(document.uri);
      detectVisibleEditors();
    }),
  );
}
