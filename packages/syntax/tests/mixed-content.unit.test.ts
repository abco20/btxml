import assert from "node:assert/strict";
import test from "node:test";
import { formatBtXml, parseBtXml } from "@btxml/syntax";

// T-XML-015: Mixed content unsupported
test("T-XML-015: Mixed content is unsupported", () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main">before <Sequence/> after</BehaviorTree></root>';
  const parsed = parseBtXml(input);
  assert.equal(parsed.ok, true);
  const formatted = formatBtXml(input);
  assert.equal(formatted.ok, false);
  assert.ok(formatted.diagnostics.some((d) => d.code === "XML015_UNSUPPORTED_MIXED_CONTENT"));
});
