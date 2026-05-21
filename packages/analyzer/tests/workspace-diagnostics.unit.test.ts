import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { buildSemanticIndex } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";
import { getDocumentDiagnostics } from "../src/index.js";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("v0.2 workspace resolves subtree references across files", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    { uri: "main.xml" },
  );
  const child = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"><AlwaysSuccess/></BehaviorTree></root>`,
    { uri: "child.xml" },
  );
  assert.ok(main.document);
  assert.ok(child.document);
  const workspace = buildSemanticIndex([main.document, child.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const diagnostics = getDocumentDiagnostics(main.document, workspace, {
    config: defaultEffectiveConfig,
  });
  assert.equal(
    diagnostics.some((diag) => diag.code === "BT005_UNKNOWN_SUBTREE"),
    false,
  );
});

test("workspace duplicate detection ignores distinct BehaviorTree IDs across files", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"/></root>`,
    { uri: "main.xml" },
  );
  const child = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"/></root>`,
    { uri: "child.xml" },
  );
  assert.ok(main.document);
  assert.ok(child.document);
  const workspace = buildSemanticIndex([main.document, child.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const diagnostics = [
    ...getDocumentDiagnostics(main.document, workspace, {
      config: defaultEffectiveConfig,
    }),
    ...getDocumentDiagnostics(child.document, workspace, {
      config: defaultEffectiveConfig,
    }),
  ];
  assert.equal(
    diagnostics.some((diag) => diag.code === "BT013_DUPLICATE_BEHAVIOR_TREE_ID_IN_WORKSPACE"),
    false,
  );
});

test("SubTree resolves against TreeNodesModel SubTree definitions", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="SetTargetValue" value="bad"/></BehaviorTree><TreeNodesModel><SubTree ID="SetTargetValue"><input_port name="value" type="bool"/></SubTree></TreeNodesModel></root>`,
  );
  assert.ok(parsed.document);
  const workspace = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const diagnostics = getDocumentDiagnostics(parsed.document, workspace, {
    config: defaultEffectiveConfig,
  });
  assert.equal(
    diagnostics.some((diag) => diag.code === "BT005_UNKNOWN_SUBTREE"),
    false,
  );
  assert.equal(
    diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"),
    true,
  );
});

test("v0.2 validates required ports and bool literals", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SetFlag enabled="yes"/></BehaviorTree><TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool"/><input_port name="target_name" type="std::string"/></Action></TreeNodesModel></root>`,
    { uri: "ports.xml" },
  );
  assert.ok(parsed.document);
  const workspace = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const diagnostics = getDocumentDiagnostics(parsed.document, workspace, {
    config: defaultEffectiveConfig,
  });
  assert.ok(diagnostics.some((diag) => diag.code === "BT101_MISSING_REQUIRED_PORT"));
  assert.ok(diagnostics.some((diag) => diag.code === "BT103_INVALID_PORT_VALUE_TYPE"));
});

test("explicit syntax unknown node is detected as BT105_UNKNOWN_NODE", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Action ID="TypoAction"/></BehaviorTree></root>',
  );
  assert.ok(parsed.document);
  const workspace = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const diagnostics = getDocumentDiagnostics(parsed.document, workspace, {
    config: defaultEffectiveConfig,
  });
  assert.ok(diagnostics.some((diag) => diag.code === "BT105_UNKNOWN_NODE"));
});
