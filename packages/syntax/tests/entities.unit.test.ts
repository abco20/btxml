import assert from "node:assert/strict";
import test from "node:test";
import { formatBtXml, parseBtXml } from "@btxml/syntax";

// T-XML-013: Unknown entity unsupported
test("T-XML-013: Unknown entity is unsupported", () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SaySomething message="&custom;"/></BehaviorTree></root>';
  const parsed = parseBtXml(input);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.diagnostics.some((d) => d.code === "XML013_UNKNOWN_ENTITY"));
  const entityDiag = parsed.diagnostics.find((d) => d.code === "XML013_UNKNOWN_ENTITY");
  assert.ok(entityDiag?.range);
  const formatted = formatBtXml(input);
  assert.equal(formatted.ok, false);
});

// T-XML-014: Invalid numeric entity unsupported
test("T-XML-014: Invalid numeric entity is unsupported", () => {
  const cases = [
    '<SaySomething message="&#x110000;"/>',
    '<SaySomething message="&#999999999999999999999;"/>',
    '<SaySomething message="&#0;"/>',
  ];
  for (const xml of cases) {
    const input = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main">${xml}</BehaviorTree></root>`;
    let parsed: ReturnType<typeof parseBtXml>;
    try {
      parsed = parseBtXml(input);
    } catch {
      // must not throw
      assert.fail("parseBtXml threw on invalid numeric entity");
    }
    assert.equal(parsed.ok, false);
    assert.ok(parsed.diagnostics.some((d) => d.code === "XML014_INVALID_NUMERIC_ENTITY"));
    const formatted = formatBtXml(input);
    assert.equal(formatted.ok, false);
  }
});
