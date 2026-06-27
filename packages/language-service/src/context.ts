import type { EffectiveFileConfig } from "@btxml/config";
import type { Diagnostic, TextDocument } from "@btxml/foundation";
import type { NodeUsagePolicy, SemanticIndex } from "@btxml/semantic";
import type { BtDocumentView } from "@btxml/semantic/ast-view";
import type { BtDocument } from "@btxml/syntax";
import type { WorkspaceAnalysisSnapshot } from "./internal-types.js";

export type LanguageRequestContext = {
  document: TextDocument;
  parsed: BtDocument | undefined;
  documentView: BtDocumentView | undefined;
  diagnostics: Diagnostic[];
  partial: boolean;
  semantic: SemanticIndex;
  config: EffectiveFileConfig;
  nodeUsagePolicy: Partial<NodeUsagePolicy>;
  workspace?: WorkspaceAnalysisSnapshot;
};
