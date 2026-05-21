import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("unknown-port reports strict SubTree remap attributes", () => {
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
    result.diagnostics.some(
      (diag) => diag.code === "BT102_UNKNOWN_PORT" && diag.message === "unknown port `target`",
    ),
  );
});
