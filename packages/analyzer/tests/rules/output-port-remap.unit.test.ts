import assert from "node:assert/strict";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("output-port-remap accepts exact blackboard remaps", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Producer result="{out}"/></BehaviorTree><TreeNodesModel><Action ID="Producer"><output_port name="result" type="std::string"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP"),
    false,
  );
});

test("output-port-remap reports missing output bindings", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Foo/></BehaviorTree><TreeNodesModel><Action ID="Foo"><output_port name="result" type="int"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  const diagnostic = result.diagnostics.find(
    (diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP",
  );
  assert.ok(diagnostic);
  assert.equal(diagnostic.severity, "error");
  assert.match(diagnostic.message, /result/);
});

test("output-port-remap reports literal output bindings", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Producer result="out"/></BehaviorTree><TreeNodesModel><Action ID="Producer"><output_port name="result" type="std::string"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  const diagnostic = result.diagnostics.find(
    (diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP",
  );
  assert.ok(diagnostic);
  assert.equal(diagnostic.message, "output port `result` must be remapped to a blackboard entry");
});

test("output-port-remap accepts arbitrary blackboard key remaps", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Foo result="{some_key}"/></BehaviorTree><TreeNodesModel><Action ID="Foo"><output_port name="result" type="int"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP"),
    false,
  );
});

test("output-port-remap treats output default remap as satisfying missing usage attribute", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Foo/></BehaviorTree><TreeNodesModel><Action ID="Foo"><output_port name="result" type="int" default="{result}"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP"),
    false,
  );
});

test("invalid output default remains BT114", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Foo result="{result}"/></BehaviorTree><TreeNodesModel><Action ID="Foo"><output_port name="result" type="int" default="123"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT114_INVALID_PORT_DEFAULT_VALUE"),
    true,
  );
});

test("output-port-remap accepts whitespace-padded remap syntax", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Producer result=" {out} "/></BehaviorTree><TreeNodesModel><Action ID="Producer"><output_port name="result" type="Any"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP"),
    false,
  );
});

test("output-port-remap accepts whitespace-padded blackboard key syntax", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Producer result=" {=} "/></BehaviorTree><TreeNodesModel><Action ID="Producer"><output_port name="result" type="Any"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP"),
    false,
  );
});

test("output-port-remap accepts global blackboard remaps", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Producer result="{@shared}"/></BehaviorTree><TreeNodesModel><Action ID="Producer"><output_port name="result" type="Any"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT115_OUTPUT_PORT_REQUIRES_REMAP"),
    false,
  );
});
