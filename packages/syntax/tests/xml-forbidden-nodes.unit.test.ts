import assert from "node:assert/strict";
import test from "node:test";
import { formatBtXml, parseBtXml } from "@btxml/syntax";

// T-XML-010: CDATA unsupported
test("T-XML-010: CDATA is unsupported", () => {
  const input = '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><![CDATA[x]]></root>';
  const parsed = parseBtXml(input);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.diagnostics.some((d) => d.code === "XML010_UNSUPPORTED_CDATA"));
  const formatted = formatBtXml(input);
  assert.equal(formatted.ok, false);
});

// T-XML-011: DOCTYPE unsupported
test("T-XML-011: DOCTYPE is unsupported", () => {
  const input = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE root><root BTCPP_format="4"/>';
  const parsed = parseBtXml(input);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.diagnostics.some((d) => d.code === "XML011_UNSUPPORTED_DOCTYPE"));
  const formatted = formatBtXml(input);
  assert.equal(formatted.ok, false);
});

// T-XML-012: Processing instruction unsupported
test("T-XML-012: Processing instruction is unsupported", () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="style.xsl"?><root BTCPP_format="4"/>';
  const parsed = parseBtXml(input);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.diagnostics.some((d) => d.code === "XML012_UNSUPPORTED_PROCESSING_INSTRUCTION"));
  const formatted = formatBtXml(input);
  assert.equal(formatted.ok, false);
});

// T-XML-016: Text outside root element
test("T-XML-016: Non-whitespace text outside root element is an error", () => {
  const before = 'before<root BTCPP_format="4"/>';
  const parsedBefore = parseBtXml(before);
  assert.equal(parsedBefore.ok, false);
  assert.ok(parsedBefore.diagnostics.some((d) => d.code === "XML016_TEXT_OUTSIDE_ROOT"));

  const after = '<root BTCPP_format="4"/>after';
  const parsedAfter = parseBtXml(after);
  assert.equal(parsedAfter.ok, false);
  assert.ok(parsedAfter.diagnostics.some((d) => d.code === "XML016_TEXT_OUTSIDE_ROOT"));

  const formatBefore = formatBtXml(before);
  assert.equal(formatBefore.ok, false);

  const formatAfter = formatBtXml(after);
  assert.equal(formatAfter.ok, false);
});
