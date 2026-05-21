import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("unknown-node reports unresolved generic node usage", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Action ID="MissingNode"/></BehaviorTree></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some(
      (diag) => diag.code === "BT105_UNKNOWN_NODE" && diag.message === "unknown node `MissingNode`",
    ),
  );
});
