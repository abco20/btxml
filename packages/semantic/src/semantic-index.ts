import { type Diagnostic, DiagnosticSeverity } from "@btxml/foundation";
import {
  type BuiltinModelSet,
  SUPPORTED_BUILTIN_MODEL_SETS,
  type TreeNodeModelDef,
  buildDocumentModel,
  createTypeRegistry,
  getGenericSubTreePorts,
  listBuiltinNodeModels,
  normalizeConfigNodeModel,
} from "@btxml/model";
import type { BtDocument } from "@btxml/syntax";
import { buildEffectiveModels } from "./effective-models.js";
import type { InternalSemanticIndexOptions, SemanticIndexState } from "./internal-types.js";
import {
  createBuiltinModelLayer,
  createConfigInlineModelLayer,
  createDocumentModelLayer,
  createExternalDocumentModelLayer,
  createNodeDefinitionModelLayer,
  mergeModelLayers,
} from "./model-layers.js";
import type { SemanticIndexOptions, SemanticIndexResult } from "./types.js";

type ConfigNodeModel = Parameters<typeof normalizeConfigNodeModel>[1];

function isSupportedBuiltinModelSet(set: string): set is BuiltinModelSet {
  return (SUPPORTED_BUILTIN_MODEL_SETS as readonly string[]).includes(set);
}

function emptySemanticIndex(): SemanticIndexState {
  return {
    documents: new Map(),
    behaviorTreesById: new Map(),
    nodeModelsById: new Map(),
    mergedNodeModelsById: new Map(),
    modelLayers: [],
    builtins: new Map(),
    genericSubTreePorts: [],
    modelConflicts: [],
    typeRegistry: createTypeRegistry(),
    augmentations: [],
  } as unknown as SemanticIndexState;
}

function addToIndex<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function addBuiltinModelsToIndex(
  index: SemanticIndexState,
  builtinLayerModels: TreeNodeModelDef[],
  builtinSets: readonly string[],
) {
  for (const builtinSet of new Set(builtinSets)) {
    if (!isSupportedBuiltinModelSet(builtinSet)) {
      continue;
    }

    for (const model of listBuiltinNodeModels(builtinSet)) {
      index.builtins.set(model.id, model);
      builtinLayerModels.push(model);
    }
    index.genericSubTreePorts.push(...getGenericSubTreePorts(builtinSet));
  }
}

function addDocumentsToIndex(
  index: SemanticIndexState,
  diagnostics: Diagnostic[],
  documentModels: TreeNodeModelDef[],
  externalDocumentModels: TreeNodeModelDef[],
  documents: BtDocument[],
) {
  for (const document of documents) {
    const documentModelResult = buildDocumentModel(document, {
      uri: document.uri,
      path: document.path,
    });
    const model = documentModelResult.model;
    diagnostics.push(...documentModelResult.diagnostics);
    index.documents.set(document.uri, model);
    for (const bt of model.behaviorTrees) {
      addToIndex(index.behaviorTreesById, bt.id, bt);
    }
    if (document.kind === "model-document") {
      externalDocumentModels.push(...model.treeNodesModel);
    } else {
      documentModels.push(...model.treeNodesModel);
    }
    index.genericSubTreePorts.push(...model.genericSubTreePorts);
  }
}

function makePortSignatureKey(port: SemanticIndexState["genericSubTreePorts"][number]) {
  return JSON.stringify({
    name: port.name,
    direction: port.direction,
    type: port.type,
    required: port.required,
    defaultValue: port.defaultValue,
    enum: port.enum ? [...port.enum].sort((a, b) => a.localeCompare(b)) : undefined,
    description: port.description,
  });
}

function deduplicateGenericSubTreePorts(index: SemanticIndexState) {
  const seenPortSignatures = new Set<string>();
  const deduplicatedPorts: typeof index.genericSubTreePorts = [];

  for (const port of index.genericSubTreePorts) {
    const key = makePortSignatureKey(port);
    if (!seenPortSignatures.has(key)) {
      seenPortSignatures.add(key);
      deduplicatedPorts.push(port);
    }
  }

  index.genericSubTreePorts = deduplicatedPorts;
}

function addModelLayers(
  index: SemanticIndexState,
  builtinLayerModels: TreeNodeModelDef[],
  documentModels: TreeNodeModelDef[],
  externalDocumentModels: TreeNodeModelDef[],
  options: InternalSemanticIndexOptions,
) {
  index.modelLayers.push(
    createBuiltinModelLayer(builtinLayerModels),
    createDocumentModelLayer(documentModels),
    createExternalDocumentModelLayer(externalDocumentModels),
  );

  if (options.models?.length) {
    index.modelLayers.push(createNodeDefinitionModelLayer([...options.models]));
  }
  index.modelLayers.push(...(options.additionalModelLayers ?? []));
}

export function buildSemanticIndex(
  documents: BtDocument[],
  options: SemanticIndexOptions,
): SemanticIndexResult {
  return buildSemanticIndexInternal(documents, options);
}

function buildSemanticIndexInternal(
  documents: BtDocument[],
  options: InternalSemanticIndexOptions,
): SemanticIndexResult {
  const index = emptySemanticIndex();
  const diagnostics: Diagnostic[] = [];
  const builtinLayerModels: TreeNodeModelDef[] = [];
  const documentModels: TreeNodeModelDef[] = [];
  const externalDocumentModels: TreeNodeModelDef[] = [];

  addBuiltinModelsToIndex(index, builtinLayerModels, options.config.models.builtins);
  index.augmentations = options.augmentations ?? [];
  index.typeRegistry = createTypeRegistry(options.augmentations ?? []);
  addDocumentsToIndex(index, diagnostics, documentModels, externalDocumentModels, documents);
  deduplicateGenericSubTreePorts(index);
  addModelLayers(index, builtinLayerModels, documentModels, externalDocumentModels, options);

  const inlineNodes = options.config.models.inline;
  if (inlineNodes) {
    const configModels: TreeNodeModelDef[] = [];
    for (const [id, node] of Object.entries(inlineNodes)) {
      configModels.push(normalizeConfigNodeModel(id, node as ConfigNodeModel));
    }
    index.modelLayers.push(createConfigInlineModelLayer(configModels));
  }

  const merged = mergeModelLayers(index.modelLayers);
  const effective = buildEffectiveModels(
    merged.mergedNodeModelsById,
    index.typeRegistry,
    options.augmentations ?? [],
  );
  index.nodeModelsById = merged.nodeModelsById;
  index.mergedNodeModelsById = effective.modelsById;
  index.modelConflicts = merged.conflicts;
  diagnostics.push(...effective.diagnostics);

  return {
    ok: diagnostics.every((diag) => diag.severity !== DiagnosticSeverity.Error),
    index,
    diagnostics,
  };
}
