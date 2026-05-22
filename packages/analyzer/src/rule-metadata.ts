import type { ConfigSeverity as Severity } from "@btxml/config";
import type { DiagnosticSeverity } from "@btxml/foundation";
import { RuleCodes } from "./rule-codes.js";
import {
  RULES,
  type RuleName,
  type RuleOptionDoc,
  type RuleRegistryEntry,
} from "./rules/registry.js";

export type RuleMetadataDefaultSeverity = Severity | DiagnosticSeverity;

export type RuleMetadata = {
  code: string;
  defaultSeverity: RuleMetadataDefaultSeverity;
  title: string;
  description: string;
  invalidExample?: string;
  validExample?: string;
  fix?: string;
  suppressible: boolean;
  configExample?: string;
  options?: RuleOptionDoc[];
};

const defaultRule = (
  code: string,
  title: string,
  description: string,
  suppressible = true,
): Omit<RuleMetadata, "defaultSeverity"> => ({
  code,
  title,
  description,
  suppressible,
});

const RuleMetadataDetailsByCode: Record<string, Omit<RuleMetadata, "defaultSeverity">> = {
  [RuleCodes.InvalidScriptSyntax]: {
    code: RuleCodes.InvalidScriptSyntax,
    title: "Invalid script syntax",
    description: "Script-bearing attributes must parse as valid BT.CPP scripts.",
    suppressible: true,
    invalidExample: '<AlwaysSuccess _successIf="A +"/>',
    validExample: '<AlwaysSuccess _successIf="A == 1"/>',
    configExample: '{"linter":{"rules":{"script/valid-syntax":"error"}}}',
  },
  [RuleCodes.EmptyScript]: {
    code: RuleCodes.EmptyScript,
    title: "Empty script",
    description: "Script-bearing attributes must not be empty.",
    suppressible: true,
    invalidExample: '<AlwaysSuccess _successIf=""/>',
    validExample: '<AlwaysSuccess _successIf="true"/>',
    configExample: '{"linter":{"rules":{"script/valid-syntax":"error"}}}',
  },
  [RuleCodes.InvalidScriptToken]: {
    code: RuleCodes.InvalidScriptToken,
    title: "Invalid script token",
    description: "Script-bearing attributes must not contain invalid BT.CPP tokens.",
    suppressible: true,
    invalidExample: '<Script code="0x"/>',
    validExample: '<Script code="value := 0x10"/>',
    configExample: '{"linter":{"rules":{"script/valid-syntax":"error"}}}',
  },
  [RuleCodes.UnknownScriptVariable]: {
    code: RuleCodes.UnknownScriptVariable,
    title: "Unknown script variable",
    description:
      "Script-bearing attributes should not read blackboard or local variables that were never introduced.",
    suppressible: true,
    invalidExample: '<AlwaysSuccess _successIf="missing == 1"/>',
    validExample: '<Script code="count := 1; done = count"/>',
    configExample: '{"linter":{"rules":{"script/no-unknown-variable":"warn"}}}',
  },
  [RuleCodes.AssignmentToUnknownVariable]: {
    code: RuleCodes.AssignmentToUnknownVariable,
    title: "Assignment to unknown script variable",
    description:
      "Assignments with `=` or compound operators must target an existing script or blackboard variable.",
    suppressible: true,
    invalidExample: '<Script code="count = 1"/>',
    validExample: '<Script code="count := 1; count = 2"/>',
    configExample: '{"linter":{"rules":{"script/valid-assignment":"error"}}}',
  },
  [RuleCodes.InvalidCompoundAssignment]: {
    code: RuleCodes.InvalidCompoundAssignment,
    title: "Invalid compound assignment",
    description:
      "Compound assignment operators must be used with supported operand types (`number` or `string` for `+=`, numbers only otherwise).",
    suppressible: true,
    invalidExample: '<Script code="name := "x"; name -= 1"/>',
    validExample: '<Script code="count := 1; count += 2"/>',
    configExample: '{"linter":{"rules":{"script/valid-assignment":"error"}}}',
  },
  [RuleCodes.InvalidScriptOperandType]: {
    code: RuleCodes.InvalidScriptOperandType,
    title: "Invalid script operand type",
    description:
      "Script operators and ternary conditions must be applied to operands with compatible inferred types.",
    suppressible: true,
    invalidExample: "<AlwaysSuccess _successIf=\"'x' * 2\"/>",
    validExample: '<AlwaysSuccess _successIf="count * 2 > 0"/>',
    configExample: '{"linter":{"rules":{"script/valid-expression-type":"error"}}}',
  },
  [RuleCodes.ScriptResultNotBoolCompatible]: {
    code: RuleCodes.ScriptResultNotBoolCompatible,
    title: "Script result is not bool-compatible",
    description:
      "Condition-style script attributes must end in an inferred bool-compatible result type.",
    suppressible: true,
    invalidExample: "<AlwaysSuccess _successIf=\"'hello'\"/>",
    validExample: '<AlwaysSuccess _successIf="true"/>',
    configExample: '{"linter":{"rules":{"script/valid-result-type":"error"}}}',
  },
  [RuleCodes.ScriptVariableTypeMismatch]: {
    code: RuleCodes.ScriptVariableTypeMismatch,
    title: "Script variable type mismatch",
    description:
      "Script assignments must not write an incompatible inferred type into an existing variable.",
    suppressible: true,
    invalidExample: '<Script code="count := 1; count = "x""/>',
    validExample: '<Script code="count := 1; count = 2"/>',
    configExample: '{"linter":{"rules":{"script/valid-assignment":"error"}}}',
  },
  [RuleCodes.InvalidGlobalBlackboardIdentifier]: {
    code: RuleCodes.InvalidGlobalBlackboardIdentifier,
    title: "Invalid global blackboard identifier",
    description:
      "Script global blackboard identifiers must use `@name` with a valid blackboard key after the scope marker.",
    suppressible: true,
    invalidExample: '<Script code="@ := 1"/>',
    validExample: '<Script code="@count := 1"/>',
    configExample: '{"linter":{"rules":{"script/valid-assignment":"error"}}}',
  },
  [RuleCodes.InvalidRootElement]: defaultRule(
    RuleCodes.InvalidRootElement,
    "Invalid root element",
    "Root element must be <root>.",
    false,
  ),
  [RuleCodes.MissingBTCPPFormat]: defaultRule(
    RuleCodes.MissingBTCPPFormat,
    "Missing BTCPP format",
    'Root element must declare BTCPP_format="4".',
    false,
  ),
  [RuleCodes.MissingBehaviorTreeID]: defaultRule(
    RuleCodes.MissingBehaviorTreeID,
    "Missing BehaviorTree ID",
    "BehaviorTree elements require an ID attribute.",
    false,
  ),
  [RuleCodes.DuplicateBehaviorTreeID]: defaultRule(
    RuleCodes.DuplicateBehaviorTreeID,
    "Duplicate BehaviorTree ID",
    "BehaviorTree IDs must be unique within a file.",
    false,
  ),
  [RuleCodes.UnknownSubTree]: {
    code: RuleCodes.UnknownSubTree,
    title: "Unknown SubTree reference",
    description: "A SubTree must resolve to a BehaviorTree or a configured model.",
    suppressible: true,
    invalidExample: '<SubTree ID="missing_tree"/>',
    validExample: '<BehaviorTree ID="missing_tree"><Sequence/></BehaviorTree>',
    fix: "Define the BehaviorTree, add an external TreeNodesModel file, or add a nodes config entry.",
    configExample: '{"linter":{"rules":{"tree/no-unknown-subtree":"warn"}}}',
  },
  [RuleCodes.DuplicateNodeModelId]: defaultRule(
    RuleCodes.DuplicateNodeModelId,
    "Duplicate node model ID in TreeNodesModel",
    "TreeNodesModel elements must have unique IDs within the same model block.",
    false,
  ),
  [RuleCodes.MissingPortName]: defaultRule(
    RuleCodes.MissingPortName,
    "Missing port name",
    "Port elements require a name attribute.",
    false,
  ),
  [RuleCodes.DuplicatePortName]: defaultRule(
    RuleCodes.DuplicatePortName,
    "Duplicate port name",
    "Ports with the same name are not allowed.",
    false,
  ),
  [RuleCodes.InvalidPortName]: {
    code: RuleCodes.InvalidPortName,
    title: "Invalid port name",
    description: "Port names must be valid XML attribute names for BT nodes.",
    suppressible: false,
    invalidExample: '<input_port name="request.name" type="string"/>',
    validExample: '<input_port name="request_name" type="string"/>',
    fix: "Rename the port so it does not use reserved names, leading digits, whitespace, control characters, or XML/path punctuation.",
    configExample: '{"linter":{"rules":{"model/valid-port-name":"warn"}}}',
  },
  [RuleCodes.UnknownTopLevelElement]: defaultRule(
    RuleCodes.UnknownTopLevelElement,
    "Unknown top-level element",
    "Top-level elements must be BehaviorTree, TreeNodesModel, or configured include elements.",
    false,
  ),
  [RuleCodes.UnknownMainTree]: defaultRule(
    RuleCodes.UnknownMainTree,
    "Unknown main tree",
    "main_tree_to_execute must reference a known BehaviorTree.",
    false,
  ),
  [RuleCodes.AmbiguousSubTree]: defaultRule(
    RuleCodes.AmbiguousSubTree,
    "Ambiguous SubTree",
    "SubTree references must resolve to a single definition.",
    false,
  ),
  [RuleCodes.ConflictingNodeModel]: {
    code: RuleCodes.ConflictingNodeModel,
    title: "Conflicting node model",
    description: "Node model definitions must agree on kind and port shape.",
    suppressible: false,
    fix: "Run `btxmlc repair` to inspect conflicts. Run `btxmlc repair --write` to resolve the conflict interactively.",
  },
  [RuleCodes.ConflictingModelKind]: {
    code: RuleCodes.ConflictingModelKind,
    title: "Conflicting model kind for ID",
    description: "The same model ID must not be defined with different node kinds.",
    suppressible: false,
    invalidExample: '<TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel>',
    validExample: '<TreeNodesModel><Action ID="Foo"/></TreeNodesModel>',
  },
  [RuleCodes.UnusedModelDefinition]: {
    code: RuleCodes.UnusedModelDefinition,
    title: "Unused inline model definition",
    description:
      "When models.convention is used-only, inline Action/Condition/Decorator/Control definitions must be used in the same file.",
    suppressible: false,
    invalidExample:
      '<root BTCPP_format="4"><BehaviorTree ID="Main"><Run/></BehaviorTree><TreeNodesModel><Action ID="Run"/><Action ID="Unused"/></TreeNodesModel></root>',
    validExample:
      '<root BTCPP_format="4"><BehaviorTree ID="Main"><Run/></BehaviorTree><TreeNodesModel><Action ID="Run"/></TreeNodesModel></root>',
    fix: "Run `btxmlc lint --fix` to remove unused inline model definitions when safe.",
  },
  [RuleCodes.DuplicateModelDefinition]: {
    code: RuleCodes.DuplicateModelDefinition,
    title: "Duplicate model definition",
    description:
      "When models.convention is single-source, each user-defined (ID, kind) model definition should appear only once.",
    suppressible: false,
    invalidExample:
      '<!-- a.xml --><TreeNodesModel><Action ID="Move"/></TreeNodesModel>\n<!-- b.xml --><TreeNodesModel><Action ID="Move"/></TreeNodesModel>',
    validExample: '<TreeNodesModel><Action ID="Move"/></TreeNodesModel>',
    fix: "Run `btxmlc lint --fix` to delete non-canonical duplicates when safe.",
  },
  [RuleCodes.MissingLocalModelDefinition]: {
    code: RuleCodes.MissingLocalModelDefinition,
    title: "Missing local model definition",
    description:
      "When models.convention is used-only, each normal node used in a file should have a local TreeNodesModel definition in that same file.",
    suppressible: false,
    invalidExample:
      '<root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence/><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    validExample:
      '<root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence/><Move/></BehaviorTree><TreeNodesModel><Control ID="Sequence"/><Action ID="Move"/></TreeNodesModel></root>',
    fix: "Run `btxmlc lint --fix` to add missing local model definitions when they can be resolved safely.",
  },
  [RuleCodes.DuplicateBehaviorTreeIdInWorkspace]: {
    code: RuleCodes.DuplicateBehaviorTreeIdInWorkspace,
    title: "Duplicate BehaviorTree ID in workspace",
    description: "BehaviorTree IDs must be unique across the workspace.",
    suppressible: false,
    invalidExample:
      '<!-- file1.xml --><BehaviorTree ID="shared"/>\n<!-- file2.xml --><BehaviorTree ID="shared"/>',
    validExample:
      '<!-- file1.xml --><BehaviorTree ID="shared"/>\n<!-- file2.xml --><BehaviorTree ID="other"/>',
    configExample: '{"linter":{"rules":{"tree/no-duplicate-id":"warn"}}}',
  },
  [RuleCodes.MissingIncludePath]: {
    code: RuleCodes.MissingIncludePath,
    title: "Missing include path",
    description: "include elements require a path attribute.",
    suppressible: false,
    invalidExample: "<include/>",
    validExample: '<include path="common.xml"/>',
    configExample: '{"linter":{"rules":{"include/require-path":"warn"}}}',
  },
  [RuleCodes.IncludeNotFound]: {
    code: RuleCodes.IncludeNotFound,
    title: "Include not found",
    description: "Referenced include file does not exist.",
    suppressible: false,
    invalidExample: '<include path="missing.xml"/>',
    validExample: '<include path="common.xml"/>',
    configExample: '{"linter":{"rules":{"include/no-missing-file":"warn"}}}',
  },
  [RuleCodes.IncludeCycle]: defaultRule(
    RuleCodes.IncludeCycle,
    "Include cycle",
    "Include graph cycles are not allowed.",
    false,
  ),
  [RuleCodes.UnresolvedIncludePathVariable]: defaultRule(
    RuleCodes.UnresolvedIncludePathVariable,
    "Unresolved include path variable",
    "Include path variables must resolve before lookup.",
    false,
  ),
  [RuleCodes.IncludeOutsideWorkspace]: defaultRule(
    RuleCodes.IncludeOutsideWorkspace,
    "Include outside workspace",
    "Includes must stay within the workspace root.",
    false,
  ),
  [RuleCodes.ExternalIncludeUsed]: defaultRule(
    RuleCodes.ExternalIncludeUsed,
    "External include used",
    "An include file outside the workspace root was used.",
    false,
  ),
  [RuleCodes.IncludeDepthExceeded]: defaultRule(
    RuleCodes.IncludeDepthExceeded,
    "Include depth exceeded",
    "The maximum depth of nested includes was reached.",
    false,
  ),
  [RuleCodes.TooManyResolvedFiles]: defaultRule(
    RuleCodes.TooManyResolvedFiles,
    "Too many resolved files",
    "The maximum number of allowed files included was reached.",
    false,
  ),
  [RuleCodes.EntrypointNotFound]: defaultRule(
    RuleCodes.EntrypointNotFound,
    "Entrypoint not found",
    "Configured entrypoint files must exist.",
    false,
  ),
  [RuleCodes.RosPackageResolverMissing]: {
    code: RuleCodes.RosPackageResolverMissing,
    title: "ROS package resolver is missing",
    description:
      "include elements with ros_pkg require ProjectHost.resolvePackageUri to be provided.",
    suppressible: false,
    invalidExample: '<include ros_pkg="my_pkg" path="trees/common.xml"/>',
    validExample:
      "Provide a host implementation of resolvePackageUri that resolves my_pkg to a package root URI.",
  },
  [RuleCodes.RosPackageNotFound]: {
    code: RuleCodes.RosPackageNotFound,
    title: "ROS package not found",
    description: "ros_pkg include must resolve to a known package root URI.",
    suppressible: false,
    invalidExample: '<include ros_pkg="missing_pkg" path="trees/common.xml"/>',
    validExample: '<include ros_pkg="my_pkg" path="trees/common.xml"/>',
  },
  [RuleCodes.UnknownNode]: defaultRule(
    RuleCodes.UnknownNode,
    "Unknown node",
    "Node usages must resolve to a known model.",
    true,
  ),
  [RuleCodes.MissingRequiredPort]: {
    code: RuleCodes.MissingRequiredPort,
    title: "Missing required port",
    description: "Required ports must be supplied.",
    suppressible: true,
    invalidExample: '<Action ID="SetFlag"/>',
    validExample: '<Action ID="SetFlag" enabled="true"/>',
    configExample: '{"linter":{"rules":{"model/require-port":"warn"}}}',
  },
  [RuleCodes.UnknownPort]: {
    code: RuleCodes.UnknownPort,
    title: "Unknown port",
    description: "Unknown ports are reported against the resolved node model.",
    suppressible: true,
    invalidExample: '<Action ID="SetFlag" unknown="1"/>',
    validExample: '<Action ID="SetFlag" enabled="true"/>',
    configExample: '{"linter":{"rules":{"model/no-unknown-port":"error"}}}',
  },
  [RuleCodes.InvalidPortValueType]: {
    code: RuleCodes.InvalidPortValueType,
    title: "Invalid port value type",
    description: "Port values must match the declared type.",
    suppressible: true,
    invalidExample: '<Action ID="SetFlag" enabled="yes"/>',
    validExample: '<Action ID="SetFlag" enabled="true"/>',
    configExample: '{"linter":{"rules":{"model/valid-port-value":"warn"}}}',
  },
  [RuleCodes.BlackboardTypeMismatch]: {
    code: RuleCodes.BlackboardTypeMismatch,
    title: "Blackboard type mismatch",
    description: "Blackboard entries must not mix incompatible resolved port types.",
    suppressible: true,
    invalidExample: '<Sequence><ReadPose pose="{target}"/><UseString text="{target}"/></Sequence>',
    validExample: '<Sequence><ReadPose pose="{target}"/><UsePose pose="{target}"/></Sequence>',
    configExample:
      '{"linter":{"rules":{"model/no-blackboard-type-mismatch":["warn",{"allowStringEntryCompatibility":true}]}}}',
  },
  [RuleCodes.CustomLiteralRequiresValidator]: {
    code: RuleCodes.CustomLiteralRequiresValidator,
    title: "Custom literal requires validator",
    description: "Literal values for custom port types require a validator.",
    suppressible: true,
    invalidExample: '<Action ID="MoveTo" target="1.0;2.0;3.14"/>',
    validExample: '<Action ID="MoveTo" target="{target}"/>',
    configExample: '{"linter":{"rules":{"model/valid-port-value":"warn"}}}',
  },
  [RuleCodes.InvalidPortDefaultValue]: {
    code: RuleCodes.InvalidPortDefaultValue,
    title: "Invalid port default value",
    description: "TreeNodesModel port defaults must match the declared type.",
    suppressible: true,
    invalidExample: '<input_port name="count" type="int" default="abc"/>',
    validExample: '<input_port name="count" type="int" default="1"/>',
    configExample: '{"linter":{"rules":{"model/valid-port-default-value":"warn"}}}',
  },
  [RuleCodes.OutputPortRequiresRemap]: {
    code: RuleCodes.OutputPortRequiresRemap,
    title: "Output port requires remap",
    description:
      "Resolved output ports must be explicitly or default-remapped to a blackboard entry.",
    suppressible: true,
    invalidExample: '<Action ID="Producer" result="value"/>',
    validExample: '<Action ID="Producer" result="{value}"/>',
    configExample: '{"linter":{"rules":{"model/require-output-port-remap":"error"}}}',
  },
  [RuleCodes.AugmentTargetNotFound]: {
    code: RuleCodes.AugmentTargetNotFound,
    title: "Augmentation target not found",
    description: "Model augmentations must target an existing node model.",
    suppressible: false,
    invalidExample: '{"augment":{"MissingNode":{"ports":{}}}}',
    validExample: '{"augment":{"MoveTo":{"ports":{}}}}',
  },
  [RuleCodes.AugmentPortNotFound]: {
    code: RuleCodes.AugmentPortNotFound,
    title: "Augmentation port not found",
    description: "Model augmentations must target an existing port on the node model.",
    suppressible: false,
    invalidExample: '{"augment":{"MoveTo":{"ports":{"missing":{}}}}}',
    validExample: '{"augment":{"MoveTo":{"ports":{"target":{}}}}}',
  },
  [RuleCodes.InvalidTypeRefinement]: {
    code: RuleCodes.InvalidTypeRefinement,
    title: "Invalid type refinement",
    description:
      "Model augmentation type refinements must match the port base type when `from` is provided.",
    suppressible: false,
    invalidExample: '{"typeRefinement":{"from":"std::string","to":"Pose2D"}}',
    validExample: '{"typeRefinement":{"from":"int","to":"Pose2D"}}',
  },
  [RuleCodes.ChildCapableNodeSelfClosing]: {
    code: RuleCodes.ChildCapableNodeSelfClosing,
    title: "Child-capable node is self-closing",
    description: "Control and decorator nodes should normally use open/close tags.",
    suppressible: true,
    invalidExample: "<Sequence/>",
    validExample: "<Sequence>\n  <AlwaysSuccess/>\n</Sequence>",
    configExample: '{"linter":{"rules":{"model/no-childless-control-shape-mismatch":"off"}}}',
  },
  [RuleCodes.LeafNodeOpenClose]: {
    code: RuleCodes.LeafNodeOpenClose,
    title: "Leaf node uses block shape",
    description: "Leaf nodes should normally be self-closing unless they contain child nodes.",
    suppressible: true,
    invalidExample: "<AlwaysSuccess></AlwaysSuccess>",
    validExample: "<AlwaysSuccess/>",
    configExample: '{"linter":{"rules":{"model/no-leaf-block-shape":"off"}}}',
  },
  [RuleCodes.InvalidChildCount]: {
    code: RuleCodes.InvalidChildCount,
    title: "Invalid child count",
    description:
      "Node child count must satisfy the constraints for its kind: Action/Condition have no children, Decorator has exactly one, Control has one or more, SubTree has none, and special builtins like IfThenElse/WhileDoElse require 2 or 3.",
    suppressible: true,
    invalidExample: "<Sequence/>",
    validExample: "<Sequence><AlwaysSuccess/></Sequence>",
    configExample: '{"linter":{"rules":{"model/valid-child-count":"warn"}}}',
  },
  [RuleCodes.ExternalModelFileNotFound]: {
    code: RuleCodes.ExternalModelFileNotFound,
    title: "External model file not found",
    description: "Configured external TreeNodesModel files must exist.",
    suppressible: false,
    invalidExample: '{"models":{"files":["missing.xml"]}}',
    validExample: '{"models":{"files":["models.xml"]}}',
  },
  [RuleCodes.AugmentationFileNotFound]: {
    code: RuleCodes.AugmentationFileNotFound,
    title: "Augmentation file not found",
    description: "Configured augmentation files must exist.",
    suppressible: false,
    invalidExample: '{"models":{"augmentations":["missing.xml"]}}',
    validExample: '{"models":{"augmentations":["augmentations.xml"]}}',
  },
  [RuleCodes.MissingTreeNodesModel]: defaultRule(
    RuleCodes.MissingTreeNodesModel,
    "Missing TreeNodesModel",
    "External model files must contain a TreeNodesModel.",
    false,
  ),
  [RuleCodes.ExternalModelXmlParseError]: defaultRule(
    RuleCodes.ExternalModelXmlParseError,
    "External model XML parse error",
    "External model files must parse as XML.",
    false,
  ),
  [RuleCodes.NodeDefinitionFileNotFound]: {
    code: RuleCodes.NodeDefinitionFileNotFound,
    title: "Node definition file not found",
    description: "Configured node definition files must exist.",
    suppressible: false,
    invalidExample: '{"models":{"definitions":["missing.json"]}}',
    validExample: '{"models":{"definitions":["nodes.json"]}}',
  },
  [RuleCodes.InvalidNodeDefinitionJson]: defaultRule(
    RuleCodes.InvalidNodeDefinitionJson,
    "Invalid node definition JSON",
    "Node definition files must parse as JSON.",
    false,
  ),
  [RuleCodes.InvalidNodeDefinitionSchema]: defaultRule(
    RuleCodes.InvalidNodeDefinitionSchema,
    "Invalid node definition schema",
    "Node definition files must match the expected schema.",
    false,
  ),
  [RuleCodes.DuplicateNodeDefinitionId]: defaultRule(
    RuleCodes.DuplicateNodeDefinitionId,
    "Duplicate node definition ID",
    "Node definition IDs must be unique.",
    false,
  ),
  [RuleCodes.InvalidAugmentationJson]: defaultRule(
    RuleCodes.InvalidAugmentationJson,
    "Invalid augmentation JSON",
    "Model augmentation files must parse as JSON.",
    false,
  ),
  [RuleCodes.InvalidAugmentationSchema]: defaultRule(
    RuleCodes.InvalidAugmentationSchema,
    "Invalid augmentation schema",
    "Model augmentation files must match the expected schema.",
    false,
  ),
  [RuleCodes.ConflictingPortDefault]: {
    code: RuleCodes.ConflictingPortDefault,
    title: "Conflicting port default",
    description: "Merged port defaults must agree.",
    suppressible: false,
    fix: "Run `btxmlc repair` to inspect conflicts. Run `btxmlc repair --write` to resolve the conflict interactively.",
  },
  [RuleCodes.UnusedSuppression]: defaultRule(
    RuleCodes.UnusedSuppression,
    "Unused suppression",
    "Suppressions should match at least one diagnostic.",
    false,
  ),
  [RuleCodes.MissingSuppressionReason]: defaultRule(
    RuleCodes.MissingSuppressionReason,
    "Missing suppression reason",
    "Suppressions should include a reason when required.",
    false,
  ),
  XML016_TEXT_OUTSIDE_ROOT: defaultRule(
    "XML016_TEXT_OUTSIDE_ROOT",
    "Text outside root element",
    "Non-whitespace text is not allowed outside the root element.",
    false,
  ),
};

const RuntimeDefaultSeverityByCode: Record<string, Severity> = Object.fromEntries(
  Object.values(RULES).flatMap((rule) => {
    const entry = rule as RuleRegistryEntry;
    return [entry.code, ...(entry.codes ?? []).filter((code) => code !== entry.code)].map(
      (code) => [code, entry.defaultSeverity],
    );
  }),
);

const StandaloneDefaultSeverityByCode: Record<string, RuleMetadataDefaultSeverity> = {
  [RuleCodes.DuplicateNodeModelId]: "error",
  [RuleCodes.UnknownTopLevelElement]: "warning",
  [RuleCodes.UnresolvedIncludePathVariable]: "error",
  [RuleCodes.ExternalIncludeUsed]: "info",
  [RuleCodes.IncludeDepthExceeded]: "error",
  [RuleCodes.TooManyResolvedFiles]: "error",
  [RuleCodes.EntrypointNotFound]: "error",
  [RuleCodes.ExternalModelFileNotFound]: "error",
  [RuleCodes.AugmentationFileNotFound]: "error",
  [RuleCodes.MissingTreeNodesModel]: "error",
  [RuleCodes.ExternalModelXmlParseError]: "error",
  [RuleCodes.NodeDefinitionFileNotFound]: "error",
  [RuleCodes.InvalidNodeDefinitionJson]: "error",
  [RuleCodes.InvalidNodeDefinitionSchema]: "error",
  [RuleCodes.DuplicateNodeDefinitionId]: "error",
  [RuleCodes.InvalidAugmentationJson]: "error",
  [RuleCodes.InvalidAugmentationSchema]: "error",
  [RuleCodes.CustomLiteralRequiresValidator]: "error",
  [RuleCodes.InvalidPortDefaultValue]: "error",
  [RuleCodes.InvalidPortName]: "error",
  [RuleCodes.AugmentTargetNotFound]: "error",
  [RuleCodes.AugmentPortNotFound]: "error",
  [RuleCodes.InvalidTypeRefinement]: "error",
  [RuleCodes.ConflictingPortDefault]: "warning",
  [RuleCodes.EmptyScript]: "error",
  [RuleCodes.InvalidScriptToken]: "error",
  [RuleCodes.InvalidCompoundAssignment]: "error",
  [RuleCodes.ScriptVariableTypeMismatch]: "error",
  XML016_TEXT_OUTSIDE_ROOT: "error",
};

function defaultSeverityForCode(code: string): RuleMetadataDefaultSeverity {
  const severity = RuntimeDefaultSeverityByCode[code] ?? StandaloneDefaultSeverityByCode[code];
  if (!severity) {
    throw new Error(`Missing default severity metadata for ${code}`);
  }
  return severity;
}

export const RuleMetadataByCode: Record<string, RuleMetadata> = {};
for (const [code, metadata] of Object.entries(RuleMetadataDetailsByCode)) {
  RuleMetadataByCode[code] = {
    ...metadata,
    defaultSeverity: defaultSeverityForCode(code),
  };
}

export const RuleMetadataBySlug: Record<string, RuleMetadata> = {};
for (const [slug, rule] of Object.entries(RULES)) {
  const meta = RuleMetadataByCode[rule.code];
  if (meta) {
    const entry: RuleRegistryEntry = rule;
    RuleMetadataBySlug[slug] = entry.options ? { ...meta, options: entry.options } : meta;
  }
}

export function findRuleMetadata(code: string) {
  return RuleMetadataByCode[code];
}

export function getRuleMetadata(value: string) {
  return RuleMetadataBySlug[value] ?? RuleMetadataByCode[value];
}

export function listRuleCodes() {
  return [...Object.values(RuleCodes)].sort();
}

export function listRuleSlugs() {
  return Object.keys(RULES).sort();
}

export function listRules(): Array<{ name: RuleName; metadata: RuleMetadata }> {
  const rules: Array<{ name: RuleName; metadata: RuleMetadata }> = [];
  for (const name of listRuleSlugs()) {
    const metadata = RuleMetadataBySlug[name];
    if (!metadata) continue;
    rules.push({ name: name as RuleName, metadata });
  }
  return rules;
}
