import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("validator reports missing root format", () => {
  const result = validateBtXml(`<root><BehaviorTree ID="a"/></root>`, {
    config: defaultEffectiveConfig,
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === "BT002_MISSING_BTCPP_FORMAT"));
});

test("validator reports duplicate behavior tree and unknown subtree", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="a"/><BehaviorTree ID="a"/><BehaviorTree ID="b"><SubTree ID="missing"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === "BT004_DUPLICATE_BEHAVIOR_TREE_ID"));
  assert.ok(result.diagnostics.some((d) => d.code === "BT005_UNKNOWN_SUBTREE"));
});

test("validator reports tree nodes model port issues", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="X"><input_port type="bool"/><input_port name="x"/><input_port name="x"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === "BT007_MISSING_PORT_NAME"));
  assert.ok(result.diagnostics.some((d) => d.code === "BT008_DUPLICATE_PORT_NAME"));
});

test("validator reports invalid TreeNodesModel port names", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="X"><input_port name="request.name"/><input_port name="1target"/><input_port name="ID"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  const invalidPortNames = result.diagnostics.filter((d) => d.code === "BT116_INVALID_PORT_NAME");
  assert.equal(invalidPortNames.length, 3);
  assert.ok(invalidPortNames.some((d) => d.message.includes("request.name")));
  assert.ok(invalidPortNames.some((d) => d.message.includes("1target")));
  assert.ok(invalidPortNames.some((d) => d.message.includes("`ID` is a reserved attribute name")));
});

test("built-in arity is no longer validated", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Inverter><AlwaysSuccess/><AlwaysFailure/></Inverter></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT104_INVALID_NODE_ARITY"),
    false,
  );
});

test("duplicate node model ID inside same TreeNodesModel is an error", () => {
  const result = validateBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="SetFlag"/><Action ID="SetFlag"/></TreeNodesModel></root>',
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((diag) => diag.code === "BT006_DUPLICATE_NODE_MODEL_ID"));
});

test("same block different duplicate reports BT006 only", () => {
  const result = validateBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action><Action ID="Move"><input_port name="goal" type="CustomPayload"/></Action></TreeNodesModel></root>',
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((diag) => diag.code === "BT006_DUPLICATE_NODE_MODEL_ID"));
});

test("models.builtins = none disables built-ins", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        models: { ...defaultEffectiveConfig.models, builtins: ["none"] },
      },
    },
  );
  assert.ok(result.diagnostics.some((diag) => diag.code === "BT105_UNKNOWN_NODE"));
});

test("SubTree _autoremap allowed with built-ins enabled", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="true"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("SubTree _autoremap not warned with built-ins disabled by default", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="true"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        models: { ...defaultEffectiveConfig.models, builtins: ["none"] },
      },
    },
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("built-ins disabled strict still does not warn for reserved _autoremap on SubTree", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="true"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        models: { ...defaultEffectiveConfig.models, builtins: ["none"] },
        linter: {
          ...defaultEffectiveConfig.linter,
          rules: { "model/no-unknown-port": ["warn", { subTreePorts: "strict" }] },
        },
      },
    },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("arbitrary remap is allowed by default when only BehaviorTree target exists", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" target="{goal}" prefix="target" timeout="10"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("arbitrary remap is reported in strict mode without SubTree model", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" target="{goal}" prefix="target" timeout="10"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        linter: {
          ...defaultEffectiveConfig.linter,
          rules: { "model/no-unknown-port": ["warn", { subTreePorts: "strict" }] },
        },
      },
    },
  );
  assert.ok(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT" && d.message.includes("target")),
  );
});

test("SubTree model validates ports even when strict mode is false", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" target="{goal}" typo="1"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><SubTree ID="Child"><input_port name="target" type="std::string"/></SubTree></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT" && d.message.includes("typo")),
  );
});

test("unresolved SubTree does not produce port noise by default", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Missing" target="{goal}"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT005_UNKNOWN_SUBTREE"));
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("unresolved SubTree reports ports in strict mode", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Missing" target="{goal}"/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        linter: {
          ...defaultEffectiveConfig.linter,
          rules: { "model/no-unknown-port": ["warn", { subTreePorts: "strict" }] },
        },
      },
    },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT005_UNKNOWN_SUBTREE"));
  assert.ok(result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT"));
});

test("SubTree generic ports are type-checked by default", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="not-a-bool" arbitrary="1"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(
    result.diagnostics.some(
      (d) => d.code === "BT103_INVALID_PORT_VALUE_TYPE" && d.message.includes("_autoremap"),
    ),
  );
});

test("unresolved SubTree still type-checks generic ports without port noise by default", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Missing" _autoremap="bad" target="{goal}"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT005_UNKNOWN_SUBTREE"));
  assert.ok(
    result.diagnostics.some(
      (d) => d.code === "BT103_INVALID_PORT_VALUE_TYPE" && d.message.includes("_autoremap"),
    ),
  );
});

test("strict SubTree port checking reports unknown remap attributes", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" target="{goal}"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        linter: {
          ...defaultEffectiveConfig.linter,
          rules: { "model/no-unknown-port": ["warn", { subTreePorts: "strict" }] },
        },
      },
    },
  );
  assert.ok(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT" && d.message.includes("target")),
  );
});

test("_autoremap is not type-checked when built-ins are disabled and no generic SubTree model is provided", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="bad"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    {
      config: {
        ...defaultEffectiveConfig,
        models: { ...defaultEffectiveConfig.models, builtins: ["none"] },
      },
    },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("SubTree model required ports are checked", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><SubTree ID="Child"><input_port name="target" type="std::string"/></SubTree></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(
    result.diagnostics.some(
      (d) => d.code === "BT101_MISSING_REQUIRED_PORT" && d.message.includes("target"),
    ),
  );
});

test("self-closing control nodes produce a warning", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some(
      (d) =>
        d.code === "BT108_CHILD_CAPABLE_NODE_SELF_CLOSING" &&
        d.message === "Control node `Sequence` normally expects child nodes.",
    ),
  );
});

test("leaf nodes with open-close shape produce a warning", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess></AlwaysSuccess></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some(
      (d) =>
        d.code === "BT109_LEAF_NODE_OPEN_CLOSE" &&
        d.message === "Action node `AlwaysSuccess` should be self-closing or have no children.",
    ),
  );
});

test("leaf nodes with actual children are not warned for block shape", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess><Sequence/></AlwaysSuccess></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((d) => d.code === "BT109_LEAF_NODE_OPEN_CLOSE"),
    false,
  );
});

test("_while precondition attribute is not reported as unknown port", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _while="keep_running"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("all BT.CPP v4 precondition and postcondition attributes are not reported as unknown port", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _skipIf="cond" _failureIf="cond2" _successIf="cond3" _while="keep_running" _onSuccess="x:=1" _onFailure="x:=2" _onHalted="x:=3" _post="x:=4"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

// --- model/valid-child-count tests ---

test("valid-child-count: Control node with one child is valid", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("valid-child-count: Control node with no children is reported", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence></Sequence></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"));
});

test("valid-child-count: Decorator with two children is reported", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Inverter><AlwaysSuccess/><AlwaysFailure/></Inverter></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"));
});

test("valid-child-count: Decorator with one child is valid", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Inverter><AlwaysSuccess/></Inverter></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("valid-child-count: Action node with child is reported", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess><AlwaysFailure/></AlwaysSuccess></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"));
});

test("valid-child-count: IfThenElse with 2 children is valid", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><IfThenElse><AlwaysSuccess/><AlwaysSuccess/></IfThenElse></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("valid-child-count: IfThenElse with 3 children is valid", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><IfThenElse><AlwaysSuccess/><AlwaysSuccess/><AlwaysFailure/></IfThenElse></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("valid-child-count: IfThenElse with 1 child is reported", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><IfThenElse><AlwaysSuccess/></IfThenElse></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"));
});

test("valid-child-count: unknown node does not trigger child count diagnostic", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode><AlwaysSuccess/></UnknownNode></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("valid-child-count: TreeNodesModel node definitions are not checked", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="MyAction"><input_port name="goal"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("valid-child-count: severity is error in strict config", () => {
  const strictConfig = {
    ...defaultEffectiveConfig,
    linter: {
      ...defaultEffectiveConfig.linter,
      rules: { "model/valid-child-count": "error" as const },
    },
  };
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence></Sequence></BehaviorTree></root>`,
    { config: strictConfig },
  );
  const diag = result.diagnostics.find((d) => d.code === "BT110_INVALID_CHILD_COUNT");
  assert.ok(diag);
  assert.equal(diag.severity, "error");
});

test("valid-port-value accepts BT::NodeStatus literals", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Precondition if="x" else="IDLE"><AlwaysSuccess/></Precondition></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    result.diagnostics.some((d) => d.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("valid-port-value reports invalid BT::NodeStatus literal", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Precondition if="x" else="DONE"><AlwaysSuccess/></Precondition></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(
    result.diagnostics.some(
      (d) => d.code === "BT103_INVALID_PORT_VALUE_TYPE" && d.message.includes("else"),
    ),
  );
});

test("valid-port-value reports BT112 for custom literal without validator", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><MoveTo target="1.0;2.0;3.14"/></BehaviorTree><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((d) => d.code === "BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR"));
});

test("valid-port-default-value reports BT114 for invalid defaults", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="count" type="int" default="abc"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((d) => d.code === "BT114_INVALID_PORT_DEFAULT_VALUE"));
});

test("valid-port-default-value accepts output remap defaults", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><output_port name="result" type="std::string" default="{result}"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((d) => d.code === "BT114_INVALID_PORT_DEFAULT_VALUE"),
    false,
  );
});
