import type { SourceRange } from "@btxml/foundation";
import type { NodeModelSourceKind, TreeNodeModelDef } from "@btxml/model";
import { getAllNodeModelDefinitions } from "./queries.js";
import type { SemanticIndex } from "./types.js";

export type ModelDefinitionKey = {
  id: string;
  kind: TreeNodeModelDef["kind"];
};

export type ModelDefinitionFact = {
  key: ModelDefinitionKey;
  model: TreeNodeModelDef;
  id: string;
  kind: TreeNodeModelDef["kind"];
  uri?: string;
  range?: SourceRange;
  sourceKind?: NodeModelSourceKind;
  isBuiltin: boolean;
  isCanonicalModelFile: boolean;
  editable: boolean;
};

function modelDefinitionKeyString(key: ModelDefinitionKey): string {
  return `${key.kind}\u0000${key.id}`;
}

export function getModelDefinitionFacts(index: SemanticIndex): ModelDefinitionFact[] {
  return getAllNodeModelDefinitions(index).map((model) => {
    const sourceKind = model.source ?? model.sourceMeta?.sourceKind;

    return {
      key: {
        id: model.id,
        kind: model.kind,
      },
      model,
      id: model.id,
      kind: model.kind,
      uri: model.uri,
      range: model.range,
      sourceKind,
      isBuiltin: sourceKind === "builtin",
      isCanonicalModelFile: sourceKind === "external-tree-nodes-model",
      editable: model.editable !== false,
    };
  });
}

export function groupModelDefinitionsById(
  facts: readonly ModelDefinitionFact[],
): Map<string, ModelDefinitionFact[]> {
  const grouped = new Map<string, ModelDefinitionFact[]>();

  for (const fact of facts) {
    const list = grouped.get(fact.id) ?? [];
    list.push(fact);
    grouped.set(fact.id, list);
  }

  return grouped;
}

export function groupModelDefinitionsByKey(
  facts: readonly ModelDefinitionFact[],
): Map<string, ModelDefinitionFact[]> {
  const grouped = new Map<string, ModelDefinitionFact[]>();

  for (const fact of facts) {
    const key = modelDefinitionKeyString(fact.key);
    const list = grouped.get(key) ?? [];
    list.push(fact);
    grouped.set(key, list);
  }

  return grouped;
}
