import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatBtXml } from "@btxml/syntax";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFixture(...parts: string[]) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "syntax",
      "tests",
      "fixtures",
      "formatter",
      "config",
      ...parts,
    ),
    "utf8",
  );
}

test("indent width produces correct indentation", () => {
  const input = readFixture("indent-2.input.xml");
  const expected = readFixture("indent-2.expected.xml");
  const formatted = formatBtXml(input, { indentWidth: 2 });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text, expected);
  }
});

test("xmlDeclaration always adds declaration", () => {
  const input = '<root BTCPP_format="4"><BehaviorTree ID="main"><Sequence/></BehaviorTree></root>';
  const expected = readFixture("xml-declaration-always.expected.xml");
  const formatted = formatBtXml(input, { xmlDeclaration: "always" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text, expected);
  }
});

test("xmlDeclaration never removes declaration", () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence/></BehaviorTree></root>';
  const expected = readFixture("xml-declaration-never.expected.xml");
  const formatted = formatBtXml(input, { xmlDeclaration: "never" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text, expected);
  }
});

test("xmlDeclaration preserve keeps input state with declaration", () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence/></BehaviorTree></root>';
  const expected = readFixture("xml-declaration-preserve.expected.xml");
  const formatted = formatBtXml(input, { xmlDeclaration: "preserve" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text, expected);
  }
});

test("xmlDeclaration preserve keeps input state without declaration", () => {
  const input = '<root BTCPP_format="4"><BehaviorTree ID="main"><Sequence/></BehaviorTree></root>';
  const formatted = formatBtXml(input, { xmlDeclaration: "preserve" });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text.startsWith("<?xml"), false);
  }
});

test(String.raw`lineEnding lf uses \n`, () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence/></BehaviorTree></root>';
  const expected = readFixture("line-ending-lf.expected.xml");
  const formatted = formatBtXml(input, {
    xmlDeclaration: "always",
    lineEnding: "lf",
  });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text, expected);
  }
});

test(String.raw`lineEnding crlf uses \r\n`, () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence/></BehaviorTree></root>';
  const expected = readFixture("line-ending-crlf.expected.xml");
  const formatted = formatBtXml(input, {
    xmlDeclaration: "always",
    lineEnding: "crlf",
  });
  assert.equal(formatted.ok, true);
  if (formatted.ok && !formatted.skipped) {
    assert.equal(formatted.text, expected);
  }
});
