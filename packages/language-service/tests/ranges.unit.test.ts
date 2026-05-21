import assert from "node:assert/strict";
import test from "node:test";
import { createTextDocument } from "@btxml/foundation";
import { inspectDocument } from "../src/ranges.ts";

function createDoc(text: string) {
  return createTextDocument("file:///test.xml", text);
}

function inspectAtCursor(textWithCursor: string) {
  const offset = textWithCursor.indexOf("|");
  assert.notEqual(offset, -1, "fixture must include cursor marker");
  const text = `${textWithCursor.slice(0, offset)}${textWithCursor.slice(offset + 1)}`;
  const document = createDoc(text);
  return inspectDocument(document, undefined, document.positionAt(offset));
}

test("ranges detects closing tag context", () => {
  const result = inspectAtCursor("<Sequence>\n  </|");
  assert.equal(result.nodeKind, "closing-tag-name");
  assert.equal(result.tagNamePrefix, "");
});

test("ranges detects partial closing tag context", () => {
  const result = inspectAtCursor("<Sequence>\n  </Se|");
  assert.equal(result.nodeKind, "closing-tag-name");
  assert.equal(result.tagNamePrefix, "Se");
});

test("ranges excludes closing tag context inside attribute values", () => {
  const result = inspectAtCursor(`<Action path="/|`);
  assert.notEqual(result.nodeKind, "closing-tag-name");
});
