import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import {
  getDefaultResolvedBtxmlConfig,
  getEffectiveConfigForFile,
  normalizeBtxmlConfig,
} from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("script/valid-syntax reports parser errors on script-bearing attributes", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _successIf="A +"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT401_INVALID_SCRIPT_SYNTAX"));
});

test("script/valid-syntax reports empty scripts", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _successIf=""/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT402_EMPTY_SCRIPT"));
});

test("script/valid-syntax reports invalid tokens", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="0x"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT403_INVALID_SCRIPT_TOKEN"));
});

test("script/valid-result-type allows obvious bool-compatible literals", () => {
  const cases = [
    `<AlwaysSuccess _successIf="true"/>`,
    `<AlwaysSuccess _successIf="1"/>`,
    `<ScriptCondition code="false"/>`,
    `<Precondition if="0" else="FAILURE"><AlwaysSuccess/></Precondition>`,
  ];

  for (const node of cases) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main">${node}</BehaviorTree></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT408_SCRIPT_RESULT_NOT_BOOL_COMPATIBLE"),
      false,
      node,
    );
  }
});

test("script/valid-result-type rejects obvious string literal results for condition scripts", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _successIf="'hello'"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some((diag) => diag.code === "BT408_SCRIPT_RESULT_NOT_BOOL_COMPATIBLE"),
  );
});

test("script/valid-result-type uses inferred custom result types", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="ReadPose"><output_port name="pose" type="Pose2D"/></Action><Action ID="UsePose"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel><BehaviorTree ID="main"><ReadPose pose="{target}"/><UsePose target="{target}" _successIf="target"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some((diag) => diag.code === "BT408_SCRIPT_RESULT_NOT_BOOL_COMPATIBLE"),
  );
});

test("script/valid-result-type ignores parse failures and postcondition scripts", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _onSuccess="'hello'" _successIf="A +"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.filter((diag) => diag.code === "BT408_SCRIPT_RESULT_NOT_BOOL_COMPATIBLE")
      .length,
    0,
  );
  assert.ok(result.diagnostics.some((diag) => diag.code === "BT401_INVALID_SCRIPT_SYNTAX"));
});

test("script/no-unknown-variable reports missing read references", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _successIf="missing == 1"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"));
});

test("script/no-unknown-variable uses remap environment and script enums", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="ReadPose"><output_port name="pose" type="Pose2D"/></Action><Action ID="CheckPose"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel><BehaviorTree ID="main"><ReadPose pose="{target}"/><CheckPose target="{target}" _successIf="READY == 1"/><Script code="count:=1; ok:=count"/></BehaviorTree></root>`,
    {
      config: defaultEffectiveConfig,
      augmentations: [{ version: 1, script: { enums: { READY: 1 } } }],
    },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
});

test("script/no-unknown-variable does not treat global blackboard reads as unknown locals", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _successIf="@value &gt; 0"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT401_INVALID_SCRIPT_SYNTAX"),
    false,
  );
});

test("script/no-unknown-variable supports global remap inference without local leakage", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><ReadInt value="{@count}"/><AlwaysSuccess _successIf="@count &gt; 0"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="ReadInt"><output_port name="value" type="int"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE"),
    false,
  );
});

test("script/valid-assignment supports BT.CPP-style global blackboard scripts", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="MainTree"><Sequence><PrintNumber val="{@value}"/><SubTree ID="MySub"/></Sequence></BehaviorTree><BehaviorTree ID="MySub"><Sequence><PrintNumber val="{@value}"/><Script code="@value_sqr := @value * @value"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="PrintNumber"><input_port name="val" type="int"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT405_ASSIGNMENT_TO_UNKNOWN_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT401_INVALID_SCRIPT_SYNTAX"),
    false,
  );
});

test("script/no-unknown-variable is flow-sensitive across behavior tree order", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><AlwaysSuccess _successIf="later == 1"/><Script code="later:=1"/><AlwaysSuccess _successIf="later == 1"/></Sequence></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  const unknowns = result.diagnostics.filter(
    (diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE",
  );
  assert.equal(unknowns.length, 1);
});

test("script/no-unknown-variable respects strict preset severity", () => {
  const strictConfig = getEffectiveConfigForFile(
    normalizeBtxmlConfig({ strict: true }).config,
    "test.xml",
  );
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess _successIf="missing == 1"/></BehaviorTree></root>`,
    { config: strictConfig },
  );

  assert.equal(
    result.diagnostics.find((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE")?.severity,
    "error",
  );
});

test("script/valid-assignment reports unknown assignments and type mismatches", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="count:=1; count='x'; missing=1"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT410_SCRIPT_VARIABLE_TYPE_MISMATCH"));
  assert.ok(
    result.diagnostics.some((diag) => diag.code === "BT405_ASSIGNMENT_TO_UNKNOWN_VARIABLE"),
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
});

test("script/valid-assignment does not create a local symbol for @x := 1", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="@x := 1; x == 1"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  const unknown = result.diagnostics.find((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE");
  assert.ok(unknown);
  assert.match(unknown.message, /`x`/);
});

test("script/valid-assignment allows @x := 1; @x == 1", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="@x := 1; @x == 1"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT405_ASSIGNMENT_TO_UNKNOWN_VARIABLE"),
    false,
  );
});

test("script analysis keeps local and global x distinct", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="x := 1; @x := 'str'; x + 2"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT410_SCRIPT_VARIABLE_TYPE_MISMATCH"),
    false,
  );
});

test("script global assignment drives later global type checking", () => {
  const ok = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="@x := 1; @x + 2"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    ok.diagnostics.some((diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE"),
    false,
  );

  const bad = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="@x := 'str'; @x + 2"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    bad.diagnostics.some((diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE"),
    true,
  );
});

test("script invalid global identifiers report without becoming unknown locals", () => {
  for (const source of ["@ := 1", "@@foo := 1", "@1foo := 1"]) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="${source}"/></BehaviorTree></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
      false,
      source,
    );
    assert.equal(
      result.diagnostics.some(
        (diag) =>
          diag.code === "BT401_INVALID_SCRIPT_SYNTAX" ||
          diag.code === "BT411_INVALID_GLOBAL_BLACKBOARD_IDENTIFIER",
      ),
      true,
      source,
    );
  }
});

test("script/valid-assignment reports invalid compound assignments", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="name:='x'; name -= 1"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT406_INVALID_COMPOUND_ASSIGNMENT"));
});

test("script/valid-expression-type reports invalid operands", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="ReadPose"><output_port name="pose" type="Pose2D"/></Action></TreeNodesModel><BehaviorTree ID="main"><ReadPose pose="{target}"/><AlwaysSuccess _successIf="target &amp;&amp; true"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE"));
});

test("script parsing uses XML-decoded attribute values", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Script code="A:=1"/><AlwaysSuccess _successIf="A &amp;&amp; true"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT401_INVALID_SCRIPT_SYNTAX"),
    false,
  );
  assert.equal(
    result.diagnostics.some(
      (diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE" && /amp/.test(diag.message),
    ),
    false,
  );
});

test("script environment seeds matching SubTree model ports", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><SubTree ID="Child"><input_port name="position" type="float"/><output_port name="done" type="bool"/></SubTree></TreeNodesModel><BehaviorTree ID="Main"><SubTree ID="Child" position="{robot_position}" done="{done}"/></BehaviorTree><BehaviorTree ID="Child"><Sequence><AlwaysSuccess _successIf="position &gt; 0"/><Script code="done:=true"/></Sequence></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT404_UNKNOWN_SCRIPT_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT405_ASSIGNMENT_TO_UNKNOWN_VARIABLE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT410_SCRIPT_VARIABLE_TYPE_MISMATCH"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE"),
    false,
  );
});

test("script diagnostics map decoded operator ranges back to raw XML offsets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="ReadPose"><output_port name="pose" type="Pose2D"/></Action></TreeNodesModel><BehaviorTree ID="main"><ReadPose pose="{target}"/><AlwaysSuccess _successIf="target &amp;&amp; true"/></BehaviorTree></root>`;
  const result = validateBtXml(text, { config: defaultEffectiveConfig });
  const diagnostic = result.diagnostics.find(
    (diag) => diag.code === "BT407_INVALID_SCRIPT_OPERAND_TYPE",
  );

  assert.ok(diagnostic?.range);
  assert.equal(
    text.slice(diagnostic.range?.start.offset, diagnostic.range?.end.offset),
    "target &amp;&amp; true",
  );
});
