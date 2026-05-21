import { getModelConflicts, getNodeModel, getNodeModelDefinitions } from "../queries.js";
import type { SemanticIndex } from "../types.js";
import type { NodeUsageModelResolution } from "./types.js";

export function resolveNodeUsageModel(
  index: SemanticIndex,
  nodeType: string | undefined,
): NodeUsageModelResolution {
  if (!nodeType) {
    return {
      status: "unresolved",
      nodeType,
    };
  }

  const model = getNodeModel(index, nodeType);

  if (model) {
    const conflict = getModelConflicts(index).find(
      (fact) => fact.id === nodeType && fact.code === "BT012_CONFLICTING_NODE_MODEL",
    );

    if (conflict) {
      return {
        status: "ambiguous",
        nodeType,
        candidates: conflict.definitions,
      };
    }

    return {
      status: "resolved",
      model,
    };
  }

  const candidates = getNodeModelDefinitions(index, nodeType);

  if (candidates.length === 1) {
    return {
      status: "resolved",
      model: candidates[0],
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      nodeType,
      candidates,
    };
  }

  return {
    status: "unresolved",
    nodeType,
  };
}
