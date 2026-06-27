import { getDocumentDiagnostics } from "@btxml/analyzer";
import { getNodeUsagePolicyForRules } from "@btxml/analyzer/rules";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { EffectiveFileConfig, ResolvedBtxmlConfig } from "@btxml/config";
import { buildSemanticIndex } from "@btxml/semantic";
import { buildBtDocumentView } from "@btxml/semantic/ast-view";
import { type BtDocument, parseBtXml } from "@btxml/syntax";
import type { LanguageRequestContext } from "./context.js";
import type {
  BtTextDocument,
  InternalCodeActionsInput,
  InternalCompletionInput,
  InternalDefinitionInput,
  InternalDiagnosticsInput,
  InternalDocumentSymbolsInput,
  InternalFormattingInput,
  InternalHoverInput,
  InternalReferencesInput,
  WorkspaceAnalysisSnapshot,
} from "./internal-types.js";
import type { LanguageServiceOptions } from "./public-types.js";

export type LanguageRequestInput =
  | InternalCodeActionsInput
  | InternalCompletionInput
  | InternalDefinitionInput
  | InternalDiagnosticsInput
  | InternalDocumentSymbolsInput
  | InternalFormattingInput
  | InternalHoverInput
  | InternalReferencesInput;

const workspaceDocumentLookup = new WeakMap<
  WorkspaceAnalysisSnapshot,
  { byUri: Map<string, BtDocument>; byFilePath: Map<string, BtDocument> }
>();

function getWorkspaceDocuments(workspace?: WorkspaceAnalysisSnapshot) {
  return workspace?.documents ?? [];
}

function getWorkspaceNodeDefinitionModels(workspace?: WorkspaceAnalysisSnapshot) {
  return workspace?.nodeDefinitionModels ?? [];
}

function getWorkspaceAugmentations(
  workspace: WorkspaceAnalysisSnapshot | undefined,
  options: LanguageServiceOptions,
) {
  return workspace?.augmentations ?? options.augmentations;
}

function toFilePathKey(uri: string) {
  if (!uri.startsWith("file://")) return undefined;
  try {
    return new URL(uri).pathname;
  } catch {
    return undefined;
  }
}

function getWorkspaceDocumentLookup(workspace: WorkspaceAnalysisSnapshot) {
  const cached = workspaceDocumentLookup.get(workspace);
  if (cached) return cached;

  const lookup = {
    byUri: new Map<string, BtDocument>(),
    byFilePath: new Map<string, BtDocument>(),
  };
  for (const document of workspace.documents) {
    lookup.byUri.set(document.uri, document);
    const uriPath = toFilePathKey(document.uri);
    if (uriPath) lookup.byFilePath.set(uriPath, document);
    if (document.path) {
      const documentPath = document.path.startsWith("file://")
        ? toFilePathKey(document.path)
        : document.path;
      if (documentPath) lookup.byFilePath.set(documentPath, document);
    }
  }
  workspaceDocumentLookup.set(workspace, lookup);
  return lookup;
}

function documentUriMatchesProjectDocument(document: BtTextDocument, candidate: BtDocument) {
  if (candidate.uri === document.uri) return true;
  if (document.uri.startsWith("file://")) {
    try {
      const documentPath = new URL(document.uri).pathname;
      if (candidate.uri.startsWith("file://") && new URL(candidate.uri).pathname === documentPath) {
        return true;
      }
      if (candidate.path) {
        const candidatePath = candidate.path.startsWith("file://")
          ? new URL(candidate.path).pathname
          : candidate.path;
        if (candidatePath === documentPath) return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

function findWorkspaceDocument(
  document: BtTextDocument,
  workspace: WorkspaceAnalysisSnapshot | undefined,
): BtDocument | undefined {
  if (!workspace) return undefined;
  const lookup = getWorkspaceDocumentLookup(workspace);
  const byUri = lookup.byUri.get(document.uri);
  if (byUri) return byUri;
  const documentPath = toFilePathKey(document.uri);
  if (documentPath) return lookup.byFilePath.get(documentPath);
  return workspace.documents.find((candidate) =>
    documentUriMatchesProjectDocument(document, candidate),
  );
}

function canUseWorkspaceDocument(document: BtTextDocument, workspaceDocument: BtDocument) {
  if (document.text !== workspaceDocument.originalText) return false;
  return document.languageId !== "btcpp-xml" || workspaceDocument.isBtXml === true;
}

function mergeWithDefaults(config?: EffectiveFileConfig): EffectiveFileConfig {
  const defaults = getDefaultResolvedBtxmlConfig();
  if (!config) return defaults as EffectiveFileConfig;
  return {
    files: config.files ?? defaults.files,
    resolver: config.resolver ?? defaults.resolver,
    models: config.models ?? defaults.models,
    linter: config.linter ?? defaults.linter,
    formatter: config.formatter ?? defaults.formatter,
  };
}

export function buildLanguageRequestContext(
  input: LanguageRequestInput,
  options: LanguageServiceOptions,
): LanguageRequestContext {
  const workspace = "workspace" in input ? input.workspace : undefined;
  const config = mergeWithDefaults(input.config || options.config);
  const nodeUsagePolicy = getNodeUsagePolicyForRules(config);
  const workspaceDocument = findWorkspaceDocument(input.document, workspace);
  const sharedSemantic = workspace?.semanticIndex;
  if (
    workspaceDocument &&
    sharedSemantic &&
    canUseWorkspaceDocument(input.document, workspaceDocument)
  ) {
    const documentView = buildBtDocumentView(workspaceDocument, {
      semantic: sharedSemantic,
      config: config as ResolvedBtxmlConfig,
      policy: nodeUsagePolicy,
    });
    return {
      document: input.document,
      parsed: workspaceDocument,
      documentView,
      diagnostics: getDocumentDiagnostics(workspaceDocument, sharedSemantic, {
        config,
        documentView,
      }),
      partial: false,
      semantic: sharedSemantic,
      config,
      nodeUsagePolicy,
      workspace,
    };
  }

  const result = parseBtXml(input.document.text, {
    kind: input.document.languageId === "btcpp-xml" ? "bt-xml" : undefined,
    uri: input.document.uri,
    mode: "mode" in input ? (input.mode ?? "tolerant") : "tolerant",
  });
  const docs = result.document
    ? [
        result.document,
        ...getWorkspaceDocuments(workspace).filter(
          (doc) => !documentUriMatchesProjectDocument(input.document, doc),
        ),
      ]
    : [...getWorkspaceDocuments(workspace)];
  const nodeDefinitionModels = getWorkspaceNodeDefinitionModels(workspace);
  const semantic = buildSemanticIndex(docs, {
    config: config as ResolvedBtxmlConfig,
    models: nodeDefinitionModels,
    augmentations: getWorkspaceAugmentations(workspace, options),
  }).index;
  const documentView = result.document
    ? buildBtDocumentView(result.document, {
        semantic,
        config: config as ResolvedBtxmlConfig,
        policy: nodeUsagePolicy,
      })
    : undefined;
  return {
    document: input.document,
    parsed: result.document,
    documentView,
    diagnostics: result.document
      ? getDocumentDiagnostics(result.document, semantic, {
          config,
          documentView,
        })
      : result.diagnostics,
    partial: result.partial === true,
    semantic,
    config,
    nodeUsagePolicy,
    workspace,
  };
}

export function buildParsedState(input: {
  document: BtTextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
  config?: EffectiveFileConfig;
  mode?: "strict" | "tolerant";
}) {
  const context = buildLanguageRequestContext(input, {});
  return {
    parsed: context.parsed,
    documentView: context.documentView,
    diagnostics: context.diagnostics,
    partial: context.partial,
    workspace: context.semantic,
  };
}
