import type {
  BehaviorTreeDef,
  BtDocumentModel,
  ModelAugmentationFile,
  PortDef,
  TreeNodeModelDef,
  TypeRegistry,
} from "@btxml/model";
import type { ModelLayer } from "./model-layers.js";
import type { ModelConflictFact, SemanticIndex, SemanticIndexOptions } from "./types.js";

export type InternalSemanticIndexOptions = SemanticIndexOptions & {
  additionalModelLayers?: ModelLayer[];
};

export type SemanticIndexState = SemanticIndex & {
  documents: Map<string, BtDocumentModel>;
  behaviorTreesById: Map<string, BehaviorTreeDef[]>;
  nodeModelsById: Map<string, TreeNodeModelDef[]>;
  mergedNodeModelsById: Map<string, TreeNodeModelDef>;
  modelLayers: ModelLayer[];
  builtins: Map<string, TreeNodeModelDef>;
  genericSubTreePorts: PortDef[];
  modelConflicts: ModelConflictFact[];
  typeRegistry: TypeRegistry;
  augmentations: readonly ModelAugmentationFile[];
};
