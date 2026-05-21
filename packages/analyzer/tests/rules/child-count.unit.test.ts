import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("child-count reports decorator with too many children", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Inverter><AlwaysSuccess/><AlwaysFailure/></Inverter></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(result.diagnostics.some((diag) => diag.code === "BT110_INVALID_CHILD_COUNT"));
});
