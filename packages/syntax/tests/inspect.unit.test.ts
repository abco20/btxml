import assert from "node:assert/strict";
import test from "node:test";
import { createTextDocument } from "@btxml/foundation";
import { inspectXmlCursor, parseBtXml } from "@btxml/syntax";

function createDoc(text: string) {
  return createTextDocument("file:///test.xml", text);
}

function inspectAtCursor(textWithCursor: string, useParsed = false) {
  const offset = textWithCursor.indexOf("|");
  assert.notEqual(offset, -1, "fixture must include cursor marker");
  const text = `${textWithCursor.slice(0, offset)}${textWithCursor.slice(offset + 1)}`;
  const document = createDoc(text);
  const parsed = useParsed ? parseBtXml(text).document : undefined;

  return inspectXmlCursor({
    document,
    parsed,
    position: document.positionAt(offset),
  });
}

test("inspectXmlCursor detects closing tag context", () => {
  const result = inspectAtCursor("<Sequence>\n  </|");
  assert.equal(result.kind, "closing-tag-name");
  assert.equal(result.tagNamePrefix, "");
});

test("inspectXmlCursor detects partial closing tag context", () => {
  const result = inspectAtCursor("<Sequence>\n  </Se|");
  assert.equal(result.kind, "closing-tag-name");
  assert.equal(result.tagNamePrefix, "Se");
});

test("inspectXmlCursor excludes closing tag context inside attribute values", () => {
  const result = inspectAtCursor(`<Action path="/|`);
  assert.notEqual(result.kind, "closing-tag-name");
});

test("inspectXmlCursor reports parsed attribute value context", () => {
  const result = inspectAtCursor(`<Action ID="Say" message="hel|lo"/>`, true);
  assert.equal(result.kind, "attribute-value");
  assert.equal(result.element.name, "Action");
  assert.equal(result.attribute.name, "message");
  assert.equal(result.valuePrefix, "hel");
});

test("inspectXmlCursor reports parsed tag name context", () => {
  const result = inspectAtCursor(`<Act|ion ID="Say"/>`, true);
  assert.equal(result.kind, "tag-name");
  assert.equal(result.element?.name, "Action");
  assert.ok(result.replacementRange);
});

test("inspectXmlCursor prefers unfinished open-tag context over enclosing parsed element", () => {
  const result = inspectAtCursor(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <|
  </BehaviorTree>
</root>`,
    true,
  );
  assert.equal(result.kind, "tag-name");
});
