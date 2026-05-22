import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDocumentDiagnostics } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { buildSemanticIndex } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("port-value reports invalid generic SubTree builtin port type", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="not-a-bool"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some(
      (diag) =>
        diag.code === "BT103_INVALID_PORT_VALUE_TYPE" && diag.message.includes("_autoremap"),
    ),
  );
});

test("port-value skips literal validation for remaps", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="{flag}"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("port-value skips literal validation for whitespace-padded remaps", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="  {flag}  "/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("port-value still skips validation for whitespace-padded blackboard key syntax", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Producer out=" {=} "/></BehaviorTree><TreeNodesModel><Action ID="Producer"><output_port name="out" type="std::string"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("port-value skips literal validation for global remaps", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" _autoremap="{@flag}"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("port-value reports BT112 for custom literal without validator", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><MoveTo target="1.0;2.0;3.14"/></BehaviorTree><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some((diag) => diag.code === "BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR"),
  );
});

test("port-value accepts custom literal with type-level tuple validator", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><MoveTo target="1.0;2.0;3.14"/></BehaviorTree><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { uri: "test.xml" },
  );
  assert.ok(parsed.document);

  const semantic = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        types: {
          Pose2D: {
            kind: "opaque",
            validate: {
              kind: "tuple",
              separator: ";",
              items: ["double", "double", "double"],
            },
          },
        },
      },
    ],
  }).index;

  const result = getDocumentDiagnostics(parsed.document, semantic, {
    config: defaultEffectiveConfig,
  });

  assert.equal(
    result.some(
      (diag) =>
        diag.code === "BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR" ||
        diag.code === "BT103_INVALID_PORT_VALUE_TYPE",
    ),
    false,
  );
});

test("port-value validates primitive vector literals", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move values="1;bad;3"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="values" type="std::vector&lt;int&gt;"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"));
});

test("port-value accepts documented bool literal variants", () => {
  const acceptedValues = ["0", "1", "true", "TRUE", "True", "false", "FALSE", "False"];

  for (const value of acceptedValues) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set enabled="${value}"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="enabled" type="bool"/></Action></TreeNodesModel></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
      false,
      `expected bool literal ${value} to be accepted`,
    );
  }
});

test("port-value validates signed integer ranges", () => {
  const acceptedValues = [
    ["int8_t", "127"],
    ["int16_t", "-32768"],
    ["int", "2147483647"],
    ["int32", "-2147483648"],
    ["std::int32_t", "42"],
    ["short", "32767"],
    ["long", "9223372036854775807"],
    ["int64_t", "-9223372036854775808"],
  ] as const;

  for (const [type, value] of acceptedValues) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set value="${value}"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="value" type="${type}"/></Action></TreeNodesModel></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
      false,
      `expected ${type} literal ${value} to be accepted`,
    );
  }

  const rejectedValues = [
    ["int8_t", "128"],
    ["int16_t", "-32769"],
    ["int", "2147483648"],
    ["short", "32768"],
    ["long", "9223372036854775808"],
    ["int64_t", "-9223372036854775809"],
  ] as const;

  for (const [type, value] of rejectedValues) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set value="${value}"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="value" type="${type}"/></Action></TreeNodesModel></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
      true,
      `expected ${type} literal ${value} to be rejected`,
    );
  }
});

test("port-value validates unsigned integer ranges and vectors", () => {
  const acceptedValues = [
    ["uint8_t", "255"],
    ["uint16_t", "65535"],
    ["uint", "4294967295"],
    ["unsigned", "7"],
    ["unsigned int", "9"],
    ["std::uint32_t", "0"],
    ["uint64_t", "18446744073709551615"],
  ] as const;

  for (const [type, value] of acceptedValues) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set value="${value}"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="value" type="${type}"/></Action></TreeNodesModel></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
      false,
      `expected ${type} literal ${value} to be accepted`,
    );
  }

  const rejectedValues = [
    ["uint8_t", "256"],
    ["uint16_t", "65536"],
    ["uint", "4294967296"],
    ["unsigned", "-1"],
    ["uint64_t", "18446744073709551616"],
  ] as const;

  for (const [type, value] of rejectedValues) {
    const result = validateBtXml(
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set value="${value}"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="value" type="${type}"/></Action></TreeNodesModel></root>`,
      { config: defaultEffectiveConfig },
    );

    assert.equal(
      result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
      true,
      `expected ${type} literal ${value} to be rejected`,
    );
  }

  const vectorResult = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set values="255;0;256"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="values" type="std::vector&lt;uint8_t&gt;"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(vectorResult.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"));
});

test("port-value validates json vectors using JSON item types", () => {
  const validStringVector = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set values="json:[&quot;a&quot;,&quot;b&quot;]"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="values" type="std::vector&lt;std::string&gt;"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    validStringVector.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );

  const invalidStringVector = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set values="json:[{}]"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="values" type="std::vector&lt;std::string&gt;"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(
    invalidStringVector.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
  );

  const invalidDoubleVector = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set values="json:[&quot;1.0&quot;]"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="values" type="std::vector&lt;double&gt;"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.ok(
    invalidDoubleVector.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
  );

  const validBoolVector = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Set values="json:[true,false]"/></BehaviorTree><TreeNodesModel><Action ID="Set"><input_port name="values" type="std::vector&lt;bool&gt;"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );
  assert.equal(
    validBoolVector.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("port-value requires full-string matches for pattern validators", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move target="prefix 12;34 suffix"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { uri: "test.xml" },
  );
  assert.ok(parsed.document);

  const semantic = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        augment: {
          Move: {
            ports: {
              target: {
                validate: {
                  kind: "pattern",
                  pattern: "[0-9]+;[0-9]+",
                },
              },
            },
          },
        },
      },
    ],
  }).index;

  const result = getDocumentDiagnostics(parsed.document, semantic, {
    config: defaultEffectiveConfig,
  });

  assert.ok(result.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"));
});

test("port-value resolves custom tuple item validators through the registry", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move target="1.0;2.0;3.0"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { uri: "test.xml" },
  );
  assert.ok(parsed.document);

  const semantic = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        types: {
          Meters: {
            kind: "opaque",
            validate: {
              kind: "pattern",
              pattern: "-?[0-9]+(?:\\.[0-9]+)?",
            },
          },
          Pose2D: {
            kind: "opaque",
            validate: {
              kind: "tuple",
              separator: ";",
              items: ["Meters", "Meters", "double"],
            },
          },
        },
      },
    ],
  }).index;

  const result = getDocumentDiagnostics(parsed.document, semantic, {
    config: defaultEffectiveConfig,
  });

  assert.equal(
    result.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    false,
  );
});

test("port-value validates enum values before primitive checks", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SetMode mode="3"/></BehaviorTree><TreeNodesModel><Action ID="SetMode"><input_port name="mode" type="int" enum="1;2"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"));
});
