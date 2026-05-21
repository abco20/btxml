import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { listRuleSlugs } from "@btxml/analyzer/rules";

const docsPath = path.join(process.cwd(), "docs", "rules.md");
const docs = fs.readFileSync(docsPath, "utf8");

test("generated docs do not contain old 'lint' config key", () => {
  assert.doesNotMatch(docs, /"lint"\s*:/);
});

test("generated docs do not contain diagnostic codes inside config JSON", () => {
  const jsonBlocks = docs.match(/```json\n([\s\S]*?)```/g) || [];
  for (const block of jsonBlocks) {
    assert.doesNotMatch(block, /BT\d+_[A-Z_]+/);
  }
});

test("generated docs contain rule slug headings", () => {
  for (const slug of listRuleSlugs()) {
    assert.match(docs, new RegExp(`## ${slug.replace(/\//g, "\\/")}`));
  }
});
