import { constants as FsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type EffectiveFileConfig, getEffectiveConfigForFile } from "@btxml/config";
import {
  checkProject,
  discoverProject,
  getProjectResolvedConfig,
  loadProjectDocuments,
  loadProjectSemanticIndex,
} from "@btxml/project";
import { getNodeProjectRootDir, pathToFileUri } from "@btxml/project/node";
import type {
  InternalLoadProjectOptions,
  WorkspaceLoadResult,
  WorkspaceRuntimeState,
} from "./internal-types.js";
import type {
  BtEditorService,
  BtProjectEditorService,
  DirEntry,
  FileStat,
  LoadProjectOptions,
  NodeWorkspaceServiceOptions,
  ProjectLoadResult,
  WorkspaceHost,
} from "./public-types.js";
import { createWorkspaceService } from "./workspace-service.js";

function toWorkspaceDocumentUri(rootDir: string, document: { uri: string; path?: string }) {
  if (document.uri.startsWith("file://")) return document.uri;
  if (document.path?.startsWith("file://")) return document.path;
  const relativePath =
    document.path && !path.isAbsolute(document.path) ? document.path : document.uri;
  return pathToFileUri(path.resolve(rootDir, relativePath));
}

function toWorkspaceDocuments(
  rootDir: string,
  documents: import("@btxml/syntax").BtDocument[],
): import("@btxml/syntax").BtDocument[] {
  return documents.map((document) => {
    const uri = toWorkspaceDocumentUri(rootDir, document);
    const filePath = document.path?.startsWith("file://")
      ? fileUriToPath(document.path)
      : document.path;
    return {
      ...document,
      uri,
      path: filePath,
    };
  });
}

export type {
  BtProjectEditorService,
  LoadProjectOptions,
  NodeWorkspaceServiceOptions,
  ProjectLoadResult,
} from "./public-types.js";

function statType(stat: import("node:fs").Stats): FileStat["type"] {
  if (stat.isFile()) return "file";
  if (stat.isDirectory()) return "directory";
  return "other";
}

function ensureFileUri(uri: string) {
  if (uri.startsWith("file://")) return uri;
  return pathToFileURL(path.resolve(uri)).href;
}

function fileUriToPath(uri: string) {
  return fileURLToPath(ensureFileUri(uri));
}

function toFileUri(filePath: string) {
  return pathToFileURL(path.resolve(filePath)).href;
}

function isRelevantUri(uri: string) {
  const name = uri.toLowerCase();
  return (
    name.endsWith(".xml") ||
    name.endsWith(".json") ||
    name.endsWith("btxml.config.json") ||
    name.includes("treenodesmodel")
  );
}

function normalizeWorkspaceRoot(rootDir: string) {
  return rootDir.replace(/\\/g, "/").replace(/\/$/, "");
}

function getRelativePath(rootDir: string, uri: string) {
  const root = normalizeWorkspaceRoot(rootDir);
  const target = fileUriToPath(uri).replace(/\\/g, "/");
  if (target === root) return "";
  if (target.startsWith(`${root}/`)) return target.slice(root.length + 1);
  return uri;
}

function getEffectiveNodeConfig(
  resolved: ReturnType<BtEditorService["getResolvedConfig"]>,
  rootDir: string | undefined,
  uri: string,
  fallback: EffectiveFileConfig | undefined,
) {
  if (!resolved) return fallback;
  if (rootDir && uri.startsWith("file://")) {
    return getEffectiveConfigForFile(resolved, getRelativePath(rootDir, uri));
  }
  return fallback;
}

function toProjectHost(host: WorkspaceHost, cwd: string) {
  const rootUri = toFileUri(cwd);
  const realpath = host.realpath;
  const projectHost = {
    rootUri() {
      return rootUri;
    },
    readFile(uri: string) {
      return host.readFile(uri);
    },
    exists(uri: string) {
      return host.exists(uri);
    },
    async stat(uri: string) {
      return host.stat ? host.stat(uri) : undefined;
    },
    async readDir(uri: string) {
      return [...(await host.readDir(uri))];
    },
    realpath: realpath ? async (uri: string) => realpath(uri) : undefined,
  };
  return projectHost;
}

function toProjectLoadResult(result: WorkspaceLoadResult): ProjectLoadResult {
  return {
    ok: result.projectOk ?? result.ok,
    diagnostics: result.diagnostics,
  };
}

export function createNodeWorkspaceHost(cwd = process.cwd()): WorkspaceHost {
  const root = path.resolve(cwd);
  return {
    async readFile(uri: string) {
      return fs.readFile(fileUriToPath(uri), "utf8");
    },
    async exists(uri: string) {
      try {
        await fs.access(fileUriToPath(uri), FsConstants.F_OK);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return false;
      }
    },
    async stat(uri: string) {
      try {
        const stat = await fs.stat(fileUriToPath(uri));
        return { type: statType(stat), size: stat.size };
      } catch {
        return undefined;
      }
    },
    async readDir(uri: string): Promise<readonly DirEntry[]> {
      const entries = await fs.readdir(fileUriToPath(uri), { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other",
      }));
    },
    async realpath(uri: string) {
      const resolved = await fs.realpath(fileUriToPath(uri));
      return pathToFileURL(path.isAbsolute(resolved) ? resolved : path.resolve(root, resolved))
        .href;
    },
  };
}

export function createNodeWorkspaceService(
  options: NodeWorkspaceServiceOptions = {},
): BtEditorService & BtProjectEditorService {
  const host = options.host ?? createNodeWorkspaceHost(options.cwd);
  let runtimeState: WorkspaceRuntimeState | undefined;
  let runtimeVersion = 0;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let lastLoadOptions: InternalLoadProjectOptions | undefined;
  let pendingReload:
    | {
        promise: Promise<WorkspaceLoadResult>;
        resolve: (result: WorkspaceLoadResult) => void;
        reject: (error: unknown) => void;
      }
    | undefined;

  async function load(loadOptions: InternalLoadProjectOptions = {}): Promise<WorkspaceLoadResult> {
    lastLoadOptions = Object.keys(loadOptions).length > 0 ? { ...loadOptions } : undefined;
    const rawConfig = options.config;
    const rootDir =
      loadOptions.projectRoot ||
      options.projectRoot ||
      loadOptions.cwd ||
      options.cwd ||
      process.cwd();
    const cwd = loadOptions.cwd || options.cwd || rootDir;
    const projectHost = toProjectHost(loadOptions.host ?? host, rootDir);

    const discovered = await discoverProject({
      rootUri: pathToFileUri(rootDir),
      configUri:
        loadOptions.configPath || options.configPath
          ? pathToFileUri(path.resolve(cwd, loadOptions.configPath || options.configPath || ""))
          : undefined,
      host: projectHost,
    });
    if (!discovered.project) {
      runtimeState = {
        version: ++runtimeVersion,
        diagnostics: discovered.diagnostics,
        rawConfig,
      };
      return {
        ok: false,
        projectOk: false,
        diagnostics: discovered.diagnostics,
        rawConfig,
      };
    }

    const loadedDocuments = await loadProjectDocuments(discovered.project, projectHost);
    const workspaceDocuments = toWorkspaceDocuments(rootDir, loadedDocuments.documents);
    const workspaceModelDocuments = toWorkspaceDocuments(
      rootDir,
      loadedDocuments.externalModelDocuments,
    );
    const discoveredResolvedConfig = getProjectResolvedConfig(discovered.project);
    if (!discoveredResolvedConfig) {
      runtimeState = {
        version: ++runtimeVersion,
        diagnostics: discovered.diagnostics,
        rawConfig,
      };
      return {
        ok: false,
        projectOk: false,
        diagnostics: discovered.diagnostics,
        rawConfig,
      };
    }

    const semantic = await loadProjectSemanticIndex({
      project: discovered.project,
      documents: workspaceDocuments,
      externalModelDocuments: workspaceModelDocuments,
      resolutionMode: "workspace",
      resolveGraph: false,
      host: projectHost,
    });

    const checkResult = await checkProject({
      project: discovered.project,
      documents: workspaceDocuments,
      externalModelDocuments: workspaceModelDocuments,
      projectDiagnostics: [...discovered.diagnostics, ...loadedDocuments.diagnostics],
      host: projectHost,
    });

    const diagnostics = [
      ...discovered.diagnostics,
      ...loadedDocuments.diagnostics,
      ...semantic.diagnostics,
      ...checkResult.projectDiagnostics,
      ...checkResult.files.flatMap((file) => file.diagnostics),
    ];

    runtimeState = {
      version: ++runtimeVersion,
      diagnostics,
      rawConfig,
      resolvedConfig: discoveredResolvedConfig,
      workspace: {
        rootDir: getNodeProjectRootDir(discovered.project),
        documents: workspaceDocuments,
        semanticIndex: semantic.semanticIndex,
        nodeDefinitionModels: semantic.nodeDefinitionModels,
        augmentations: loadedDocuments.augmentations,
      },
    };

    return {
      ok: discovered.ok && semantic.ok,
      projectOk: checkResult.ok,
      diagnostics: [...diagnostics],
      rawConfig,
      resolvedConfig: discoveredResolvedConfig,
      workspace: runtimeState.workspace,
    };
  }

  function scheduleReload(delayMs = 300) {
    if (reloadTimer) clearTimeout(reloadTimer);
    if (!pendingReload) {
      let resolveReload: ((result: WorkspaceLoadResult) => void) | undefined;
      let rejectReload: ((error: unknown) => void) | undefined;
      const promise = new Promise<WorkspaceLoadResult>((resolve, reject) => {
        resolveReload = resolve;
        rejectReload = reject;
      });
      pendingReload = {
        promise,
        resolve(result) {
          resolveReload?.(result);
        },
        reject(error) {
          rejectReload?.(error);
        },
      };
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      const scheduled = pendingReload;
      void load(lastLoadOptions)
        .then((result) => {
          scheduled?.resolve(result);
        })
        .catch((error) => {
          scheduled?.reject(error);
        })
        .finally(() => {
          if (pendingReload === scheduled) pendingReload = undefined;
        });
    }, delayMs);
    return pendingReload.promise;
  }

  const workspace = createWorkspaceService({
    config: options.config,
    getRuntimeState: () => runtimeState,
  } as NodeWorkspaceServiceOptions & { getRuntimeState: () => WorkspaceRuntimeState | undefined });

  return {
    ...workspace,
    getResolvedConfig() {
      return runtimeState?.resolvedConfig ?? workspace.getResolvedConfig();
    },
    getEffectiveConfigForDocument(uri: string) {
      return getEffectiveNodeConfig(
        this.getResolvedConfig(),
        runtimeState?.workspace?.rootDir,
        uri,
        workspace.getEffectiveConfigForDocument(uri),
      );
    },
    async loadProject(loadOptions?: LoadProjectOptions) {
      return toProjectLoadResult(await load(loadOptions));
    },
    async refreshProject(loadOptions?: LoadProjectOptions) {
      const result = await load(loadOptions);
      return {
        ok: result.ok,
        diagnostics: result.diagnostics,
      };
    },
    notifyWatchedFileChanged(uri: string) {
      if (!isRelevantUri(uri)) return Promise.resolve(undefined);
      return scheduleReload().then((result) => toProjectLoadResult(result));
    },
    getProjectConfig() {
      return runtimeState?.rawConfig ?? options.config;
    },
    dispose() {
      workspace.dispose();
      runtimeState = undefined;
      if (reloadTimer) clearTimeout(reloadTimer);
      pendingReload?.reject(new Error("Node workspace service disposed during pending reload"));
      pendingReload = undefined;
    },
  };
}

export { fileUriToPath, pathToFileUri };
