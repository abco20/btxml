# Diagnostic Rules

Generated from `RuleMetadataBySlug`. Run `pnpm docs:rules` to regenerate this file.

## Project Structure

## include/no-cycle

**Title:** Include cycle
**Diagnostic code:** `BT303_INCLUDE_CYCLE`
**Default severity:** error

### Description

Include graph cycles are not allowed.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"include/no-cycle":"warn"}}}
```

### Suppression

Not suppressible.

## include/no-depth-exceeded

**Title:** Include depth exceeded
**Diagnostic code:** `BT309_INCLUDE_DEPTH_EXCEEDED`
**Default severity:** error

### Description

The maximum depth of nested includes was reached.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"include/no-depth-exceeded":"warn"}}}
```

### Suppression

Not suppressible.

## include/no-missing-file

**Title:** Include not found
**Diagnostic code:** `BT302_INCLUDE_NOT_FOUND`
**Default severity:** error

### Description

Referenced include file does not exist.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<include path="missing.xml"/>
```

### Valid example / fix

```xml
<include path="common.xml"/>
```

### Config override

```json
{"linter":{"rules":{"include/no-missing-file":"warn"}}}
```

### Suppression

Not suppressible.

## include/no-missing-ros-package

**Title:** ROS package not found
**Diagnostic code:** `BT313_ROS_PACKAGE_NOT_FOUND`
**Default severity:** error

### Description

ros_pkg include must resolve to a known package root URI.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<include ros_pkg="missing_pkg" path="trees/common.xml"/>
```

### Valid example / fix

```xml
<include ros_pkg="my_pkg" path="trees/common.xml"/>
```

### Config override

```json
{"linter":{"rules":{"include/no-missing-ros-package":"warn"}}}
```

### Suppression

Not suppressible.

## include/no-outside-root

**Title:** Include outside workspace
**Diagnostic code:** `BT306_INCLUDE_OUTSIDE_WORKSPACE`
**Default severity:** error

### Description

Includes must stay within the workspace root.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"include/no-outside-root":"warn"}}}
```

### Suppression

Not suppressible.

## include/no-too-many-files

**Title:** Too many resolved files
**Diagnostic code:** `BT310_TOO_MANY_RESOLVED_FILES`
**Default severity:** error

### Description

The maximum number of allowed files included was reached.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"include/no-too-many-files":"warn"}}}
```

### Suppression

Not suppressible.

## include/no-unresolved-variable

**Title:** Unresolved include path variable
**Diagnostic code:** `BT304_UNRESOLVED_INCLUDE_PATH_VARIABLE`
**Default severity:** error

### Description

Include path variables must resolve before lookup.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"include/no-unresolved-variable":"warn"}}}
```

### Suppression

Not suppressible.

## include/report-external-used

**Title:** External include used
**Diagnostic code:** `BT307_EXTERNAL_INCLUDE_USED`
**Default severity:** info

### Description

An include file outside the workspace root was used.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"include/report-external-used":"warn"}}}
```

### Suppression

Not suppressible.

## include/require-path

**Title:** Missing include path
**Diagnostic code:** `BT301_MISSING_INCLUDE_PATH`
**Default severity:** error

### Description

include elements require a path attribute.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<include/>
```

### Valid example / fix

```xml
<include path="common.xml"/>
```

### Config override

```json
{"linter":{"rules":{"include/require-path":"warn"}}}
```

### Suppression

Not suppressible.

## include/require-ros-package-resolver

**Title:** ROS package resolver is missing
**Diagnostic code:** `BT312_ROS_PACKAGE_RESOLVER_MISSING`
**Default severity:** error

### Description

include elements with ros_pkg require ProjectHost.resolvePackageUri to be provided.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<include ros_pkg="my_pkg" path="trees/common.xml"/>
```

### Valid example / fix

```xml
Provide a host implementation of resolvePackageUri that resolves my_pkg to a package root URI.
```

### Config override

```json
{"linter":{"rules":{"include/require-ros-package-resolver":"warn"}}}
```

### Suppression

Not suppressible.

## BehaviorTree Usage

## model/no-blackboard-type-mismatch

**Title:** Blackboard type mismatch
**Diagnostic code:** `BT111_BLACKBOARD_TYPE_MISMATCH`
**Default severity:** error

### Description

Blackboard entries must not mix incompatible resolved port types.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Sequence><ReadPose pose="{target}"/><UseString text="{target}"/></Sequence>
```

### Valid example / fix

```xml
<Sequence><ReadPose pose="{target}"/><UsePose pose="{target}"/></Sequence>
```

### Config override

```json
{"linter":{"rules":{"model/no-blackboard-type-mismatch":["warn",{"allowStringEntryCompatibility":true}]}}}
```

### Options

- `allowStringEntryCompatibility` (boolean): Treat std::string blackboard entries as runtime-compatible with other port types, matching BT.CPP's existing-entry special case. Default: `true`.

### Suppression

```xml
<!-- btxml-disable-next-line BT111_BLACKBOARD_TYPE_MISMATCH reason: ... -->
```

## model/no-childless-control-shape-mismatch

**Title:** Child-capable node is self-closing
**Diagnostic code:** `BT108_CHILD_CAPABLE_NODE_SELF_CLOSING`
**Default severity:** warn

### Description

Control and decorator nodes should normally use open/close tags.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Sequence/>
```

### Valid example / fix

```xml
<Sequence>
  <AlwaysSuccess/>
</Sequence>
```

### Config override

```json
{"linter":{"rules":{"model/no-childless-control-shape-mismatch":"off"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT108_CHILD_CAPABLE_NODE_SELF_CLOSING reason: ... -->
```

## model/no-leaf-block-shape

**Title:** Leaf node uses block shape
**Diagnostic code:** `BT109_LEAF_NODE_OPEN_CLOSE`
**Default severity:** warn

### Description

Leaf nodes should normally be self-closing unless they contain child nodes.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<AlwaysSuccess></AlwaysSuccess>
```

### Valid example / fix

```xml
<AlwaysSuccess/>
```

### Config override

```json
{"linter":{"rules":{"model/no-leaf-block-shape":"off"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT109_LEAF_NODE_OPEN_CLOSE reason: ... -->
```

## model/no-unknown-node

**Title:** Unknown node
**Diagnostic code:** `BT105_UNKNOWN_NODE`
**Default severity:** warn

### Description

Node usages must resolve to a known model.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"model/no-unknown-node":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT105_UNKNOWN_NODE reason: ... -->
```

## model/no-unknown-port

**Title:** Unknown port
**Diagnostic code:** `BT102_UNKNOWN_PORT`
**Default severity:** warn

### Description

Unknown ports are reported against the resolved node model.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Action ID="SetFlag" unknown="1"/>
```

### Valid example / fix

```xml
<Action ID="SetFlag" enabled="true"/>
```

### Config override

```json
{"linter":{"rules":{"model/no-unknown-port":"error"}}}
```

### Options

- `subTreePorts` ("loose" | "strict"): Controls whether SubTree remap attributes are checked strictly. Default: `loose`.

### Suppression

```xml
<!-- btxml-disable-next-line BT102_UNKNOWN_PORT reason: ... -->
```

## model/require-output-port-remap

**Title:** Output port requires remap
**Diagnostic code:** `BT115_OUTPUT_PORT_REQUIRES_REMAP`
**Default severity:** warn

### Description

Resolved output ports must write to a blackboard remap.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Action ID="Producer" result="value"/>
```

### Valid example / fix

```xml
<Action ID="Producer" result="{value}"/>
```

### Config override

```json
{"linter":{"rules":{"model/require-output-port-remap":"error"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT115_OUTPUT_PORT_REQUIRES_REMAP reason: ... -->
```

## model/require-port

**Title:** Missing required port
**Diagnostic code:** `BT101_MISSING_REQUIRED_PORT`
**Default severity:** error

### Description

Required ports must be supplied.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Action ID="SetFlag"/>
```

### Valid example / fix

```xml
<Action ID="SetFlag" enabled="true"/>
```

### Config override

```json
{"linter":{"rules":{"model/require-port":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT101_MISSING_REQUIRED_PORT reason: ... -->
```

## model/valid-child-count

**Title:** Invalid child count
**Diagnostic code:** `BT110_INVALID_CHILD_COUNT`
**Default severity:** warn

### Description

Node child count must satisfy the constraints for its kind: Action/Condition have no children, Decorator has exactly one, Control has one or more, SubTree has none, and special builtins like IfThenElse/WhileDoElse require 2 or 3.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Sequence/>
```

### Valid example / fix

```xml
<Sequence><AlwaysSuccess/></Sequence>
```

### Config override

```json
{"linter":{"rules":{"model/valid-child-count":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT110_INVALID_CHILD_COUNT reason: ... -->
```

## model/valid-port-default-value

**Title:** Invalid port default value
**Diagnostic code:** `BT114_INVALID_PORT_DEFAULT_VALUE`
**Default severity:** error

### Description

TreeNodesModel port defaults must match the declared type.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<input_port name="count" type="int" default="abc"/>
```

### Valid example / fix

```xml
<input_port name="count" type="int" default="1"/>
```

### Config override

```json
{"linter":{"rules":{"model/valid-port-default-value":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT114_INVALID_PORT_DEFAULT_VALUE reason: ... -->
```

## model/valid-port-name

**Title:** Invalid port name
**Diagnostic code:** `BT116_INVALID_PORT_NAME`
**Default severity:** error

### Description

Port names must be valid XML attribute names for BT nodes.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<input_port name="request.name" type="string"/>
```

### Valid example / fix

```xml
<input_port name="request_name" type="string"/>
```

### Config override

```json
{"linter":{"rules":{"model/valid-port-name":"warn"}}}
```

### Suppression

Not suppressible.

## model/valid-port-value

**Title:** Invalid port value type
**Diagnostic code:** `BT103_INVALID_PORT_VALUE_TYPE`
**Default severity:** error

### Description

Port values must match the declared type.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Action ID="SetFlag" enabled="yes"/>
```

### Valid example / fix

```xml
<Action ID="SetFlag" enabled="true"/>
```

### Config override

```json
{"linter":{"rules":{"model/valid-port-value":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT103_INVALID_PORT_VALUE_TYPE reason: ... -->
```

## BehaviorTree Structure

## model/no-conflicting-definition

**Title:** Conflicting node model
**Diagnostic code:** `BT012_CONFLICTING_NODE_MODEL`
**Default severity:** error

### Description

Node model definitions must agree on kind and port shape.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Run `btxmlc repair` to inspect conflicts. Run `btxmlc repair --write` to resolve the conflict interactively.
```

### Config override

```json
{"linter":{"rules":{"model/no-conflicting-definition":"warn"}}}
```

### Suppression

Not suppressible.

## model/no-duplicate-port-name

**Title:** Duplicate port name
**Diagnostic code:** `BT008_DUPLICATE_PORT_NAME`
**Default severity:** error

### Description

Ports with the same name are not allowed.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"model/no-duplicate-port-name":"warn"}}}
```

### Suppression

Not suppressible.

## model/require-port-name

**Title:** Missing port name
**Diagnostic code:** `BT007_MISSING_PORT_NAME`
**Default severity:** error

### Description

Port elements require a name attribute.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"model/require-port-name":"warn"}}}
```

### Suppression

Not suppressible.

## tree/no-ambiguous-subtree

**Title:** Ambiguous SubTree
**Diagnostic code:** `BT011_AMBIGUOUS_SUBTREE`
**Default severity:** error

### Description

SubTree references must resolve to a single definition.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"tree/no-ambiguous-subtree":"warn"}}}
```

### Suppression

Not suppressible.

## tree/no-duplicate-id

**Title:** Duplicate BehaviorTree ID in workspace
**Diagnostic code:** `BT013_DUPLICATE_BEHAVIOR_TREE_ID_IN_WORKSPACE`
**Default severity:** error

### Description

BehaviorTree IDs must be unique across the workspace.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<!-- file1.xml --><BehaviorTree ID="shared"/>
<!-- file2.xml --><BehaviorTree ID="shared"/>
```

### Valid example / fix

```xml
<!-- file1.xml --><BehaviorTree ID="shared"/>
<!-- file2.xml --><BehaviorTree ID="other"/>
```

### Config override

```json
{"linter":{"rules":{"tree/no-duplicate-id":"warn"}}}
```

### Suppression

Not suppressible.

## tree/no-duplicate-id-in-file

**Title:** Duplicate BehaviorTree ID
**Diagnostic code:** `BT004_DUPLICATE_BEHAVIOR_TREE_ID`
**Default severity:** error

### Description

BehaviorTree IDs must be unique within a file.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"tree/no-duplicate-id-in-file":"warn"}}}
```

### Suppression

Not suppressible.

## tree/no-duplicate-node-model-id

**Title:** Duplicate node model ID in TreeNodesModel
**Diagnostic code:** `BT006_DUPLICATE_NODE_MODEL_ID`
**Default severity:** error

### Description

TreeNodesModel elements must have unique IDs within the same model block.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"tree/no-duplicate-node-model-id":"warn"}}}
```

### Suppression

Not suppressible.

## tree/no-unknown-main-tree

**Title:** Unknown main tree
**Diagnostic code:** `BT010_UNKNOWN_MAIN_TREE`
**Default severity:** error

### Description

main_tree_to_execute must reference a known BehaviorTree.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"tree/no-unknown-main-tree":"warn"}}}
```

### Suppression

Not suppressible.

## tree/no-unknown-subtree

**Title:** Unknown SubTree reference
**Diagnostic code:** `BT005_UNKNOWN_SUBTREE`
**Default severity:** error

### Description

A SubTree must resolve to a BehaviorTree or a configured model.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<SubTree ID="missing_tree"/>
```

### Valid example / fix

```xml
<BehaviorTree ID="missing_tree"><Sequence/></BehaviorTree>
```

### Config override

```json
{"linter":{"rules":{"tree/no-unknown-subtree":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT005_UNKNOWN_SUBTREE reason: ... -->
```

## tree/require-id

**Title:** Missing BehaviorTree ID
**Diagnostic code:** `BT003_MISSING_BEHAVIOR_TREE_ID`
**Default severity:** error

### Description

BehaviorTree elements require an ID attribute.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"tree/require-id":"warn"}}}
```

### Suppression

Not suppressible.

## xml/no-unknown-top-level-element

**Title:** Unknown top-level element
**Diagnostic code:** `BT009_UNKNOWN_TOP_LEVEL_ELEMENT`
**Default severity:** warn

### Description

Top-level elements must be BehaviorTree, TreeNodesModel, or configured include elements.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"xml/no-unknown-top-level-element":"warn"}}}
```

### Suppression

Not suppressible.

## xml/require-btcpp-format

**Title:** Missing BTCPP format
**Diagnostic code:** `BT002_MISSING_BTCPP_FORMAT`
**Default severity:** warn

### Description

Root element must declare BTCPP_format="4".

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"xml/require-btcpp-format":"warn"}}}
```

### Suppression

Not suppressible.

## xml/valid-root

**Title:** Invalid root element
**Diagnostic code:** `BT001_INVALID_ROOT_ELEMENT`
**Default severity:** error

### Description

Root element must be <root>.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"xml/valid-root":"warn"}}}
```

### Suppression

Not suppressible.

## Suppressions

## script/no-unknown-variable

**Title:** Unknown script variable
**Diagnostic code:** `BT404_UNKNOWN_SCRIPT_VARIABLE`
**Default severity:** warn

### Description

Script-bearing attributes should not read blackboard or local variables that were never introduced.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<AlwaysSuccess _successIf="missing == 1"/>
```

### Valid example / fix

```xml
<Script code="count := 1; done = count"/>
```

### Config override

```json
{"linter":{"rules":{"script/no-unknown-variable":"warn"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT404_UNKNOWN_SCRIPT_VARIABLE reason: ... -->
```

## script/valid-assignment

**Title:** Assignment to unknown script variable
**Diagnostic code:** `BT405_ASSIGNMENT_TO_UNKNOWN_VARIABLE`
**Default severity:** error

### Description

Assignments with `=` or compound operators must target an existing script or blackboard variable.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<Script code="count = 1"/>
```

### Valid example / fix

```xml
<Script code="count := 1; count = 2"/>
```

### Config override

```json
{"linter":{"rules":{"script/valid-assignment":"error"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT405_ASSIGNMENT_TO_UNKNOWN_VARIABLE reason: ... -->
```

## script/valid-expression-type

**Title:** Invalid script operand type
**Diagnostic code:** `BT407_INVALID_SCRIPT_OPERAND_TYPE`
**Default severity:** error

### Description

Script operators and ternary conditions must be applied to operands with compatible inferred types.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<AlwaysSuccess _successIf="'x' * 2"/>
```

### Valid example / fix

```xml
<AlwaysSuccess _successIf="count * 2 > 0"/>
```

### Config override

```json
{"linter":{"rules":{"script/valid-expression-type":"error"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT407_INVALID_SCRIPT_OPERAND_TYPE reason: ... -->
```

## script/valid-result-type

**Title:** Script result is not bool-compatible
**Diagnostic code:** `BT408_SCRIPT_RESULT_NOT_BOOL_COMPATIBLE`
**Default severity:** error

### Description

Condition-style script attributes must end in an inferred bool-compatible result type.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<AlwaysSuccess _successIf="'hello'"/>
```

### Valid example / fix

```xml
<AlwaysSuccess _successIf="true"/>
```

### Config override

```json
{"linter":{"rules":{"script/valid-result-type":"error"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT408_SCRIPT_RESULT_NOT_BOOL_COMPATIBLE reason: ... -->
```

## script/valid-syntax

**Title:** Invalid script syntax
**Diagnostic code:** `BT401_INVALID_SCRIPT_SYNTAX`
**Default severity:** error

### Description

Script-bearing attributes must parse as valid BT.CPP scripts.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
<AlwaysSuccess _successIf="A +"/>
```

### Valid example / fix

```xml
<AlwaysSuccess _successIf="A == 1"/>
```

### Config override

```json
{"linter":{"rules":{"script/valid-syntax":"error"}}}
```

### Suppression

```xml
<!-- btxml-disable-next-line BT401_INVALID_SCRIPT_SYNTAX reason: ... -->
```

## suppression/no-unused

**Title:** Unused suppression
**Diagnostic code:** `BT351_UNUSED_SUPPRESSION`
**Default severity:** warn

### Description

Suppressions should match at least one diagnostic.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"suppression/no-unused":"warn"}}}
```

### Behavior

Default severity is `warn`.
Set `linter.rules["suppression/no-unused"]` to override it.
When `strict: true` is enabled, the effective default becomes `error` unless overridden by `linter.rules`.

### Suppression

Not suppressible.

## suppression/require-reason

**Title:** Missing suppression reason
**Diagnostic code:** `BT353_MISSING_SUPPRESSION_REASON`
**Default severity:** off

### Description

Suppressions should include a reason when required.

### Why this matters

Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.

### Invalid example

```xml
See rule description.
```

### Valid example / fix

```xml
Adjust the XML or config so the rule no longer triggers.
```

### Config override

```json
{"linter":{"rules":{"suppression/require-reason":"warn"}}}
```

### Behavior

Default severity is `off`.
Set `linter.rules["suppression/require-reason"]` to override it.
When `strict: true` is enabled, the effective default becomes `warn` unless overridden by `linter.rules`.

### Suppression

Not suppressible.
