import {
  fileUriToPath,
  getEffectiveConfigForFile,
  getEffectiveConfigForUri,
  isIncludedFilePath,
  isIncludedUri,
  normalizeBtxmlConfig,
} from "@btxml/config";
import type { EffectiveFileConfig, RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import {
  type Diagnostic,
  type SourcePosition,
  type SourceRange,
  createTextDocument,
} from "@btxml/foundation";
import {
  buildSemanticDocumentView,
  findSemanticNodeAtPosition,
  findSemanticPortBindingAtPosition,
  getEffectiveNodeModels,
  getGenericNodeKindFromTag,
  resolveNodeUsage,
  resolvePortUsage,
} from "@btxml/semantic";
import type { BtDocument, BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import type {
  BtTextDocument,
  InternalCodeActionsInput,
  InternalCompletionInput,
  InternalDefinitionInput,
  InternalDiagnosticsInput,
  InternalDocumentSymbolsInput,
  InternalHoverInput,
  InternalReferencesInput,
  InternalWorkspaceServiceOptions,
  WorkspaceSnapshot,
} from "./internal-types.js";
import { buildLanguageRequestContext } from "./parsed-state.js";
import type {
  BtEditorService,
  BtEditorServiceOptions,
  ChildCapabilityResult,
  CodeActionsResult,
  CompletionResult,
  DefinitionResult,
  DiagnosticsResult,
  DocumentSymbolsResult,
  FormattingResult,
  HoverResult,
  NodeCatalogResult,
  NodeModelResult,
  NodeUsageAtResult,
  PortInfoResult,
  ReferencesResult,
  SemanticDocumentViewResult,
  WorkspaceDiagnosticsResult,
} from "./public-types.js";
import { createLanguageService } from "./service.js";

type SemanticSnapshot = {
  document: BtTextDocument;
  documentVersion: number;
  workspace: WorkspaceSnapshot | undefined;
  workspaceVersion: number;
  configFingerprint: string;
  diagnostics: DiagnosticsResult;
  parsed?: BtDocument;
  semantic: ReturnType<typeof buildLanguageRequestContext>["semantic"];
  config: ReturnType<typeof buildLanguageRequestContext>["config"];
  nodeUsagePolicy: ReturnType<typeof buildLanguageRequestContext>["nodeUsagePolicy"];
  view?: SemanticDocumentViewResult["view"];
  models?: NodeCatalogResult["models"];
};

type DocumentAccess = {
  document: BtTextDocument;
  effectiveConfig: EffectiveFileConfig | undefined;
  snapshot: SemanticSnapshot;
  emitDiagnostics: boolean;
};

const ZERO_POSITION = { line: 0, character: 0, offset: 0 };

const ZERO_RANGE = {
  start: ZERO_POSITION,
  end: ZERO_POSITION,
} as const;

function toSyntheticAttributes(
  attributes: Record<string, string | undefined> | undefined,
): BtXmlAttribute[] {
  if (!attributes) return [];
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({
      name,
      value: value ?? "",
      range: ZERO_RANGE,
      nameRange: ZERO_RANGE,
      valueRange: ZERO_RANGE,
    }));
}

function createSyntheticElement(
  tagName: string,
  attributes: Record<string, string | undefined> | undefined,
): BtXmlElement {
  return {
    kind: "element",
    name: tagName,
    attributes: toSyntheticAttributes(attributes),
    children: [],
    range: ZERO_RANGE,
    openTagRange: ZERO_RANGE,
    selfClosing: true,
  };
}

function getChildCapabilityFromModelKind(
  kind: NonNullable<ChildCapabilityResult["kind"]>,
): ChildCapabilityResult {
  return {
    capable: kind === "Control" || kind === "Decorator",
    reason: "model-kind",
    kind,
  };
}

function serializeSnapshotValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeSnapshotValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${serializeSnapshotValue(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function buildConfigFingerprint(config: EffectiveFileConfig | undefined): string {
  return serializeSnapshotValue(config);
}

function buildSemanticSnapshot(
  document: BtTextDocument,
  workspace: WorkspaceSnapshot | undefined,
  workspaceVersion: number,
  config: EffectiveFileConfig | undefined,
  configFingerprint: string,
): SemanticSnapshot {
  const context = buildLanguageRequestContext(
    {
      document,
      workspace,
      config,
      mode: "tolerant",
    } as InternalDiagnosticsInput,
    {},
  );

  return {
    document,
    documentVersion: document.version,
    workspace,
    workspaceVersion,
    configFingerprint,
    diagnostics: {
      diagnostics: context.diagnostics,
      partial: context.partial,
    },
    parsed: context.parsed,
    semantic: context.semantic,
    config: context.config,
    nodeUsagePolicy: context.nodeUsagePolicy,
  };
}

function hasBtXmlShape(document: BtDocument | undefined): boolean {
  const root = document?.root;
  if (!root) return false;
  if (root.name === "BehaviorTree") return true;
  if (root.name === "TreeNodesModel") return true;

  const hasBehaviorTree = root.children.some(
    (child) => child.kind === "element" && child.name === "BehaviorTree",
  );
  const hasTreeNodesModel = root.children.some(
    (child) => child.kind === "element" && child.name === "TreeNodesModel",
  );
  const hasFormat4 = root.attributes.some((attribute) => {
    return attribute.name === "BTCPP_format" && attribute.value === "4";
  });

  return root.name === "root" && (hasFormat4 || hasBehaviorTree || hasTreeNodesModel);
}

function normalizeSlashPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/$/, "");
}

function getRelativeWorkspacePath(rootDir: string, uri: string): string | undefined {
  if (!uri.startsWith("file://")) return undefined;
  const rootPath = normalizeSlashPath(rootDir);
  const documentPath = normalizeSlashPath(fileUriToPath(uri));
  if (documentPath === rootPath) return "";
  if (!documentPath.startsWith(`${rootPath}/`)) return undefined;
  return documentPath.slice(rootPath.length + 1);
}

export function createWorkspaceService(options: BtEditorServiceOptions = {}): BtEditorService {
  const internalOptions = options as InternalWorkspaceServiceOptions;
  const documents = new Map<string, BtTextDocument>();
  const semanticSnapshots = new Map<string, SemanticSnapshot>();
  const languageService = createLanguageService();
  const runtimeDiagnostics: Diagnostic[] = [];
  const resolvedConfig = options.config
    ? normalizeBtxmlConfig(options.config as RawBtxmlConfig).config
    : undefined;

  function getRuntimeState() {
    return internalOptions.getRuntimeState?.();
  }

  function getRuntimeWorkspace() {
    return getRuntimeState()?.workspace;
  }

  function getWorkspaceVersion() {
    return getRuntimeState()?.version ?? 0;
  }

  function getSemanticSnapshot(
    document: BtTextDocument,
    effectiveConfig: EffectiveFileConfig | undefined,
  ): SemanticSnapshot {
    const workspace = getRuntimeWorkspace();
    const workspaceVersion = getWorkspaceVersion();
    const configFingerprint = buildConfigFingerprint(effectiveConfig);
    const cached = semanticSnapshots.get(document.uri);
    if (
      cached &&
      cached.documentVersion === document.version &&
      cached.workspaceVersion === workspaceVersion &&
      cached.document === document &&
      cached.workspace === workspace &&
      cached.configFingerprint === configFingerprint
    ) {
      return cached;
    }

    const snapshot = buildSemanticSnapshot(
      document,
      workspace,
      workspaceVersion,
      effectiveConfig,
      configFingerprint,
    );
    semanticSnapshots.set(document.uri, snapshot);
    return snapshot;
  }

  function getSemanticView(snapshot: SemanticSnapshot): SemanticDocumentViewResult["view"] {
    if (!snapshot.parsed) return undefined;
    if (snapshot.view) return snapshot.view;

    snapshot.view = buildSemanticDocumentView(snapshot.parsed, snapshot.semantic, {
      config: snapshot.config,
      policy: snapshot.nodeUsagePolicy,
    });
    return snapshot.view;
  }

  function getNodeCatalogModels(snapshot: SemanticSnapshot): NodeCatalogResult["models"] {
    if (snapshot.models) return snapshot.models;
    snapshot.models = getEffectiveNodeModels(snapshot.semantic);
    return snapshot.models;
  }

  function isTrackedBtXmlDocument(uri: string): boolean {
    const workspace = getRuntimeWorkspace();
    if (!workspace) return false;
    return workspace.documents.some((candidate) => candidate.isBtXml && candidate.uri === uri);
  }

  function isConfigIncludedDocument(uri: string): boolean {
    const resolved = service.getResolvedConfig();
    if (!resolved) return false;
    const rootDir = getRuntimeWorkspace()?.rootDir ?? options.configBasePath;
    const relativePath = rootDir ? getRelativeWorkspacePath(rootDir, uri) : undefined;
    if (relativePath !== undefined) {
      return isIncludedFilePath(resolved, relativePath);
    }
    return isIncludedUri(resolved, uri);
  }

  function isBtXmlDocument(document: BtTextDocument, snapshot: SemanticSnapshot): boolean {
    return (
      document.languageId === "btcpp-xml" ||
      snapshot.parsed?.isBtXml === true ||
      hasBtXmlShape(snapshot.parsed) ||
      isConfigIncludedDocument(document.uri) ||
      isTrackedBtXmlDocument(document.uri)
    );
  }

  function shouldEmitDiagnostics(document: BtTextDocument, snapshot: SemanticSnapshot): boolean {
    return (
      document.languageId === "btcpp-xml" ||
      snapshot.parsed?.isBtXml === true ||
      hasBtXmlShape(snapshot.parsed) ||
      isTrackedBtXmlDocument(document.uri)
    );
  }

  function getDocumentAccess(uri: string): DocumentAccess | undefined {
    const document = documents.get(uri);
    if (!document) return undefined;
    const effectiveConfig = service.getEffectiveConfigForDocument(document.uri);
    const snapshot = getSemanticSnapshot(document, effectiveConfig);
    if (!isBtXmlDocument(document, snapshot)) return undefined;
    return {
      document,
      effectiveConfig,
      snapshot,
      emitDiagnostics: shouldEmitDiagnostics(document, snapshot),
    };
  }

  function getSemanticDocumentResult(
    uri: string,
    effectiveConfig: EffectiveFileConfig | undefined,
  ): SemanticDocumentViewResult {
    const document = documents.get(uri);
    if (!document) return { diagnostics: [] };
    const snapshot = getSemanticSnapshot(document, effectiveConfig);
    const view = getSemanticView(snapshot);
    if (!view) {
      return {
        diagnostics: snapshot.diagnostics.diagnostics,
        partial: snapshot.diagnostics.partial,
      };
    }

    return {
      view,
      diagnostics: snapshot.diagnostics.diagnostics,
      partial: snapshot.diagnostics.partial,
    };
  }

  const service: BtEditorService = {
    openDocument(uri: string, text: string, version = 0, languageId = "xml") {
      documents.set(uri, createTextDocument(uri, text, version, languageId));
      semanticSnapshots.delete(uri);
    },
    updateDocument(uri: string, text: string, version = 0, languageId = "xml") {
      documents.set(uri, createTextDocument(uri, text, version, languageId));
      semanticSnapshots.delete(uri);
    },
    closeDocument(uri: string) {
      documents.delete(uri);
      semanticSnapshots.delete(uri);
    },
    getResolvedConfig(): ResolvedBtxmlConfig | undefined {
      return getRuntimeState()?.resolvedConfig ?? resolvedConfig;
    },
    getEffectiveConfigForDocument(uri: string): EffectiveFileConfig | undefined {
      const config = this.getResolvedConfig();
      if (!config) return undefined;
      const rootDir = getRuntimeWorkspace()?.rootDir ?? options.configBasePath;
      const relativePath = rootDir ? getRelativeWorkspacePath(rootDir, uri) : undefined;
      if (relativePath !== undefined) {
        return getEffectiveConfigForFile(config, relativePath);
      }
      return getEffectiveConfigForUri(config, uri);
    },
    getDocument(uri: string) {
      return documents.get(uri);
    },
    getDiagnostics(uri: string): DiagnosticsResult {
      const access = getDocumentAccess(uri);
      if (!access || !access.emitDiagnostics) return { diagnostics: [] };
      const result: DiagnosticsResult = {
        diagnostics: access.snapshot.diagnostics.diagnostics,
      };
      if (access.snapshot.diagnostics.partial) result.partial = true;
      return result;
    },
    getWorkspaceDiagnostics(): WorkspaceDiagnosticsResult {
      return { diagnostics: [...(getRuntimeState()?.diagnostics ?? runtimeDiagnostics)] };
    },
    getSemanticDocumentView(uri: string): SemanticDocumentViewResult {
      const access = getDocumentAccess(uri);
      if (!access) return { diagnostics: [] };
      return getSemanticDocumentResult(uri, access.effectiveConfig);
    },
    getNodeCatalog(uri: string): NodeCatalogResult {
      const access = getDocumentAccess(uri);
      if (!access) return { models: [] };
      return { models: getNodeCatalogModels(access.snapshot) };
    },
    getSemanticNode(uri: string, nodeId: string) {
      const access = getDocumentAccess(uri);
      if (!access) return {};
      const result = getSemanticDocumentResult(uri, access.effectiveConfig);
      return {
        node: result.view?.nodes.find((candidate) => candidate.nodeId === nodeId),
      };
    },
    getNodeUsageAt(uri: string, position: SourcePosition): NodeUsageAtResult {
      const access = getDocumentAccess(uri);
      if (!access) return {};
      const view = getSemanticView(access.snapshot);
      if (!access.snapshot.parsed || !view) return {};

      const node = findSemanticNodeAtPosition(view, position);
      if (!node) return {};

      return {
        node,
        usage: node.usage,
      };
    },
    getNodeModelById(modelId: string, uri?: string): NodeModelResult {
      const targetUri = uri ?? documents.keys().next().value;
      if (!targetUri) return {};
      const catalog = this.getNodeCatalog(targetUri);
      return {
        model: catalog.models.find((candidate) => candidate.id === modelId),
      };
    },
    getChildCapability(
      uri: string,
      tagName: string,
      attributes?: Record<string, string | undefined>,
    ): ChildCapabilityResult {
      if (tagName === "BehaviorTree") {
        return { capable: true, reason: "behavior-tree" };
      }

      const genericKind = getGenericNodeKindFromTag(tagName);
      if (genericKind === "Control") {
        return { capable: true, reason: "generic-control" };
      }
      if (genericKind === "Decorator") {
        return { capable: true, reason: "generic-decorator" };
      }
      if (genericKind === "Action" || genericKind === "Condition") {
        return { capable: false, reason: "generic-leaf" };
      }

      const access = getDocumentAccess(uri);
      if (!access) {
        return { capable: false, reason: "unknown-model" };
      }

      const usage = resolveNodeUsage(access.snapshot.semantic, {
        element: createSyntheticElement(tagName, attributes),
        documentRoot: access.snapshot.parsed?.root,
        uri,
        config: access.snapshot.config,
        policy: access.snapshot.nodeUsagePolicy,
      });

      if (usage.model.status !== "resolved") {
        return {
          capable: false,
          reason: "unknown-model",
          modelId: usage.nodeType,
        };
      }

      return {
        ...getChildCapabilityFromModelKind(usage.model.model.kind),
        modelId: usage.model.model.id,
      };
    },
    getPortInfoAt(uri: string, position: SourcePosition): PortInfoResult {
      const access = getDocumentAccess(uri);
      if (!access) return {};
      const view = getSemanticView(access.snapshot);
      if (!access.snapshot.parsed || !view) return {};
      const binding = findSemanticPortBindingAtPosition(view, position);
      const nodeUsageAt = this.getNodeUsageAt(uri, position);
      const node = nodeUsageAt.node;
      const usage =
        binding && node
          ? resolvePortUsage(access.snapshot.semantic, {
              element: node.usage.element,
              documentRoot: access.snapshot.parsed.root,
              attributeName: binding.portName,
              uri,
              config: access.snapshot.config,
              policy: access.snapshot.nodeUsagePolicy,
            })
          : undefined;
      return {
        node,
        binding,
        port: binding?.resolution.status === "resolved" ? binding.resolution.port : undefined,
        usage,
        nodeUsage: nodeUsageAt.usage,
      };
    },
    getFormattingEdits(uri: string): FormattingResult {
      const access = getDocumentAccess(uri);
      if (!access) return { edits: [], diagnostics: [] };
      return languageService.getFormattingEdits({
        document: access.document,
        config: access.effectiveConfig,
      });
    },
    getCompletions(
      uri: string,
      position: SourcePosition,
      triggerCharacter?: string,
    ): CompletionResult {
      const access = getDocumentAccess(uri);
      if (!access) return { items: [] };
      return languageService.getCompletions({
        document: access.document,
        position,
        workspace: getRuntimeWorkspace(),
        triggerCharacter,
        config: access.effectiveConfig,
      } as InternalCompletionInput);
    },
    getHover(uri: string, position: SourcePosition): HoverResult {
      const access = getDocumentAccess(uri);
      if (!access) return {};
      return languageService.getHover({
        document: access.document,
        position,
        workspace: getRuntimeWorkspace(),
        config: access.effectiveConfig,
      } as InternalHoverInput);
    },
    getDefinition(uri: string, position: SourcePosition): DefinitionResult {
      const access = getDocumentAccess(uri);
      if (!access) return { locations: [] };
      return languageService.getDefinition({
        document: access.document,
        position,
        workspace: getRuntimeWorkspace(),
        config: access.effectiveConfig,
      } as InternalDefinitionInput);
    },
    getReferences(uri: string, position: SourcePosition): ReferencesResult {
      const access = getDocumentAccess(uri);
      if (!access) return { locations: [] };
      return languageService.getReferences({
        document: access.document,
        position,
        workspace: getRuntimeWorkspace(),
        config: access.effectiveConfig,
      } as InternalReferencesInput);
    },
    getDocumentSymbols(uri: string): DocumentSymbolsResult {
      const access = getDocumentAccess(uri);
      if (!access) return { symbols: [] };
      return languageService.getDocumentSymbols({
        document: access.document,
        workspace: getRuntimeWorkspace(),
        config: access.effectiveConfig,
      } as InternalDocumentSymbolsInput);
    },
    getCodeActions(
      uri: string,
      range?: SourceRange,
      diagnostics?: Diagnostic[],
    ): CodeActionsResult {
      const access = getDocumentAccess(uri);
      if (!access) return { actions: [] };
      return languageService.getCodeActions({
        document: access.document,
        range,
        diagnostics,
        workspace: getRuntimeWorkspace(),
        config: access.effectiveConfig,
      } as InternalCodeActionsInput);
    },
    getLanguageService() {
      return languageService;
    },
    dispose() {
      documents.clear();
      semanticSnapshots.clear();
      runtimeDiagnostics.length = 0;
    },
  };

  return service;
}
