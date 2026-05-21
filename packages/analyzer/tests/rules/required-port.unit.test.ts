import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("required-port reports missing SubTree model port", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child"/></BehaviorTree><BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><SubTree ID="Child"><input_port name="target" type="std::string"/></SubTree></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.ok(
    result.diagnostics.some(
      (diag) => diag.code === "BT101_MISSING_REQUIRED_PORT" && diag.message.includes("target"),
    ),
  );
});
