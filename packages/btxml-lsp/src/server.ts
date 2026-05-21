import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createNodeWorkspaceService } from "@btxml/language-service/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  type CodeActionParams,
  type CompletionParams,
  type DidChangeConfigurationParams,
  type DidChangeWorkspaceFoldersParams,
  type DocumentFormattingParams,
  type DocumentSymbolParams,
  type InitializeParams,
  ProposedFeatures,
  SymbolKind,
  type TextDocumentChangeEvent,
  type TextDocumentPositionParams,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node.js";
import {
  handleCodeActions,
  handleCompletion,
  handleDefinition,
  handleDocumentSymbols,
  handleFormatting,
  handleGetChildCapability,
  handleGetNodeModelById,
  handleHover,
  handleReferences,
} from "./handlers.ts";
import {
  type GetChildCapabilityParams,
  type GetNodeModelByIdParams,
  toDiagnostic,
} from "./protocol.ts";

type TraceServerMode = "off" | "messages" | "verbose";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const openUris = new Set<string>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
const documentWorkspaceRoots = new Map<string, string>();
const workspaceServices = new Map<string, ReturnType<typeof createNodeWorkspaceService>>();
const loadedWorkspaceRoots = new Set<string>();

let workspaceRoots = [process.cwd()];
let settings = {
  configPath: undefined as string | undefined,
  diagnosticsEnabled: true,
  formatEnabled: true,
  completionEnabled: true,
  traceServer: "off" as TraceServerMode,
  diagnosticsDebounceMs: 200,
};

function fileUriToPath(uri: string) {
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  return uri;
}

function normalizeDocumentUri(uri: string) {
  if (!uri.startsWith("file://")) return uri;
  try {
    return pathToFileURL(fileURLToPath(uri)).href;
  } catch {
    return uri;
  }
}

function normalizeWorkspaceRoot(rootPath: string) {
  const normalized = path.resolve(rootPath).replace(/\\/g, "/").replace(/\/$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function setWorkspaceRoots(nextRoots: string[]) {
  const deduped = new Set<string>();
  for (const root of nextRoots) {
    const resolvedRoot = path.resolve(root);
    const normalizedRoot = normalizeWorkspaceRoot(resolvedRoot);
    if (deduped.has(normalizedRoot)) continue;
    deduped.add(normalizedRoot);
  }

  workspaceRoots = [...deduped]
    .map((normalizedRoot) => {
      return nextRoots.find(
        (root) => normalizeWorkspaceRoot(path.resolve(root)) === normalizedRoot,
      );
    })
    .filter((root): root is string => Boolean(root)) || [process.cwd()];
}

function collectWorkspaceRoots(params: InitializeParams & { rootUri?: string | null }) {
  const roots =
    params.workspaceFolders?.map((folder) => fileUriToPath(folder.uri)) ||
    (params.rootUri ? [fileUriToPath(params.rootUri)] : params.rootPath ? [params.rootPath] : []);
  return roots.length > 0 ? roots : [process.cwd()];
}

function getWorkspaceService(rootPath: string) {
  let workspace = workspaceServices.get(rootPath);
  if (workspace) return workspace;
  workspace = createNodeWorkspaceService({ cwd: rootPath });
  workspaceServices.set(rootPath, workspace);
  return workspace;
}

function resolveWorkspaceRootForPath(fsPath: string) {
  const normalizedPath = normalizeWorkspaceRoot(fsPath);
  let matchedRoot = workspaceRoots[0] || process.cwd();
  let matchedLength = -1;
  for (const root of workspaceRoots) {
    const normalizedRoot = normalizeWorkspaceRoot(root);
    if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}/`)) {
      continue;
    }
    if (normalizedRoot.length <= matchedLength) continue;
    matchedRoot = root;
    matchedLength = normalizedRoot.length;
  }
  return matchedRoot;
}

function resolveWorkspaceRootForUri(uri: string) {
  if (!uri.startsWith("file://")) return workspaceRoots[0] || process.cwd();
  try {
    return resolveWorkspaceRootForPath(fileUriToPath(uri));
  } catch {
    return workspaceRoots[0] || process.cwd();
  }
}

function getDocumentWorkspaceRoot(uri: string) {
  return documentWorkspaceRoots.get(uri) || resolveWorkspaceRootForUri(uri);
}

function getWorkspaceForDocumentUri(uri: string) {
  return getWorkspaceService(getDocumentWorkspaceRoot(uri));
}

function applySettings(next: unknown) {
  const scoped =
    next && typeof next === "object" && "btxml" in (next as Record<string, unknown>)
      ? (next as { btxml?: unknown }).btxml
      : next;
  const value = (scoped && typeof scoped === "object" ? scoped : {}) as {
    configPath?: string | null;
    diagnostics?: { enabled?: boolean };
    format?: { enabled?: boolean };
    completion?: { enabled?: boolean };
    trace?: TraceServerMode;
    traceServer?: TraceServerMode;
    lsp?: { diagnosticsDebounceMs?: number };
    diagnosticsDebounceMs?: number;
  };
  settings = {
    configPath: value.configPath || undefined,
    diagnosticsEnabled: value.diagnostics?.enabled !== false,
    formatEnabled: value.format?.enabled !== false,
    completionEnabled: value.completion?.enabled !== false,
    traceServer: value.traceServer || value.trace || "off",
    diagnosticsDebounceMs:
      Number(value.diagnosticsDebounceMs ?? value.lsp?.diagnosticsDebounceMs ?? 200) || 200,
  };
}

function getDocument(uri: string) {
  const normalizedUri = normalizeDocumentUri(uri);
  const workspace = getWorkspaceForDocumentUri(normalizedUri);
  return (
    workspace.getDocument(normalizedUri) || workspace.getDocument(fileUriToPath(normalizedUri))
  );
}

function withNormalizedTextDocumentUri<T extends { textDocument: { uri: string } }>(params: T): T {
  return {
    ...params,
    textDocument: {
      ...params.textDocument,
      uri: normalizeDocumentUri(params.textDocument.uri),
    },
  };
}

async function reloadWorkspace(rootPath: string) {
  const workspace = getWorkspaceService(rootPath);
  const result = await workspace.loadProject({
    cwd: rootPath,
    configPath: settings.configPath,
  });
  if (workspace.getResolvedConfig()) {
    loadedWorkspaceRoots.add(rootPath);
  } else {
    loadedWorkspaceRoots.delete(rootPath);
  }
  if (!result.ok && result.diagnostics.length > 0) {
    const lines = result.diagnostics.map((diag) => `${diag.severity} ${diag.code} ${diag.message}`);
    process.stderr.write(`${lines.join("\n")}\n`);
  }
  for (const uri of openUris) {
    if (getDocumentWorkspaceRoot(uri) !== rootPath) continue;
    publishDiagnostics(uri);
  }
  return result;
}

async function reloadAllWorkspaces() {
  return Promise.all(workspaceRoots.map((rootPath) => reloadWorkspace(rootPath)));
}

async function handleWorkspaceFoldersChanged(params: DidChangeWorkspaceFoldersParams) {
  const removedRoots = new Set(
    params.event.removed.map((folder) => normalizeWorkspaceRoot(fileUriToPath(folder.uri))),
  );
  const addedRoots = params.event.added.map((folder) => fileUriToPath(folder.uri));
  const movedOpenDocuments = new Map<
    string,
    { text: string; version: number; languageId: "xml" | "btcpp-xml" } | undefined
  >();

  for (const uri of openUris) {
    const previousRoot = documentWorkspaceRoots.get(uri);
    if (!previousRoot || !removedRoots.has(normalizeWorkspaceRoot(previousRoot))) continue;
    const document = workspaceServices.get(previousRoot)?.getDocument(uri);
    movedOpenDocuments.set(
      uri,
      document
        ? {
            text: document.text,
            version: document.version,
            languageId: document.languageId,
          }
        : undefined,
    );
  }

  setWorkspaceRoots(
    workspaceRoots
      .filter((rootPath) => !removedRoots.has(normalizeWorkspaceRoot(rootPath)))
      .concat(addedRoots),
  );

  for (const [rootPath, workspace] of [...workspaceServices.entries()]) {
    if (
      workspaceRoots.some(
        (candidate) => normalizeWorkspaceRoot(candidate) === normalizeWorkspaceRoot(rootPath),
      )
    ) {
      continue;
    }
    workspace.dispose();
    workspaceServices.delete(rootPath);
    loadedWorkspaceRoots.delete(rootPath);
  }

  await reloadAllWorkspaces();

  for (const uri of openUris) {
    const nextRoot = resolveWorkspaceRootForUri(uri);
    const previousRoot = documentWorkspaceRoots.get(uri);
    if (previousRoot === nextRoot) {
      publishDiagnostics(uri);
      continue;
    }

    const previousWorkspace = previousRoot ? workspaceServices.get(previousRoot) : undefined;
    const document = previousWorkspace?.getDocument(uri) ?? movedOpenDocuments.get(uri);
    previousWorkspace?.closeDocument(uri);
    documentWorkspaceRoots.set(uri, nextRoot);
    if (document) {
      getWorkspaceService(nextRoot).openDocument(
        uri,
        document.text,
        document.version,
        document.languageId,
      );
    }
    publishDiagnostics(uri);
  }
}

function publishDiagnostics(uri: string) {
  const normalizedUri = normalizeDocumentUri(uri);
  const workspace = getWorkspaceForDocumentUri(normalizedUri);
  if (!settings.diagnosticsEnabled) {
    connection.sendNotification("textDocument/publishDiagnostics", {
      uri: normalizedUri,
      diagnostics: [],
    });
    return;
  }
  const document = getDocument(normalizedUri);
  if (!document) {
    connection.sendNotification("textDocument/publishDiagnostics", {
      uri: normalizedUri,
      diagnostics: [],
    });
    return;
  }

  const result = workspace.getDiagnostics(normalizedUri);

  connection.sendNotification("textDocument/publishDiagnostics", {
    uri: normalizedUri,
    diagnostics: result.diagnostics.map(toDiagnostic),
  });
}

function scheduleDiagnostics(uri: string) {
  const existing = debounceTimers.get(uri);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    debounceTimers.delete(uri);
    publishDiagnostics(uri);
  }, settings.diagnosticsDebounceMs);
  debounceTimers.set(uri, timeout);
}

documents.onDidOpen(async (event: TextDocumentChangeEvent<TextDocument>) => {
  const normalizedUri = normalizeDocumentUri(event.document.uri);
  const rootPath = resolveWorkspaceRootForUri(normalizedUri);
  documentWorkspaceRoots.set(normalizedUri, rootPath);
  if (!loadedWorkspaceRoots.has(rootPath)) {
    await reloadWorkspace(rootPath);
  }
  openUris.add(normalizedUri);
  const workspace = getWorkspaceService(rootPath);
  workspace.openDocument(
    normalizedUri,
    event.document.getText(),
    event.document.version,
    event.document.languageId === "btcpp-xml" ? "btcpp-xml" : "xml",
  );
  publishDiagnostics(normalizedUri);
});

documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
  const normalizedUri = normalizeDocumentUri(event.document.uri);
  const workspace = getWorkspaceForDocumentUri(normalizedUri);
  workspace.updateDocument(
    normalizedUri,
    event.document.getText(),
    event.document.version,
    event.document.languageId === "btcpp-xml" ? "btcpp-xml" : "xml",
  );
  scheduleDiagnostics(normalizedUri);
});

documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
  const normalizedUri = normalizeDocumentUri(event.document.uri);
  const workspace = getWorkspaceForDocumentUri(normalizedUri);
  openUris.delete(normalizedUri);
  const existing = debounceTimers.get(normalizedUri);
  if (existing) clearTimeout(existing);
  debounceTimers.delete(normalizedUri);
  workspace.closeDocument(normalizedUri);
  documentWorkspaceRoots.delete(normalizedUri);
  connection.sendNotification("textDocument/publishDiagnostics", {
    uri: normalizedUri,
    diagnostics: [],
  });
});

connection.onInitialize(async (params: InitializeParams) => {
  applySettings(params.initializationOptions);
  setWorkspaceRoots(
    collectWorkspaceRoots(params as InitializeParams & { rootUri?: string | null }),
  );
  await reloadAllWorkspaces();
  return {
    serverInfo: {
      name: "btxml",
      version: "0.1.0",
    },
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
      completionProvider: {
        triggerCharacters: ["<", " ", "=", "{", "/", '"', "'"],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      codeActionProvider: true,
    },
  };
});

connection.onInitialized(() => {});
connection.onRequest("shutdown", () => null);
connection.onNotification("exit", () => {
  process.exit(0);
});
connection.onNotification(
  "workspace/didChangeConfiguration",
  async (params: DidChangeConfigurationParams) => {
    applySettings(params.settings);
    await reloadAllWorkspaces();
  },
);
connection.onNotification(
  "workspace/didChangeWorkspaceFolders",
  async (params: DidChangeWorkspaceFoldersParams) => {
    await handleWorkspaceFoldersChanged(params);
  },
);
connection.onNotification("workspace/didChangeWatchedFiles", async (params) => {
  const changes = (params as { changes?: Array<{ uri: string }> })?.changes || [];
  const reloadedRoots = new Set<string>();

  await Promise.all(
    changes.map(async (change) => {
      const normalizedUri = normalizeDocumentUri(change.uri);
      const affectedRoots = normalizedUri.startsWith("file://")
        ? (() => {
            const rootPath = resolveWorkspaceRootForUri(normalizedUri);
            const fsPath = fileUriToPath(normalizedUri);
            const normalizedRoot = normalizeWorkspaceRoot(rootPath);
            const normalizedPath = normalizeWorkspaceRoot(fsPath);
            return normalizedPath === normalizedRoot ||
              normalizedPath.startsWith(`${normalizedRoot}/`)
              ? [rootPath]
              : workspaceRoots;
          })()
        : workspaceRoots;

      const reloads = await Promise.all(
        affectedRoots.map((rootPath) =>
          getWorkspaceService(rootPath).notifyWatchedFileChanged(normalizedUri),
        ),
      );
      if (reloads.some((result) => result)) {
        for (const rootPath of affectedRoots) reloadedRoots.add(rootPath);
      }
    }),
  );

  if (reloadedRoots.size > 0) {
    for (const uri of openUris) {
      if (!reloadedRoots.has(getDocumentWorkspaceRoot(uri))) continue;
      publishDiagnostics(uri);
    }
  }
});

connection.onRequest("textDocument/completion", (params: CompletionParams) => {
  if (!settings.completionEnabled) return [];
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleCompletion(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/hover", (params: TextDocumentPositionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleHover(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/definition", (params: TextDocumentPositionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleDefinition(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/references", (params: TextDocumentPositionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleReferences(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/documentSymbol", (params: DocumentSymbolParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleDocumentSymbols(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
    SymbolKind,
  );
});

connection.onRequest("textDocument/formatting", (params: DocumentFormattingParams) => {
  if (!settings.formatEnabled) return [];
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleFormatting(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/codeAction", (params: CodeActionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleCodeActions(
    getWorkspaceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("btxml/getNodeModelById", (params: GetNodeModelByIdParams) => {
  return handleGetNodeModelById(getWorkspaceForDocumentUri(normalizeDocumentUri(params.uri)), {
    ...params,
    uri: normalizeDocumentUri(params.uri),
  });
});

connection.onRequest("btxml/getChildCapability", (params: GetChildCapabilityParams) => {
  return handleGetChildCapability(getWorkspaceForDocumentUri(normalizeDocumentUri(params.uri)), {
    ...params,
    uri: normalizeDocumentUri(params.uri),
  });
});

export async function startLanguageServer() {
  documents.listen(connection);
  connection.listen();
}
