import { access } from "node:fs/promises";
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
type ProjectKey = `config:${string}` | `workspace:${string}`;
type ProjectBinding = {
  key: ProjectKey;
  cwd: string;
  workspaceRoot: string;
  configPath?: string;
};
type ProjectService = ReturnType<typeof createNodeWorkspaceService>;
type OpenDocumentSnapshot = {
  text: string;
  version: number;
  languageId: "xml" | "btcpp-xml";
};

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const openUris = new Set<string>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
const documentProjectKeys = new Map<string, ProjectKey>();
const projectBindings = new Map<ProjectKey, ProjectBinding>();
const projectServices = new Map<ProjectKey, ProjectService>();
const loadedProjects = new Set<ProjectKey>();

let workspaceRoots = [path.resolve(process.cwd())];
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

function normalizeFsPath(fsPath: string) {
  const normalized = path.resolve(fsPath).replace(/\\/g, "/").replace(/\/$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizeLanguageId(languageId: string) {
  return languageId === "btcpp-xml" ? "btcpp-xml" : "xml";
}

function toDocumentSnapshot(document: TextDocument): OpenDocumentSnapshot {
  return {
    text: document.getText(),
    version: document.version,
    languageId: normalizeLanguageId(document.languageId),
  };
}

function isWithinPath(parentPath: string, targetPath: string) {
  const normalizedParent = normalizeFsPath(parentPath);
  const normalizedTarget = normalizeFsPath(targetPath);
  return (
    normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}/`)
  );
}

function setWorkspaceRoots(nextRoots: string[]) {
  const deduped = new Map<string, string>();
  for (const root of nextRoots) {
    const resolvedRoot = path.resolve(root);
    const normalizedRoot = normalizeFsPath(resolvedRoot);
    if (deduped.has(normalizedRoot)) continue;
    deduped.set(normalizedRoot, resolvedRoot);
  }
  workspaceRoots = deduped.size > 0 ? [...deduped.values()] : [path.resolve(process.cwd())];
}

function collectWorkspaceRoots(params: InitializeParams & { rootUri?: string | null }) {
  const roots =
    params.workspaceFolders?.map((folder) => fileUriToPath(folder.uri)) ||
    (params.rootUri ? [fileUriToPath(params.rootUri)] : params.rootPath ? [params.rootPath] : []);
  return roots.length > 0 ? roots : [process.cwd()];
}

function resolveWorkspaceRootForPath(fsPath: string) {
  const normalizedPath = normalizeFsPath(fsPath);
  let matchedRoot = workspaceRoots[0] || path.resolve(process.cwd());
  let matchedLength = -1;
  for (const root of workspaceRoots) {
    const normalizedRoot = normalizeFsPath(root);
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
  if (!uri.startsWith("file://")) return workspaceRoots[0] || path.resolve(process.cwd());
  try {
    return resolveWorkspaceRootForPath(fileUriToPath(uri));
  } catch {
    return workspaceRoots[0] || path.resolve(process.cwd());
  }
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

async function pathExists(fsPath: string) {
  try {
    await access(fsPath);
    return true;
  } catch {
    return false;
  }
}

function getConfiguredConfigPath(workspaceRoot: string) {
  if (!settings.configPath) return undefined;
  return path.isAbsolute(settings.configPath)
    ? path.resolve(settings.configPath)
    : path.resolve(workspaceRoot, settings.configPath);
}

async function findNearestConfigPath(documentPath: string, workspaceRoot: string) {
  const boundedRoot = isWithinPath(workspaceRoot, documentPath) ? path.resolve(workspaceRoot) : undefined;
  let currentDir = path.dirname(documentPath);

  while (true) {
    const candidate = path.join(currentDir, "btxml.config.json");
    if (await pathExists(candidate)) return candidate;
    if (boundedRoot && normalizeFsPath(currentDir) === normalizeFsPath(boundedRoot)) return undefined;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    if (boundedRoot && !isWithinPath(boundedRoot, parentDir)) return undefined;
    currentDir = parentDir;
  }
}

function toWorkspaceProjectBinding(workspaceRoot: string): ProjectBinding {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  return {
    key: `workspace:${normalizeFsPath(resolvedWorkspaceRoot)}`,
    cwd: resolvedWorkspaceRoot,
    workspaceRoot: resolvedWorkspaceRoot,
  };
}

function toConfigProjectBinding(configPath: string, workspaceRoot: string): ProjectBinding {
  const resolvedConfigPath = path.resolve(configPath);
  return {
    key: `config:${normalizeFsPath(resolvedConfigPath)}`,
    cwd: path.dirname(resolvedConfigPath),
    workspaceRoot: path.resolve(workspaceRoot),
    configPath: resolvedConfigPath,
  };
}

async function resolveProjectForDocumentUri(uri: string): Promise<ProjectBinding> {
  const workspaceRoot = path.resolve(resolveWorkspaceRootForUri(uri));
  const configuredConfigPath = getConfiguredConfigPath(workspaceRoot);
  if (configuredConfigPath) {
    return toConfigProjectBinding(configuredConfigPath, workspaceRoot);
  }

  if (uri.startsWith("file://")) {
    try {
      const nearestConfigPath = await findNearestConfigPath(fileUriToPath(uri), workspaceRoot);
      if (nearestConfigPath) return toConfigProjectBinding(nearestConfigPath, workspaceRoot);
    } catch {
      // Fall through to workspace fallback when the URI cannot be resolved locally.
    }
  }

  return toWorkspaceProjectBinding(workspaceRoot);
}

function getProjectService(binding: ProjectBinding) {
  projectBindings.set(binding.key, binding);
  let projectService = projectServices.get(binding.key);
  if (projectService) return projectService;
  projectService = createNodeWorkspaceService({ cwd: binding.cwd });
  projectServices.set(binding.key, projectService);
  return projectService;
}

function getProjectBindingForDocumentUri(uri: string) {
  const key = documentProjectKeys.get(uri);
  return key ? projectBindings.get(key) : undefined;
}

function getProjectServiceForBoundDocumentUri(uri: string) {
  const binding = getProjectBindingForDocumentUri(uri);
  return binding ? getProjectService(binding) : undefined;
}

function getDocument(uri: string) {
  const normalizedUri = normalizeDocumentUri(uri);
  const projectService = getProjectServiceForBoundDocumentUri(normalizedUri);
  return (
    projectService?.getDocument(normalizedUri) ||
    (normalizedUri.startsWith("file://") ? projectService?.getDocument(fileUriToPath(normalizedUri)) : undefined) ||
    documents.get(normalizedUri)
  );
}

function getOpenDocumentSnapshot(uri: string) {
  const document = documents.get(uri);
  if (document) return toDocumentSnapshot(document);
  const projectService = getProjectServiceForBoundDocumentUri(uri);
  const workspaceDocument = projectService?.getDocument(uri);
  return workspaceDocument ? toDocumentSnapshot(workspaceDocument) : undefined;
}

function isProjectInUse(key: ProjectKey) {
  for (const projectKey of documentProjectKeys.values()) {
    if (projectKey === key) return true;
  }
  return false;
}

function disposeProject(key: ProjectKey) {
  const projectService = projectServices.get(key);
  if (projectService) projectService.dispose();
  projectServices.delete(key);
  projectBindings.delete(key);
  loadedProjects.delete(key);
}

function disposeProjectIfUnused(key: ProjectKey) {
  if (isProjectInUse(key)) return;
  disposeProject(key);
}

function disposeUnusedProjects() {
  for (const key of [...projectServices.keys()]) {
    disposeProjectIfUnused(key);
  }
}

async function reloadProject(binding: ProjectBinding, options?: { publishDiagnostics?: boolean }) {
  const projectService = getProjectService(binding);
  const result = await projectService.loadProject(
    binding.configPath
      ? {
          cwd: binding.cwd,
          configPath: binding.configPath,
        }
      : {
          cwd: binding.workspaceRoot,
        },
  );
  loadedProjects.add(binding.key);

  if (!result.ok && result.diagnostics.length > 0) {
    const lines = result.diagnostics.map((diag) => `${diag.severity} ${diag.code} ${diag.message}`);
    process.stderr.write(`${lines.join("\n")}\n`);
  }

  if (options?.publishDiagnostics !== false) {
    for (const uri of openUris) {
      if (documentProjectKeys.get(uri) !== binding.key) continue;
      publishDiagnostics(uri);
    }
  }

  return result;
}

async function ensureProjectLoaded(binding: ProjectBinding) {
  if (loadedProjects.has(binding.key)) return false;
  await reloadProject(binding);
  return true;
}

async function bindOpenDocument(uri: string, snapshot: OpenDocumentSnapshot) {
  const normalizedUri = normalizeDocumentUri(uri);
  const nextBinding = await resolveProjectForDocumentUri(normalizedUri);
  const previousKey = documentProjectKeys.get(normalizedUri);
  const previousService = previousKey ? projectServices.get(previousKey) : undefined;
  const nextService = getProjectService(nextBinding);
  const changedProject = previousKey !== nextBinding.key;
  const wasLoaded = loadedProjects.has(nextBinding.key);

  if (changedProject) previousService?.closeDocument(normalizedUri);

  documentProjectKeys.set(normalizedUri, nextBinding.key);
  projectBindings.set(nextBinding.key, nextBinding);

  if (!wasLoaded) {
    await reloadProject(nextBinding, { publishDiagnostics: false });
  }

  if (!wasLoaded || changedProject || !nextService.getDocument(normalizedUri)) {
    nextService.openDocument(
      normalizedUri,
      snapshot.text,
      snapshot.version,
      snapshot.languageId,
    );
  } else {
    nextService.updateDocument(
      normalizedUri,
      snapshot.text,
      snapshot.version,
      snapshot.languageId,
    );
  }

  if (changedProject && previousKey) disposeProjectIfUnused(previousKey);
  return { binding: nextBinding, reloaded: !wasLoaded };
}

async function rebindAllOpenDocuments() {
  for (const uri of openUris) {
    const snapshot = getOpenDocumentSnapshot(uri);
    if (!snapshot) continue;
    await bindOpenDocument(uri, snapshot);
    publishDiagnostics(uri);
  }
  disposeUnusedProjects();
}

async function getProjectServiceForDocumentUri(uri: string) {
  const normalizedUri = normalizeDocumentUri(uri);
  const boundBinding = getProjectBindingForDocumentUri(normalizedUri);
  if (boundBinding) {
    await ensureProjectLoaded(boundBinding);
    return getProjectService(boundBinding);
  }

  const binding = await resolveProjectForDocumentUri(normalizedUri);
  await ensureProjectLoaded(binding);
  return getProjectService(binding);
}

function publishDiagnostics(uri: string) {
  const normalizedUri = normalizeDocumentUri(uri);
  if (!settings.diagnosticsEnabled) {
    connection.sendNotification("textDocument/publishDiagnostics", {
      uri: normalizedUri,
      diagnostics: [],
    });
    return;
  }

  const document = getDocument(normalizedUri);
  const projectService = getProjectServiceForBoundDocumentUri(normalizedUri);
  if (!document || !projectService) {
    connection.sendNotification("textDocument/publishDiagnostics", {
      uri: normalizedUri,
      diagnostics: [],
    });
    return;
  }

  const result = projectService.getDiagnostics(normalizedUri);
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

function bindingMatchesFilePath(binding: ProjectBinding, fsPath: string) {
  if (binding.configPath && normalizeFsPath(binding.configPath) === normalizeFsPath(fsPath)) return true;
  return isWithinPath(binding.cwd, fsPath);
}

documents.onDidOpen(async (event: TextDocumentChangeEvent<TextDocument>) => {
  const normalizedUri = normalizeDocumentUri(event.document.uri);
  openUris.add(normalizedUri);
  await bindOpenDocument(normalizedUri, toDocumentSnapshot(event.document));
  publishDiagnostics(normalizedUri);
});

documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
  const normalizedUri = normalizeDocumentUri(event.document.uri);
  const projectService = getProjectServiceForBoundDocumentUri(normalizedUri);
  if (!projectService) return;
  projectService.updateDocument(
    normalizedUri,
    event.document.getText(),
    event.document.version,
    normalizeLanguageId(event.document.languageId),
  );
  scheduleDiagnostics(normalizedUri);
});

documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
  const normalizedUri = normalizeDocumentUri(event.document.uri);
  const projectKey = documentProjectKeys.get(normalizedUri);
  const projectService = projectKey ? projectServices.get(projectKey) : undefined;

  openUris.delete(normalizedUri);

  const existing = debounceTimers.get(normalizedUri);
  if (existing) clearTimeout(existing);
  debounceTimers.delete(normalizedUri);

  projectService?.closeDocument(normalizedUri);
  if (projectKey) {
    documentProjectKeys.delete(normalizedUri);
    disposeProjectIfUnused(projectKey);
  }

  connection.sendNotification("textDocument/publishDiagnostics", {
    uri: normalizedUri,
    diagnostics: [],
  });
});

connection.onInitialize((params: InitializeParams) => {
  applySettings(params.initializationOptions);
  setWorkspaceRoots(collectWorkspaceRoots(params as InitializeParams & { rootUri?: string | null }));
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
    loadedProjects.clear();
    await rebindAllOpenDocuments();
  },
);
connection.onNotification(
  "workspace/didChangeWorkspaceFolders",
  async (params: DidChangeWorkspaceFoldersParams) => {
    const removedRoots = new Set(
      params.event.removed.map((folder) => normalizeFsPath(fileUriToPath(folder.uri))),
    );
    const addedRoots = params.event.added.map((folder) => fileUriToPath(folder.uri));

    setWorkspaceRoots(
      workspaceRoots
        .filter((rootPath) => !removedRoots.has(normalizeFsPath(rootPath)))
        .concat(addedRoots),
    );

    loadedProjects.clear();
    await rebindAllOpenDocuments();
  },
);
connection.onNotification("workspace/didChangeWatchedFiles", async (params) => {
  const changes = (params as { changes?: Array<{ uri: string }> })?.changes || [];
  if (changes.length === 0) return;

  if (changes.some((change) => normalizeDocumentUri(change.uri).toLowerCase().endsWith("btxml.config.json"))) {
    loadedProjects.clear();
    await rebindAllOpenDocuments();
    return;
  }

  const reloadedProjects = new Set<ProjectKey>();
  for (const change of changes) {
    const normalizedUri = normalizeDocumentUri(change.uri);
    if (!normalizedUri.startsWith("file://")) continue;
    const fsPath = fileUriToPath(normalizedUri);

    for (const binding of projectBindings.values()) {
      if (!bindingMatchesFilePath(binding, fsPath)) continue;
      const result = await getProjectService(binding).notifyWatchedFileChanged(normalizedUri);
      if (!result) continue;
      loadedProjects.add(binding.key);
      reloadedProjects.add(binding.key);
    }
  }

  if (reloadedProjects.size === 0) return;
  for (const uri of openUris) {
    const projectKey = documentProjectKeys.get(uri);
    if (!projectKey || !reloadedProjects.has(projectKey)) continue;
    publishDiagnostics(uri);
  }
});

connection.onRequest("textDocument/completion", async (params: CompletionParams) => {
  if (!settings.completionEnabled) return [];
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleCompletion(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/hover", async (params: TextDocumentPositionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleHover(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/definition", async (params: TextDocumentPositionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleDefinition(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/references", async (params: TextDocumentPositionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleReferences(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/documentSymbol", async (params: DocumentSymbolParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleDocumentSymbols(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
    SymbolKind,
  );
});

connection.onRequest("textDocument/formatting", async (params: DocumentFormattingParams) => {
  if (!settings.formatEnabled) return [];
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleFormatting(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("textDocument/codeAction", async (params: CodeActionParams) => {
  const normalizedParams = withNormalizedTextDocumentUri(params);
  return handleCodeActions(
    await getProjectServiceForDocumentUri(normalizedParams.textDocument.uri),
    getDocument(normalizedParams.textDocument.uri),
    normalizedParams,
  );
});

connection.onRequest("btxml/getNodeModelById", async (params: GetNodeModelByIdParams) => {
  const normalizedUri = normalizeDocumentUri(params.uri);
  return handleGetNodeModelById(await getProjectServiceForDocumentUri(normalizedUri), {
    ...params,
    uri: normalizedUri,
  });
});

connection.onRequest("btxml/getChildCapability", async (params: GetChildCapabilityParams) => {
  const normalizedUri = normalizeDocumentUri(params.uri);
  return handleGetChildCapability(await getProjectServiceForDocumentUri(normalizedUri), {
    ...params,
    uri: normalizedUri,
  });
});

export async function startLanguageServer() {
  documents.listen(connection);
  connection.listen();
}
