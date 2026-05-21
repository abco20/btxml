import type {
  BehaviorTreeDef,
  BtDocumentModel,
  ModelAugmentationFile,
  PortDef,
  SubTreeReference,
  TreeNodeModelDef,
} from "@btxml/model";
export { getRemappedKey } from "@btxml/model";
import type { SemanticIndexState } from "./internal-types.js";
import type { ModelConflictFact, SemanticIndex } from "./types.js";
export {
  areTypesCompatible,
  getTypeDefinition,
  getTypeRegistry,
  normalizeTypeName,
} from "./type-registry.js";

function asSemanticIndexState(index: SemanticIndex): SemanticIndexState {
  return index as SemanticIndexState;
}

export function getDocumentModel(index: SemanticIndex, uri: string): BtDocumentModel | undefined {
  return asSemanticIndexState(index).documents.get(uri);
}

export function getBehaviorTrees(index: SemanticIndex, id: string): BehaviorTreeDef[] {
  return asSemanticIndexState(index).behaviorTreesById.get(id) ?? [];
}

export function hasBehaviorTree(index: SemanticIndex, id: string): boolean {
  return asSemanticIndexState(index).behaviorTreesById.has(id);
}

export function getAllBehaviorTreeDefinitions(index: SemanticIndex): BehaviorTreeDef[] {
  return [...asSemanticIndexState(index).behaviorTreesById.values()].flat();
}

export function getSubTreeReferences(index: SemanticIndex, id: string): SubTreeReference[] {
  return getAllDocumentModels(index).flatMap((model) =>
    model.subtreeReferences.filter((reference) => reference.id === id),
  );
}

export function getAllSubTreeReferences(index: SemanticIndex): SubTreeReference[] {
  return getAllDocumentModels(index).flatMap((model) => model.subtreeReferences);
}

export function getBehaviorTreeIds(index: SemanticIndex): string[] {
  return [...asSemanticIndexState(index).behaviorTreesById.keys()];
}

export function getAllDocumentModels(index: SemanticIndex): BtDocumentModel[] {
  return [...asSemanticIndexState(index).documents.values()];
}

export function hasDocumentModel(index: SemanticIndex, uri: string): boolean {
  return asSemanticIndexState(index).documents.has(uri);
}

export function getNodeModel(index: SemanticIndex, id: string): TreeNodeModelDef | undefined {
  const state = asSemanticIndexState(index);
  return state.mergedNodeModelsById.get(id) ?? state.builtins.get(id);
}

export function getNodeModelDefinitions(index: SemanticIndex, id: string): TreeNodeModelDef[] {
  return asSemanticIndexState(index).modelLayers.flatMap((layer) =>
    layer.models.filter((model) => model.id === id),
  );
}

export function getAllNodeModels(index: SemanticIndex): TreeNodeModelDef[] {
  return [...asSemanticIndexState(index).mergedNodeModelsById.values()];
}

export function getAllNodeModelDefinitions(index: SemanticIndex): TreeNodeModelDef[] {
  return asSemanticIndexState(index).modelLayers.flatMap((layer) => layer.models);
}

export function getEffectiveNodeModels(index: SemanticIndex): TreeNodeModelDef[] {
  return [...asSemanticIndexState(index).mergedNodeModelsById.values()];
}

export function getNodeModelIds(index: SemanticIndex): string[] {
  return [...asSemanticIndexState(index).nodeModelsById.keys()];
}

export function getGenericSubTreePorts(index: SemanticIndex): readonly PortDef[] {
  return [...asSemanticIndexState(index).genericSubTreePorts];
}

export function getModelAugmentations(index: SemanticIndex): readonly ModelAugmentationFile[] {
  return [...asSemanticIndexState(index).augmentations];
}

export function getModelConflicts(index: SemanticIndex): ModelConflictFact[] {
  return asSemanticIndexState(index).modelConflicts;
}
