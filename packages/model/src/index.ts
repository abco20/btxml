export { buildDocumentModel, buildDocumentModelResult } from "./model.js";

export {
  getInvalidPortNameReason,
  normalizeConfigPort,
  normalizeConfigNodeModel,
  inferRequired,
  isReservedAttribute,
  isReservedPortName,
} from "./ports.js";

export {
  areTypesCompatible,
  createTypeRegistry,
  isAnyTypeName,
  normalizeBuiltinTypeName,
  normalizeTypeName,
  resolveTypeDefinition,
} from "./type-registry.js";

export {
  formatBlackboardReference,
  formatScriptBlackboardIdentifier,
  makeBlackboardIdentity,
  parsePortBlackboardReference,
  parseScriptBlackboardIdentifier,
} from "./blackboard-reference.js";

export {
  DEFAULT_BTCPP_V4_MODEL_SET,
  SUPPORTED_BUILTIN_MODEL_SETS,
  SUPPORTED_VERSIONED_BTCPP_MODEL_SETS,
  getBuiltinNodeModel,
  getGenericSubTreePorts,
  listChildCapableBuiltinNodeIds,
  listBuiltinNodeModels,
  builtinToNodeModel,
} from "./builtins.js";

export type { BuiltinModelSet } from "./builtins.js";

export {
  getNodeModelSignature,
  areEquivalentNodeModels,
  classifyNodeModelDifference,
} from "./node-model-signature.js";

export type {
  AttributeValueRef,
  BehaviorTreeDef,
  BtDocumentModel,
  BtDocumentModelKind,
  BuiltinNodeDef,
  DocumentBlackboardReference,
  EffectivePortTypeSource,
  ModelSourceRef,
  NodeModelSource,
  NodeModelSourceKind,
  PortDef,
  PortDirection,
  PortSourceRef,
  SubTreeReference,
  TreeNodeKind,
  TreeNodeModelDef,
} from "./public-types.js";

export type {
  BlackboardReference,
  BlackboardReferenceParseError,
  BlackboardReferenceParseErrorKind,
  BlackboardReferenceSyntax,
  BlackboardScope,
  ParseBlackboardReferenceResult,
} from "./blackboard-reference.js";

export type { ResolvedTypeDefinition, TypeRegistry } from "./type-registry.js";

export type {
  NodeModelDifferenceKind,
  NodeModelPortSignature,
  NodeModelSignature,
} from "./node-model-signature.js";

export type {
  ConfigNodeModel,
  ConfigPortDef,
  NodeDefinitionsFile,
} from "./node-definitions/schema.js";

export type {
  ModelAugmentationFile,
  NodeAugmentation,
  PortAugmentation,
  PortTypeRefinement,
  ScriptAugmentation,
  TypeDefinition,
  TypeLiteralValidator,
} from "./model-augmentation/schema.js";

export { parseModelAugmentationFile } from "./model-augmentation/parser.js";

export type { ParseModelAugmentationFileResult } from "./model-augmentation/parser.js";
