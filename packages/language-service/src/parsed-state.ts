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
  WorkspaceSnapshot,
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

function getWorkspaceDocuments(workspace?: WorkspaceSnapshot) {
  return workspace?.documents ?? [];
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
  const result = parseBtXml(input.document.text, {
    kind: input.document.languageId === "btcpp-xml" ? "bt-xml" : undefined,
    uri: input.document.uri,
    mode: "mode" in input ? (input.mode ?? "tolerant") : "tolerant",
  });
  const workspace = "workspace" in input ? input.workspace : undefined;
  const docs = result.document
    ? [
        result.document,
        ...getWorkspaceDocuments(workspace).filter(
          (doc) => !documentUriMatchesProjectDocument(input.document, doc),
        ),
      ]
    : getWorkspaceDocuments(workspace);
  const config = mergeWithDefaults(input.config || options.config);
  const nodeUsagePolicy = getNodeUsagePolicyForRules(config);
  const nodeDefinitionModels = workspace?.nodeDefinitionModels ?? [];
  const semantic = buildSemanticIndex(docs, {
    config: config as ResolvedBtxmlConfig,
    models: nodeDefinitionModels,
    augmentations: options.augmentations,
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
  workspace?: WorkspaceSnapshot;
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
