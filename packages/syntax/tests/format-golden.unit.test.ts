import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatBtXml } from "@btxml/syntax";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFixture(...parts: string[]) {
  return fs.readFileSync(path.join(__dirname, "fixtures", ...parts), "utf8");
}

test("formatter golden fixtures stay stable", () => {
  const fixtures: Array<[string[], string[]]> = [
    [
      ["formatter", "groot", "already-formatted.xml"],
      ["formatter", "groot", "already-formatted.xml"],
    ],
    [
      ["formatter", "redhat", "input.xml"],
      ["formatter", "redhat", "expected.xml"],
    ],
    [
      ["formatter", "xmllint", "input.xml"],
      ["formatter", "xmllint", "expected.xml"],
    ],
    [
      ["formatter", "comments", "input.xml"],
      ["formatter", "comments", "expected.xml"],
    ],
    [
      ["formatter", "tree-nodes-model", "input.xml"],
      ["formatter", "tree-nodes-model", "expected.xml"],
    ],
  ];
  for (const [inputPath, expectedPath] of fixtures) {
    const input = readFixture(...inputPath);
    const expected = readFixture(...expectedPath);
    const first = formatBtXml(input);
    assert.equal(first.ok, true, `Formatting failed for ${inputPath.join("/")}`);
    if (first.ok && !first.skipped) {
      assert.equal(first.text, expected, `Mismatch for ${inputPath.join("/")}`);
    }
    const second = formatBtXml(expected);
    assert.equal(second.ok, true, `Idempotency check failed for ${expectedPath.join("/")}`);
    if (second.ok && !second.skipped) {
      assert.equal(second.text, expected, `Idempotency mismatch for ${expectedPath.join("/")}`);
    }
  }
});
