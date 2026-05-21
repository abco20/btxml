export { buildSemanticIndex as buildWorkspaceIndex } from "@btxml/semantic";

export {
  resolveSubTreeTarget,
  getBehaviorTrees as workspaceLookupBehaviorTrees,
  getNodeModel as workspaceLookupNodeModel,
} from "@btxml/semantic";

export type {
  SubTreeResolution,
  SemanticIndex as WorkspaceIndex,
  SemanticIndexOptions as WorkspaceIndexOptions,
  SemanticIndexResult as WorkspaceIndexResult,
} from "@btxml/semantic";
