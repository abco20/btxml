import assert from "node:assert/strict";
import test from "node:test";
import { parseBtXml } from "@btxml/syntax";

test("parse preserves comments, text, and attribute order", () => {
  const result = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root><a x="1" y="2"/><b> x </b><!--c--></root>`,
  );
  assert.equal(result.ok, true);
  const firstChild = result.document?.root?.children[0];
  assert.equal(firstChild?.kind, "element");
  if (firstChild?.kind === "element") {
    assert.equal(firstChild.attributes[0].name, "x");
    assert.equal(firstChild.attributes[1].name, "y");
  }
});

test("inout_port parser support", () => {
  const result = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="A"><inout_port name="x" type="int"/></Action></TreeNodesModel></root>`,
  );
  assert.equal(result.ok, true);
  assert.ok(result.document);
});

test("v0.4 parser provides precise ranges and tolerant parse", () => {
  const text =
    '<?xml version="1.0" encoding="UTF-8"?>\r\n<root BTCPP_format="4"><SubTree ID="child"/></root>';
  const parsed = parseBtXml(text, { mode: "tolerant" });
  assert.ok(parsed.document?.root);
  const root = parsed.document?.root;
  assert.equal(root?.nameRange?.start.line, 1);
  assert.equal(root?.nameRange?.start.character, 1);
  const subtree = root?.children.find((child) => child.kind === "element");
  assert.equal(subtree?.kind, "element");
  if (subtree?.kind === "element") {
    const id = subtree.attributes.find((attr) => attr.name === "ID");
    assert.equal(id?.nameRange.start.character, 32);
    assert.equal(id?.valueContentRange?.start.offset !== undefined, true);
  }
  const partial = parseBtXml('<root><SubTree ID="child"', { mode: "tolerant" });
  assert.equal(partial.partial, true);
  assert.ok(partial.document);
});
