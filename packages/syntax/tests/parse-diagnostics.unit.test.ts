import assert from "node:assert/strict";
import test from "node:test";
import { parseBtXml } from "@btxml/syntax";

test("parse reports duplicate attribute", () => {
  const result = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?><root a="1" a="2"/>`);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === "XML004_DUPLICATE_ATTRIBUTE"));
});

test("parse reports invalid xml", () => {
  const result = parseBtXml(`<root><BehaviorTree ID="x"></root>`);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === "XML006_MISSING_CLOSING_TAG"));
});
