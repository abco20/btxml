export { buildSemanticIndex } from "./semantic-index.js";

export {
  buildSemanticDocumentView,
  getAllSemanticTreeNodes,
  getSemanticSubTreeCalls,
  getSemanticTreeNodesForBehaviorTree,
  selectDefaultBehaviorTree,
  buildSemanticNodeIdentityIndex,
  findSemanticNodeAtPosition,
  findSemanticPortBindingAtPosition,
} from "./view/index.js";

export {
  areTypesCompatible,
  getDocumentModel,
  getAllDocumentModels,
  hasDocumentModel,
  getBehaviorTrees,
  getBehaviorTreeIds,
  getAllBehaviorTreeDefinitions,
  getSubTreeReferences,
  getAllSubTreeReferences,
  hasBehaviorTree,
  getNodeModel,
  getNodeModelDefinitions,
  getAllNodeModels,
  getAllNodeModelDefinitions,
  getEffectiveNodeModels,
  getNodeModelIds,
  getGenericSubTreePorts,
  getRemappedKey,
  getModelAugmentations,
  getTypeDefinition,
  getTypeRegistry,
  getModelConflicts,
  normalizeTypeName,
} from "./queries.js";

export { resolveSubTreeTarget } from "./subtree-resolution.js";

export {
  DEFAULT_NODE_USAGE_POLICY,
  getGenericNodeKindFromTag,
  getUsagePorts,
  getNodeTypeFromElement,
  isGenericNodeTag,
  resolveNodeUsage,
  resolvePortUsage,
} from "./usage/index.js";

export type {
  SemanticIndex,
  SemanticIndexOptions,
  SemanticIndexResult,
  ModelConflictFact,
  BehaviorTreeDef,
  BtDocumentModel,
  PortDef,
  ResolvedTypeDefinition,
  TreeNodeModelDef,
  TypeRegistry,
  BehaviorTreeDef as BehaviorTreeDefinition,
  BtDocumentModel as DocumentModelFact,
  TreeNodeModelDef as NodeModelFact,
  ResolveSubTreeInput,
  WorkspaceInput,
} from "./types.js";

export type { SubTreeResolution } from "./subtree-resolution.js";

export type {
  NodeTagForm,
  NodeUsageModelResolution,
  NodeUsagePolicy,
  NodeUsageResolution,
  PortUsageResolution,
  ResolveNodeUsageInput,
  ResolvePortUsageInput,
  UnknownSubTreePortMode,
  UsageResolverConfig,
  GenericNodeKind,
} from "./usage/index.js";

export type {
  SemanticDocumentView,
  SemanticBehaviorTreeView,
  SemanticTreeNodeView,
  SemanticAttributeView,
  SemanticPortBindingView,
  SemanticSubTreeCallView,
  SemanticTreeSelection,
  SemanticNodeIdentityIndex,
  BlackboardReferenceView,
  SemanticNodeModelResolution,
  SemanticPortResolution,
  TreeNodeKind,
  BuildSemanticDocumentViewOptions,
} from "./view/index.js";
