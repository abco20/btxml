import assert from "node:assert/strict";
import test from "node:test";
import {
  findIncompleteOpenStartTag,
  findJustClosedStartTag,
  findOpenStartTagAtSlash,
  scanXmlPrefix,
} from "@btxml/syntax";

test("scanXmlPrefix keeps comment context after slash or greater-than typing", () => {
  assert.equal(scanXmlPrefix("<!-- /", "<!-- /".length).context, "comment");
  assert.equal(scanXmlPrefix("<!-- >", "<!-- >".length).context, "comment");
});

test("scanXmlPrefix reports attribute-value context inside unfinished quoted value", () => {
  assert.equal(scanXmlPrefix('<Node path="/">', '<Node path="/'.length).context, "attribute-value");
  assert.equal(scanXmlPrefix('<Node path="', '<Node path="'.length).context, "attribute-value");
});

test("scanXmlPrefix does not false-trigger in CDATA, PI, or DOCTYPE contexts", () => {
  assert.equal(scanXmlPrefix("<![CDATA[/", "<![CDATA[/".length).context, "cdata");
  assert.equal(scanXmlPrefix("<?xml /", "<?xml /".length).context, "pi");
  assert.equal(scanXmlPrefix("<!DOCTYPE root /", "<!DOCTYPE root /".length).context, "doctype");
});

test("scanXmlPrefix skips complete DOCTYPE internal subsets and quoted greater-than", () => {
  const text = '<!DOCTYPE root [ <!ENTITY gt ">"> <!ELEMENT root ANY> ]><root>';
  const scan = scanXmlPrefix(text, text.length);

  assert.equal(scan.context, "text");
  assert.deepEqual(scan.stack, ["root"]);
});

test("scanXmlPrefix keeps DOCTYPE context for incomplete internal subsets while typing", () => {
  const text = '<!DOCTYPE root [ <!ENTITY gt ">"> <!ELEMENT root ANY>';
  assert.equal(scanXmlPrefix(text, text.length).context, "doctype");
});

test("scanXmlPrefix skips comments and PI content inside DOCTYPE internal subsets", () => {
  const text = '<!DOCTYPE root [ <!-- ]> --> <?meta value=">"?> <!ELEMENT root ANY> ]><root>';
  const scan = scanXmlPrefix(text, text.length);

  assert.equal(scan.context, "text");
  assert.deepEqual(scan.stack, ["root"]);
});

test("scanXmlPrefix keeps DOCTYPE context for unterminated comments inside internal subsets", () => {
  const text = "<!DOCTYPE root [ <!-- ]>";
  assert.equal(scanXmlPrefix(text, text.length).context, "doctype");
});

test("findOpenStartTagAtSlash resolves unfinished self-closing tag", () => {
  const text = "<Node/";
  const tag = findOpenStartTagAtSlash(text, text.length);
  assert.ok(tag);
  assert.equal(tag.tagName, "Node");
});

test("findOpenStartTagAtSlash rejects ambiguous unquoted attribute value", () => {
  const text = "<Node path=/";
  assert.equal(findOpenStartTagAtSlash(text, text.length), undefined);
});

test("findOpenStartTagAtSlash rejects comment, CDATA, and quote contexts", () => {
  assert.equal(findOpenStartTagAtSlash("<!-- /", "<!-- /".length), undefined);
  assert.equal(findOpenStartTagAtSlash("<![CDATA[/", "<![CDATA[/".length), undefined);
  assert.equal(findOpenStartTagAtSlash('<Node path="/"', '<Node path="/"'.length), undefined);
});

test("findIncompleteOpenStartTag discovers incomplete open tags while typing", () => {
  const text = '<BoolSub topic_name=""\n';
  const tag = findIncompleteOpenStartTag(text, text.length);

  assert.ok(tag);
  assert.equal(tag.tagName, "BoolSub");
  assert.equal(tag.firstAttributeOffset, 9);
});

test("findIncompleteOpenStartTag ignores incomplete tags inside quoted values", () => {
  assert.equal(findIncompleteOpenStartTag('<Node path="abc', '<Node path="abc'.length), undefined);
});

test("findIncompleteOpenStartTag skips past complete DOCTYPE subsets", () => {
  const text = '<!DOCTYPE root [ <!ENTITY gt ">"> ]>\n<Node attr';
  const tag = findIncompleteOpenStartTag(text, text.length);

  assert.ok(tag);
  assert.equal(tag.tagName, "Node");
});

test("findIncompleteOpenStartTag skips DOCTYPE subsets with comments before the real close", () => {
  const text = "<!DOCTYPE root [ <!-- ]> --> <!ELEMENT root ANY> ]>\n<Node attr";
  const tag = findIncompleteOpenStartTag(text, text.length);

  assert.ok(tag);
  assert.equal(tag.tagName, "Node");
});

test("findJustClosedStartTag rejects greater-than typed inside quotes", () => {
  const text = '<Sequence name="a>"></Sequence>';
  const offset = text.indexOf(">");
  assert.equal(findJustClosedStartTag(text, offset + 1), undefined);
});

test("findJustClosedStartTag keeps self-closing token information", () => {
  const text = "<Sequence/>";
  const tag = findJustClosedStartTag(text, text.length);
  assert.ok(tag);
  assert.equal(tag.closingToken, "/>");
});

test("findJustClosedStartTag exposes parsed attributes for just-closed start tags", () => {
  const text = '<Action ID="Say" output="hello world">';
  const tag = findJustClosedStartTag(text, text.length);

  assert.ok(tag);
  assert.deepEqual(tag.attributes, {
    ID: "Say",
    output: "hello world",
  });
  assert.equal(tag.firstAttributeOffset, 8);
});
