import type { BehaviorTreeDef, TreeNodeModelDef } from "@btxml/model";
import { getBehaviorTrees, getNodeModel } from "./queries.js";
import type { ResolveSubTreeInput, SemanticIndex } from "./types.js";

export type SubTreeResolution =
  | {
      readonly status: "resolved";
      readonly kind: "behavior-tree";
      readonly treeId: string;
      readonly behaviorTree: BehaviorTreeDef;
    }
  | {
      readonly status: "resolved";
      readonly kind: "node-model";
      readonly modelId: string;
      readonly model: TreeNodeModelDef;
    }
  | {
      readonly status: "ambiguous";
      readonly candidates: readonly string[];
      readonly behaviorTrees: readonly BehaviorTreeDef[];
      readonly definitions: readonly TreeNodeModelDef[];
    }
  | {
      readonly status: "unresolved";
      readonly id: string | undefined;
    };

export function resolveSubTreeTarget(
  index: SemanticIndex,
  input: ResolveSubTreeInput,
): SubTreeResolution {
  const { id, fileLocalUri, config } = input;
  let behaviorTrees = getBehaviorTrees(index, id);
  if (behaviorTrees.length > 0) {
    if (
      (config?.resolver?.behaviorTreeIds === "file-local-first" ||
        config?.resolver?.behaviorTreeIds === "allow-ambiguous") &&
      fileLocalUri
    ) {
      const local = behaviorTrees.filter((bt) => bt.uri === fileLocalUri);
      if (local.length > 0) behaviorTrees = local;
    }
    const model = getNodeModel(index, id);
    const definitions = model?.kind === "SubTree" ? [model] : [];
    if (behaviorTrees.length === 1) {
      return {
        status: "resolved",
        kind: "behavior-tree",
        treeId: behaviorTrees[0].id,
        behaviorTree: behaviorTrees[0],
      };
    }
    return {
      status: "ambiguous",
      candidates: [
        ...behaviorTrees.map((behaviorTree) => behaviorTree.id),
        ...definitions.map((definition) => definition.id),
      ],
      behaviorTrees,
      definitions,
    };
  }
  const model = getNodeModel(index, id);
  if (model?.kind === "SubTree") {
    return {
      status: "resolved",
      kind: "node-model",
      modelId: model.id,
      model,
    };
  }
  return { status: "unresolved", id };
}
