import type { ConfigSeverity as Severity } from "@btxml/config";
import { z } from "zod";
import { RuleCodes } from "../rule-codes.js";

export type RuleOptionDoc = {
  name: string;
  type: string;
  default?: string;
  description: string;
};

export type RuleRegistryEntry<TOptions = unknown> = {
  code: string;
  codes?: readonly string[];
  defaultSeverity: Severity;
  optionsSchema?: z.ZodType<TOptions>;
  options?: RuleOptionDoc[];
  description: string;
};

const noUnknownPortOptionsSchema = z
  .object({
    subTreePorts: z.enum(["loose", "strict"]).optional(),
  })
  .strict();

const noBlackboardTypeMismatchOptionsSchema = z
  .object({
    allowStringEntryCompatibility: z.boolean().optional(),
  })
  .strict();

export const RULES = {
  "script/valid-syntax": {
    code: RuleCodes.InvalidScriptSyntax,
    defaultSeverity: "error" as Severity,
    description: "Script-bearing attributes must parse as valid BT.CPP scripts.",
  },
  "script/no-unknown-variable": {
    code: RuleCodes.UnknownScriptVariable,
    defaultSeverity: "warn" as Severity,
    description: "Script-bearing attributes should not reference unknown variables.",
  },
  "script/valid-assignment": {
    code: RuleCodes.AssignmentToUnknownVariable,
    codes: [
      RuleCodes.AssignmentToUnknownVariable,
      RuleCodes.InvalidCompoundAssignment,
      RuleCodes.ScriptVariableTypeMismatch,
      RuleCodes.InvalidGlobalBlackboardIdentifier,
    ],
    defaultSeverity: "error" as Severity,
    description: "Script assignments must target known variables and use compatible types.",
  },
  "script/valid-expression-type": {
    code: RuleCodes.InvalidScriptOperandType,
    defaultSeverity: "error" as Severity,
    description: "Script expressions must use operators with compatible operand types.",
  },
  "script/valid-result-type": {
    code: RuleCodes.ScriptResultNotBoolCompatible,
    defaultSeverity: "error" as Severity,
    description: "Condition-style script attributes must have a bool-compatible inferred result.",
  },
  "xml/valid-root": {
    code: RuleCodes.InvalidRootElement,
    defaultSeverity: "error" as Severity,
    description: "Root element must be <root>.",
  },
  "xml/require-btcpp-format": {
    code: RuleCodes.MissingBTCPPFormat,
    defaultSeverity: "warn" as Severity,
    description: 'Root element must declare BTCPP_format="4".',
  },
  "tree/require-id": {
    code: RuleCodes.MissingBehaviorTreeID,
    defaultSeverity: "error" as Severity,
    description: "BehaviorTree elements require an ID attribute.",
  },
  "tree/no-duplicate-id-in-file": {
    code: RuleCodes.DuplicateBehaviorTreeID,
    defaultSeverity: "error" as Severity,
    description: "BehaviorTree IDs must be unique within a file.",
  },
  "tree/no-duplicate-id": {
    code: RuleCodes.DuplicateBehaviorTreeIdInWorkspace,
    defaultSeverity: "error" as Severity,
    description: "BehaviorTree IDs must be unique across the workspace.",
  },
  "tree/no-unknown-subtree": {
    code: RuleCodes.UnknownSubTree,
    defaultSeverity: "error" as Severity,
    description: "A SubTree must resolve to a BehaviorTree or a configured model.",
  },
  "tree/no-unknown-main-tree": {
    code: RuleCodes.UnknownMainTree,
    defaultSeverity: "error" as Severity,
    description: "main_tree_to_execute must reference a known BehaviorTree.",
  },
  "tree/no-ambiguous-subtree": {
    code: RuleCodes.AmbiguousSubTree,
    defaultSeverity: "error" as Severity,
    description: "SubTree references must resolve to a single definition.",
  },
  "tree/no-duplicate-node-model-id": {
    code: RuleCodes.DuplicateNodeModelId,
    defaultSeverity: "error" as Severity,
    description: "TreeNodesModel elements must have unique IDs within the same model block.",
  },
  "xml/no-unknown-top-level-element": {
    code: RuleCodes.UnknownTopLevelElement,
    defaultSeverity: "warn" as Severity,
    description:
      "Top-level elements must be BehaviorTree, TreeNodesModel, or configured include elements.",
  },
  "include/require-path": {
    code: RuleCodes.MissingIncludePath,
    defaultSeverity: "error" as Severity,
    description: "include elements require a path attribute.",
  },
  "include/no-missing-file": {
    code: RuleCodes.IncludeNotFound,
    defaultSeverity: "error" as Severity,
    description: "Referenced include file does not exist.",
  },
  "include/no-cycle": {
    code: RuleCodes.IncludeCycle,
    defaultSeverity: "error" as Severity,
    description: "Include graph cycles are not allowed.",
  },
  "include/no-outside-root": {
    code: RuleCodes.IncludeOutsideWorkspace,
    defaultSeverity: "error" as Severity,
    description: "Includes must stay within the workspace root.",
  },
  "include/no-unresolved-variable": {
    code: RuleCodes.UnresolvedIncludePathVariable,
    defaultSeverity: "error" as Severity,
    description: "Include path variables must resolve before lookup.",
  },
  "include/no-depth-exceeded": {
    code: RuleCodes.IncludeDepthExceeded,
    defaultSeverity: "error" as Severity,
    description: "Include resolution must stay within the configured maximum depth.",
  },
  "include/no-too-many-files": {
    code: RuleCodes.TooManyResolvedFiles,
    defaultSeverity: "error" as Severity,
    description: "Include resolution must stay within the configured file limit.",
  },
  "include/require-ros-package-resolver": {
    code: RuleCodes.RosPackageResolverMissing,
    defaultSeverity: "error" as Severity,
    description: "When include uses ros_pkg, a host resolvePackageUri capability must be provided.",
  },
  "include/no-missing-ros-package": {
    code: RuleCodes.RosPackageNotFound,
    defaultSeverity: "error" as Severity,
    description: "ros_pkg include must resolve to an existing ROS package root URI.",
  },
  "include/report-external-used": {
    code: RuleCodes.ExternalIncludeUsed,
    defaultSeverity: "info" as Severity,
    description: "Reports when an allowed include resolves outside the workspace root.",
  },
  "model/no-unknown-node": {
    code: RuleCodes.UnknownNode,
    defaultSeverity: "warn" as Severity,
    description: "Node usages must resolve to a known model.",
  },
  "model/require-port": {
    code: RuleCodes.MissingRequiredPort,
    defaultSeverity: "error" as Severity,
    description: "Required ports must be supplied.",
  },
  "model/require-port-name": {
    code: RuleCodes.MissingPortName,
    defaultSeverity: "error" as Severity,
    description: "Port elements require a name attribute.",
  },
  "model/no-duplicate-port-name": {
    code: RuleCodes.DuplicatePortName,
    defaultSeverity: "error" as Severity,
    description: "Ports with the same name are not allowed.",
  },
  "model/valid-port-name": {
    code: RuleCodes.InvalidPortName,
    defaultSeverity: "error" as Severity,
    description: "Port names must be valid XML attribute names for BT nodes.",
  },
  "model/no-unknown-port": {
    code: RuleCodes.UnknownPort,
    defaultSeverity: "warn" as Severity,
    optionsSchema: noUnknownPortOptionsSchema,
    options: [
      {
        name: "subTreePorts",
        type: '"loose" | "strict"',
        default: "loose",
        description: "Controls whether SubTree remap attributes are checked strictly.",
      },
    ],
    description: "Reports ports that are not declared by the resolved node model.",
  },
  "model/valid-port-value": {
    code: RuleCodes.InvalidPortValueType,
    defaultSeverity: "error" as Severity,
    description: "Port values must match the declared type.",
  },
  "model/no-blackboard-type-mismatch": {
    code: RuleCodes.BlackboardTypeMismatch,
    defaultSeverity: "error" as Severity,
    optionsSchema: noBlackboardTypeMismatchOptionsSchema,
    options: [
      {
        name: "allowStringEntryCompatibility",
        type: "boolean",
        default: "true",
        description:
          "Treat std::string blackboard entries as runtime-compatible with other port types, matching BT.CPP's existing-entry special case.",
      },
    ],
    description: "Blackboard entries must not mix incompatible resolved port types.",
  },
  "model/valid-port-default-value": {
    code: RuleCodes.InvalidPortDefaultValue,
    defaultSeverity: "error" as Severity,
    description: "TreeNodesModel port defaults must match the declared type.",
  },
  "model/require-output-port-remap": {
    code: RuleCodes.OutputPortRequiresRemap,
    defaultSeverity: "warn" as Severity,
    description: "Resolved output ports must write to a blackboard remap.",
  },
  "model/no-childless-control-shape-mismatch": {
    code: RuleCodes.ChildCapableNodeSelfClosing,
    defaultSeverity: "warn" as Severity,
    description: "Control and decorator nodes should normally use open/close tags.",
  },
  "model/no-leaf-block-shape": {
    code: RuleCodes.LeafNodeOpenClose,
    defaultSeverity: "warn" as Severity,
    description: "Leaf nodes should normally be self-closing unless they contain child nodes.",
  },
  "model/valid-child-count": {
    code: RuleCodes.InvalidChildCount,
    defaultSeverity: "warn" as Severity,
    description:
      "Child count must match the expected count for the node kind (Action/Condition: 0, Decorator: 1, Control: >=1, special builtins: fixed range).",
  },
  "model/no-conflicting-definition": {
    code: RuleCodes.ConflictingNodeModel,
    defaultSeverity: "error" as Severity,
    description: "Node model definitions must agree on kind and port shape.",
  },
  "model/no-conflicting-kind-for-id": {
    code: RuleCodes.ConflictingModelKind,
    defaultSeverity: "error",
    description: "A model ID must not be defined with different kinds.",
  },
  "model/no-unused-definition": {
    code: RuleCodes.UnusedModelDefinition,
    defaultSeverity: "error",
    description: "Inline model definitions should be used in the same BT XML file.",
  },
  "model/no-duplicate-definition": {
    code: RuleCodes.DuplicateModelDefinition,
    defaultSeverity: "error",
    description: "A user-defined model (ID, kind) should be defined only once.",
  },
  "suppression/no-unused": {
    code: RuleCodes.UnusedSuppression,
    defaultSeverity: "warn" as Severity,
    description: "Suppressions should match at least one diagnostic.",
  },
  "suppression/require-reason": {
    code: RuleCodes.MissingSuppressionReason,
    defaultSeverity: "off" as Severity,
    description: "Suppressions should include a reason when required.",
  },
} as const satisfies Record<string, RuleRegistryEntry>;

export type RuleName = keyof typeof RULES;
export type DiagnosticCode = (typeof RULES)[RuleName]["code"];
