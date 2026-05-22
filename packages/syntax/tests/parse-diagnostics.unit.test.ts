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

test("parse does not warn about missing declaration for bt xml", () => {
  const result = parseBtXml(`<root BTCPP_format="4"><BehaviorTree ID="main"/></root>`);
  assert.equal(
    result.diagnostics.some((d) => d.code === "XML008_MISSING_DECLARATION"),
    false,
  );
});

test("parse still warns about missing declaration for generic xml", () => {
  const result = parseBtXml("<root><item/></root>");
  assert.equal(
    result.diagnostics.some((d) => d.code === "XML008_MISSING_DECLARATION"),
    true,
  );
});
