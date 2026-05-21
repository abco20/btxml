import assert from "node:assert/strict";
import test from "node:test";
import { formatBtXml } from "@btxml/syntax";

// T-FORMAT-CONFIG-001: xmlDeclaration true
test("T-FORMAT-CONFIG-001 xmlDeclaration true emits declaration", () => {
  const input = `<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`;
  const formatted = formatBtXml(input, { xmlDeclaration: "always" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.match(formatted.text, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  }
});

// T-FORMAT-CONFIG-002: xmlDeclaration false
test("T-FORMAT-CONFIG-002 xmlDeclaration false omits declaration", () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`;
  const formatted = formatBtXml(input, { xmlDeclaration: "never" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.doesNotMatch(formatted.text, /<\?xml/);
  }
});

// T-FORMAT-CONFIG-003: xmlDeclaration preserve with declaration
test("T-FORMAT-CONFIG-003 xmlDeclaration preserve keeps existing declaration", () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`;
  const formatted = formatBtXml(input, { xmlDeclaration: "preserve" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.match(formatted.text, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  }
});

// T-FORMAT-CONFIG-004: xmlDeclaration preserve without declaration
test("T-FORMAT-CONFIG-004 xmlDeclaration preserve omits when input has none", () => {
  const input = `<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`;
  const formatted = formatBtXml(input, { xmlDeclaration: "preserve" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.doesNotMatch(formatted.text, /<\?xml/);
  }
});

// T-XML-015 exception: text in input_port and output_port is allowed
test("T-XML-015 text in input_port is preserved", () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main">
    <SetFlag enabled="true"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="SetFlag">
      <input_port name="enabled" type="bool">Enabled flag</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const formatted = formatBtXml(input);
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.match(formatted.text, /Enabled flag<\/input_port>/);
  }
});
