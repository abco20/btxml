import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConfigNodeModel } from "@btxml/model";

test("normalizeConfigNodeModel: handles Action with simple ports", () => {
  const normalized = normalizeConfigNodeModel("Move", {
    kind: "Action",
    ports: {
      goal: { direction: "input", type: "string" },
    },
  });
  assert.equal(normalized.id, "Move");
  assert.equal(normalized.kind, "Action");
  assert.equal(normalized.ports.length, 1);
  assert.equal(normalized.ports[0].name, "goal");
  assert.equal(normalized.ports[0].direction, "input");
  assert.equal(normalized.ports[0].type, "string");
});

test("normalizeConfigNodeModel: handles string shorthands", () => {
  const normalized = normalizeConfigNodeModel("Test", {
    kind: "Condition",
    ports: {
      p1: { direction: "input" },
      p2: { direction: "output" },
      p3: { direction: "inout" },
    },
  });
  assert.equal(normalized.ports[0].name, "p1");
  assert.equal(normalized.ports[0].direction, "input");
  assert.equal(normalized.ports[1].name, "p2");
  assert.equal(normalized.ports[1].direction, "output");
  assert.equal(normalized.ports[2].name, "p3");
  assert.equal(normalized.ports[2].direction, "inout");
});
