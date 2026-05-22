import type { ResolvedBtxmlConfig } from "@btxml/config";
import type {
  Diagnostic,
  DiagnosticData,
  DiagnosticDetails,
  RelatedInformation,
  SourceRange,
} from "@btxml/foundation";
import type {
  BehaviorTreeDef,
  BtDocumentModel,
  ModelAugmentationFile,
  ModelSourceRef,
  NodeUsageDef,
  PortDef,
  ResolvedTypeDefinition,
  TreeNodeModelDef,
  TypeRegistry,
} from "@btxml/model";

export type ModelConflictFact = {
  id: string;
  definitions: readonly TreeNodeModelDef[];
  sources: readonly ModelSourceRef[];
  code: string;
  message: string;
  uri?: string;
  range?: SourceRange;
  details?: DiagnosticDetails;
  data?: DiagnosticData;
  relatedInformation?: RelatedInformation[];
};

declare const semanticIndexBrand: unique symbol;

export type SemanticIndex = {
  readonly [semanticIndexBrand]: "SemanticIndex";
};

export type SemanticIndexOptions = {
  config: ResolvedBtxmlConfig;
  models?: readonly TreeNodeModelDef[];
  augmentations?: readonly ModelAugmentationFile[];
};

export type SemanticIndexResult = {
  ok: boolean;
  index: SemanticIndex;
  diagnostics: Diagnostic[];
};

export type ResolveSubTreeInput = {
  id: string;
  fileLocalUri?: string;
  config?: ResolvedBtxmlConfig;
};

export type WorkspaceInput = {
  uri: string;
  path?: string;
  text: string;
  kind?: "bt-xml" | "model-xml" | "unknown";
};

export type {
  BehaviorTreeDef,
  BtDocumentModel,
  NodeUsageDef,
  PortDef,
  ResolvedTypeDefinition,
  TreeNodeModelDef,
  TypeRegistry,
};
