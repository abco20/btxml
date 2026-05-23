import assert from "node:assert/strict";
import test from "node:test";
import type { TextEdit } from "@btxml/foundation";
import { applyFixPlan } from "../src/fix/apply.ts";
import type { FixPlan } from "../src/fix/types.ts";

function edit(start: number, end: number, newText: string): TextEdit {
  return {
    range: {
      start: { line: 0, character: 0, offset: start },
      end: { line: 0, character: 0, offset: end },
    },
    newText,
  };
}

function emptyPlan(): FixPlan {
  return {
    pass: 1,
    applied: [],
    skipped: [],
    editsByUri: new Map(),
    touchedUris: new Set(),
  };
}

test("applyFixPlan writes each uri only once", async () => {
  const plan = emptyPlan();
  plan.editsByUri.set("tree.xml", [edit(3, 6, "XYZ"), edit(0, 3, "abc")]);

  const writes: Array<{ uri: string; text: string }> = [];
  const result = await applyFixPlan({
    plan,
    readText: () => "123456",
    writeText: (uri, text) => writes.push({ uri, text }),
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.uri, "tree.xml");
  assert.equal(result.fixedTextByUri.get("tree.xml"), "abcXYZ");
});

test("applyFixPlan supports multi-file writes", async () => {
  const plan = emptyPlan();
  plan.editsByUri.set("a.xml", [edit(0, 1, "A")]);
  plan.editsByUri.set("b.xml", [edit(0, 1, "B")]);

  const writes: string[] = [];
  await applyFixPlan({
    plan,
    readText: () => "x",
    writeText: (uri) => writes.push(uri),
  });

  assert.deepEqual(
    [...writes].sort((a, b) => a.localeCompare(b)),
    ["a.xml", "b.xml"],
  );
});

test("applyFixPlan delegates persistence to writer callback", async () => {
  const plan = emptyPlan();
  plan.editsByUri.set("tree.xml", [edit(0, 1, "X")]);

  const writes: Array<{ uri: string; text: string }> = [];
  const result = await applyFixPlan({
    plan,
    readText: () => "a",
    writeText: (uri, text) => writes.push({ uri, text }),
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.uri, "tree.xml");
  assert.equal(writes[0]?.text, "X");
  assert.equal(result.fixedTextByUri.get("tree.xml"), "X");
});

test("applyFixPlan applies edits in descending offsets", async () => {
  const plan = emptyPlan();
  plan.editsByUri.set("tree.xml", [edit(1, 3, "BC"), edit(0, 1, "A")]);

  const result = await applyFixPlan({
    plan,
    readText: () => "abcd",
    writeText: () => {},
  });

  assert.equal(result.fixedTextByUri.get("tree.xml"), "ABCd");
});

test("applyFixPlan handles empty plan", async () => {
  const result = await applyFixPlan({
    plan: emptyPlan(),
    readText: () => "x",
    writeText: () => {
      throw new Error("must not be called");
    },
  });

  assert.equal(result.originalTextByUri.size, 0);
  assert.equal(result.fixedTextByUri.size, 0);
});
