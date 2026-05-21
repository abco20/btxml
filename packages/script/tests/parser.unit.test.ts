import assert from "node:assert/strict";
import test from "node:test";
import { parseScript } from "@btxml/script";

test("parseScript parses statements, precedence, ternary, chains, and unary operators", () => {
  const cases = [
    "A:=1; B:=2",
    "A + B * C",
    "(A + B) * C",
    "A ? B : C",
    "A < B < C",
    "!A",
    "~A",
    "A .. 'x'",
  ];

  for (const source of cases) {
    const result = parseScript(source);
    assert.equal(result.ok, true, source);
  }
});

test("parseScript returns syntax errors for incomplete expressions", () => {
  const cases = ["A ?", "(A + B", "A + ;"];

  for (const source of cases) {
    const result = parseScript(source);
    assert.equal(result.ok, false, source);
  }
});

test("parseScript rejects empty scripts", () => {
  const result = parseScript("");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors[0]?.kind, "empty-script");
});

test("parseScript allows full expressions on assignment right-hand sides", () => {
  for (const source of ["A = B = 1", "A := B := 1", "A += B += 1"]) {
    const result = parseScript(source);
    assert.equal(result.ok, true, source);
  }
});
