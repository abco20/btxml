import assert from "node:assert/strict";
import test from "node:test";
import type { TextEdit } from "@btxml/foundation";
import { planFixes } from "../src/fix/plan.ts";
import type { FixCandidate } from "../src/fix/types.ts";

function edit(start: number, end: number, newText = ""): TextEdit {
  return {
    range: {
      start: { line: 0, character: 0, offset: start },
      end: { line: 0, character: 0, offset: end },
    },
    newText,
  };
}

function candidate(input: {
  id: string;
  uri?: string;
  safety?: "safe" | "unsafe";
  severity?: "error" | "warning" | "info";
  edits: TextEdit[];
}): FixCandidate {
  return {
    id: input.id,
    uri: input.uri ?? "tree.xml",
    diagnosticCode: `CODE_${input.id}`,
    diagnosticRule: "rule/test",
    diagnosticSeverity: input.severity ?? "error",
    diagnosticMessage: input.id,
    safety: input.safety ?? "safe",
    title: input.id,
    edits: input.edits,
    source: {
      kind: "diagnostic",
      diagnosticFingerprint: input.id,
    },
  };
}

test("planFixes skips unsafe candidates by default", () => {
  const plan = planFixes({
    pass: 1,
    candidates: [candidate({ id: "unsafe", safety: "unsafe", edits: [edit(0, 1)] })],
    textByUri: new Map([["tree.xml", "abc"]]),
    unsafe: false,
  });

  assert.equal(plan.applied.length, 0);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.reason, "unsafe-not-enabled");
});

test("planFixes applies unsafe candidates when enabled", () => {
  const plan = planFixes({
    pass: 1,
    candidates: [candidate({ id: "unsafe", safety: "unsafe", edits: [edit(0, 1)] })],
    textByUri: new Map([["tree.xml", "abc"]]),
    unsafe: true,
  });

  assert.equal(plan.applied.length, 1);
  assert.equal(plan.skipped.length, 0);
});

test("planFixes marks invalid range", () => {
  const plan = planFixes({
    pass: 1,
    candidates: [candidate({ id: "bad", edits: [edit(-1, 1)] })],
    textByUri: new Map([["tree.xml", "abc"]]),
    unsafe: false,
  });

  assert.equal(plan.applied.length, 0);
  assert.equal(plan.skipped[0]?.reason, "invalid-range");
});

test("planFixes marks empty-edit", () => {
  const plan = planFixes({
    pass: 1,
    candidates: [candidate({ id: "empty", edits: [] })],
    textByUri: new Map([["tree.xml", "abc"]]),
    unsafe: false,
  });

  assert.equal(plan.applied.length, 0);
  assert.equal(plan.skipped[0]?.reason, "empty-edit");
});

test("planFixes resolves overlap deterministically by priority", () => {
  const high = candidate({ id: "high", severity: "error", edits: [edit(1, 3)] });
  const low = candidate({ id: "low", severity: "warning", edits: [edit(2, 4)] });

  const plan = planFixes({
    pass: 1,
    candidates: [low, high],
    textByUri: new Map([["tree.xml", "abcdef"]]),
    unsafe: false,
  });

  assert.deepEqual(
    plan.applied.map((entry) => entry.id),
    ["high"],
  );
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.reason, "overlap");
});

test("planFixes treats same-offset inserts as overlap", () => {
  const plan = planFixes({
    pass: 1,
    candidates: [
      candidate({ id: "a", edits: [edit(2, 2, "A")] }),
      candidate({ id: "b", edits: [edit(2, 2, "B")] }),
    ],
    textByUri: new Map([["tree.xml", "abcdef"]]),
    unsafe: false,
  });

  assert.equal(plan.applied.length, 1);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.reason, "overlap");
});

test("planFixes groups edits by uri", () => {
  const plan = planFixes({
    pass: 1,
    candidates: [
      candidate({ id: "a", uri: "a.xml", edits: [edit(0, 1)] }),
      candidate({ id: "b", uri: "b.xml", edits: [edit(1, 2)] }),
    ],
    textByUri: new Map([
      ["a.xml", "aa"],
      ["b.xml", "bb"],
    ]),
    unsafe: false,
  });

  assert.equal(plan.editsByUri.size, 2);
  assert.equal(plan.touchedUris.has("a.xml"), true);
  assert.equal(plan.touchedUris.has("b.xml"), true);
});
