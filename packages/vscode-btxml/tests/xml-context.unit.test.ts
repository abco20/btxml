import assert from "node:assert/strict";
import test from "node:test";
import { findOpenStartTagContextBeforePosition } from "../src/xml-context.ts";

function createDocument(text: string) {
  const lines = text.split(/\r?\n/);

  return {
    uri: { toString: () => "file:///test.bt.xml" },
    fileName: "/test.bt.xml",
    isUntitled: false,
    languageId: "btcpp-xml",
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: 1,
    lineCount: lines.length,
    getText() {
      return text;
    },
    getWordRangeAtPosition() {
      return undefined;
    },
    validateRange(range: unknown) {
      return range;
    },
    validatePosition(position: unknown) {
      return position;
    },
    save() {
      return Promise.resolve(true);
    },
    offsetAt(position: { line: number; character: number }) {
      let offset = 0;
      for (let line = 0; line < position.line; line += 1) {
        offset += lines[line]?.length ?? 0;
        offset += 1;
      }
      return offset + position.character;
    },
    positionAt(offset: number) {
      let remaining = offset;
      for (let line = 0; line < lines.length; line += 1) {
        const lineLength = lines[line]?.length ?? 0;
        if (remaining <= lineLength) return { line, character: remaining };
        remaining -= lineLength + 1;
      }
      const lastLine = Math.max(lines.length - 1, 0);
      return { line: lastLine, character: lines[lastLine]?.length ?? 0 };
    },
    lineAt(line: number) {
      return { text: lines[line] ?? "" };
    },
  } as unknown as import("vscode").TextDocument;
}

test("findOpenStartTagContextBeforePosition aligns unfinished tag to first attribute column", () => {
  const text = '<BoolSub topic_name=""\n';
  const document = createDocument(text);
  const position = document.positionAt(text.length);
  const context = findOpenStartTagContextBeforePosition(document, position);

  assert.ok(context);
  assert.equal(context.isClosedBeforePosition, false);
  assert.equal(context.firstAttributeColumn, 9);
  assert.equal(context.baseIndent, "");
});

test("findOpenStartTagContextBeforePosition returns base indent after self-closing tag", () => {
  const text =
    '  <BoolSub topic_name=""\n           transient_local="true"\n           value="false"/>\n';
  const document = createDocument(text);
  const position = document.positionAt(text.length);
  const context = findOpenStartTagContextBeforePosition(document, position);

  assert.ok(context);
  assert.equal(context.isClosedBeforePosition, true);
  assert.equal(context.closingTokenBeforePosition, "/>");
  assert.equal(context.baseIndent, "  ");
});
