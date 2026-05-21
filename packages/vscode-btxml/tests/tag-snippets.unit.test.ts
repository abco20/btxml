import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlockSnippet,
  getChildCapabilityFromBuiltinSets,
  isChildCapableTag,
  resetChildCapabilityFallbackResolver,
  resetChildCapabilityRequest,
  setChildCapabilityFallbackResolver,
  setChildCapabilityRequest,
} from "../src/child-capability.ts";
import {
  BTCPP_XML_DOCUMENT_SELECTOR,
  BTCPP_XML_LSP_DOCUMENT_SELECTOR,
} from "../src/document-selector.ts";
import { shouldHandleOnEnterIndent, shouldHandleSlashSnippet } from "../src/input-guards.ts";
import { getSnippetFallbackBuiltinSets } from "../src/tag-snippet-fallback.ts";
import { getTagSnippetTrigger } from "../src/tag-snippet-trigger.ts";

test("editor-only selector targets btcpp-xml documents", () => {
  assert.deepEqual(BTCPP_XML_DOCUMENT_SELECTOR, [
    { scheme: "file", language: "btcpp-xml" },
    { scheme: "untitled", language: "btcpp-xml" },
  ]);
});

test("LSP selector also subscribes plain xml documents", () => {
  assert.deepEqual(BTCPP_XML_LSP_DOCUMENT_SELECTOR, [
    { scheme: "file", language: "btcpp-xml" },
    { scheme: "untitled", language: "btcpp-xml" },
    { scheme: "file", language: "xml" },
    { scheme: "untitled", language: "xml" },
  ]);
});

test("getTagSnippetTrigger accepts typed greater-than and slash", () => {
  assert.equal(getTagSnippetTrigger({ text: ">", rangeLength: 0 }), "greater-than");
  assert.equal(getTagSnippetTrigger({ text: "/", rangeLength: 0 }), "slash");
});

test("getTagSnippetTrigger accepts completion commit name greater-than", () => {
  assert.equal(getTagSnippetTrigger({ text: "Sequence>", rangeLength: 3 }), "greater-than");
  assert.equal(getTagSnippetTrigger({ text: "RetryNode>", rangeLength: 3 }), "greater-than");
});

test("getTagSnippetTrigger rejects paste and unrelated edits", () => {
  assert.equal(getTagSnippetTrigger({ text: ">", rangeLength: 1 }), undefined);
  assert.equal(
    getTagSnippetTrigger({ text: "<Sequence>\n</Sequence>", rangeLength: 0 }),
    undefined,
  );
  assert.equal(getTagSnippetTrigger({ text: "foo>", rangeLength: 0 }), "greater-than");
  assert.equal(getTagSnippetTrigger({ text: "foo>\n", rangeLength: 0 }), undefined);
});

test("shouldHandleSlashSnippet only accepts single typed slash", () => {
  assert.equal(shouldHandleSlashSnippet({ text: "/", rangeLength: 0 }), true);
  assert.equal(shouldHandleSlashSnippet({ text: "/", rangeLength: 1 }), false);
  assert.equal(shouldHandleSlashSnippet({ text: "//", rangeLength: 0 }), false);
});

test("shouldHandleOnEnterIndent only accepts pure newline insertion", () => {
  assert.equal(shouldHandleOnEnterIndent("\n"), true);
  assert.equal(shouldHandleOnEnterIndent("\n  \t"), true);
  assert.equal(shouldHandleOnEnterIndent("x\n"), false);
  assert.equal(shouldHandleOnEnterIndent("\n  <Node/>"), false);
  assert.equal(shouldHandleOnEnterIndent("\n\n"), false);
});

test("Sequence inserts a block snippet when child-capable", async () => {
  const calls: Array<{
    uri: string;
    tagName: string;
    attributes?: Readonly<Record<string, string | undefined>>;
  }> = [];
  setChildCapabilityRequest(async (uri, tagName, attributes) => {
    calls.push({ uri, tagName, attributes });
    return { capable: true };
  });

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "Sequence", attributes: {} }),
      true,
    );
    assert.equal(buildBlockSnippet("Sequence"), "\n  $0\n</Sequence>");
    assert.deepEqual(calls, [{ uri: "file:///tree.xml", tagName: "Sequence", attributes: {} }]);
  } finally {
    resetChildCapabilityRequest();
  }
});

test("AlwaysSuccess does not insert a block snippet", async () => {
  setChildCapabilityRequest(async () => ({ capable: false }));

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "AlwaysSuccess", attributes: {} }),
      false,
    );
  } finally {
    resetChildCapabilityRequest();
  }
});

test("generic Action does not insert a block snippet", async () => {
  setChildCapabilityRequest(async () => ({ capable: false }));

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", {
        tagName: "Action",
        attributes: { ID: "Foo" },
      }),
      false,
    );
  } finally {
    resetChildCapabilityRequest();
  }
});

test("generic Control inserts a block snippet", async () => {
  const calls: Array<{
    tagName: string;
    attributes?: Readonly<Record<string, string | undefined>>;
  }> = [];
  setChildCapabilityRequest(async (_uri, tagName, attributes) => {
    calls.push({ tagName, attributes });
    return { capable: true };
  });

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", {
        tagName: "Control",
        attributes: { ID: "Foo" },
      }),
      true,
    );
    assert.deepEqual(calls, [{ tagName: "Control", attributes: { ID: "Foo" } }]);
  } finally {
    resetChildCapabilityRequest();
  }
});

test("builtin fallback respects configured builtin sets", async () => {
  setChildCapabilityRequest(async () => undefined);
  setChildCapabilityFallbackResolver(async (_uri, tagName) =>
    getChildCapabilityFromBuiltinSets(tagName, ["none"]),
  );

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "BehaviorTree", attributes: {} }),
      true,
    );
    assert.equal(
      await isChildCapableTag("file:///tree.xml", {
        tagName: "Control",
        attributes: { ID: "Foo" },
      }),
      true,
    );
    assert.equal(
      await isChildCapableTag("file:///tree.xml", {
        tagName: "Decorator",
        attributes: { ID: "Timeout" },
      }),
      true,
    );
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "Sequence", attributes: {} }),
      false,
    );
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "Fallback", attributes: {} }),
      false,
    );
  } finally {
    resetChildCapabilityFallbackResolver();
    resetChildCapabilityRequest();
  }
});

test("builtin fallback resolves concrete node capability from configured builtins", async () => {
  setChildCapabilityRequest(async () => undefined);
  setChildCapabilityFallbackResolver(async (_uri, tagName) =>
    getChildCapabilityFromBuiltinSets(tagName, ["btcpp-v4"]),
  );

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "Sequence", attributes: {} }),
      true,
    );
    assert.equal(
      await isChildCapableTag("file:///tree.xml", { tagName: "AlwaysSuccess", attributes: {} }),
      false,
    );
  } finally {
    resetChildCapabilityFallbackResolver();
    resetChildCapabilityRequest();
  }
});

test("snippet fallback uses default BT.CPP builtins when no effective config exists", () => {
  const builtinSets = getSnippetFallbackBuiltinSets(undefined);

  assert.equal(getChildCapabilityFromBuiltinSets("Sequence", builtinSets), true);
  assert.equal(getChildCapabilityFromBuiltinSets("Fallback", builtinSets), true);
  assert.equal(getChildCapabilityFromBuiltinSets("AlwaysSuccess", builtinSets), false);
});

test("startup fallback does not override an explicit LSP response", async () => {
  setChildCapabilityRequest(async () => ({ capable: false }));

  try {
    assert.equal(
      await isChildCapableTag("file:///tree.xml", {
        tagName: "Control",
        attributes: { ID: "Foo" },
      }),
      false,
    );
  } finally {
    resetChildCapabilityRequest();
  }
});
