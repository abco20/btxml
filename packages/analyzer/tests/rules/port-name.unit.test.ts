import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("valid-port-name reports reserved port names", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="ID"/><input_port name="_autoremap"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  const diagnostics = result.diagnostics.filter((diag) => diag.code === "BT116_INVALID_PORT_NAME");
  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics.every((diag) => diag.message.includes("reserved attribute name")));
});

test("valid-port-name reports invalid characters and leading digits", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="request.name"/><input_port name="1target"/><input_port name="bad name"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  const diagnostics = result.diagnostics.filter((diag) => diag.code === "BT116_INVALID_PORT_NAME");
  assert.equal(diagnostics.length, 3);
  assert.ok(diagnostics.some((diag) => diag.message.includes("must not contain `.`")));
  assert.ok(diagnostics.some((diag) => diag.message.includes("must not start with a digit")));
  assert.ok(diagnostics.some((diag) => diag.message.includes("must not contain whitespace")));
});

test("valid-port-name allows ordinary names", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="target"/><output_port name="result_value"/><inout_port name="retryCount"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT116_INVALID_PORT_NAME"),
    false,
  );
});
