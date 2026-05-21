import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentDiagnostics, validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { buildSemanticIndex } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("port-default-value reports invalid primitive default", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="count" type="int" default="abc"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE"));
});

test("port-default-value validates default_value alias", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="enabled" type="bool" default_value="maybe"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE"));
});

test("port-default-value reports BT112 for custom default without validator", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="target" type="Pose2D" default="1.0;2.0;3.14"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some((diag) => diag.code === "BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR"),
  );
});

test("port-default-value accepts validator-backed custom default", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="target" type="Pose2D" default="1.0;2.0;3.14"/></Action></TreeNodesModel></root>`,
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
        diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE",
    ),
    false,
  );
});

test("port-default-value allows remaps for input and inout defaults", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="target" type="Pose2D" default="{target}"/><inout_port name="state" type="Pose2D" default="{state}"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE"),
    false,
  );
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR"),
    false,
  );
});

test("port-default-value accepts output remap defaults", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><output_port name="result" type="std::string" default="{result}"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE"),
    false,
  );
});

test("port-default-value accepts output self remap defaults", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><output_port name="result" type="float" default="{=}"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE"),
    false,
  );
});

test("port-default-value reports literal output defaults", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><output_port name="result" type="float" default="0.0"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  const diagnostic = result.diagnostics.find(
    (diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE",
  );
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /must be a blackboard remap/);
});
