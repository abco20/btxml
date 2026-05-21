import assert from "node:assert/strict";
import test from "node:test";
import {
  createScriptEnvironment,
  getScriptCompletions,
  getScriptCursorContext,
} from "@btxml/script";

test("getScriptCursorContext identifies identifier and assignment contexts", () => {
  assert.deepEqual(getScriptCursorContext({ source: "tar", cursorOffset: 3 }), {
    kind: "identifier",
    prefix: "tar",
    range: { start: 0, end: 3 },
  });

  assert.deepEqual(getScriptCursorContext({ source: "A ", cursorOffset: 2 }), {
    kind: "after-assignment-lhs",
    prefix: "",
    range: { start: 2, end: 2 },
  });
});

test("getScriptCompletions suggests enums blackboard locals booleans and operators", () => {
  const environment = createScriptEnvironment({
    symbols: [
      {
        name: "target",
        type: { kind: "custom", name: "Pose2D", canonical: "robot/Pose2D" },
        source: { kind: "port-remap", nodeType: "ReadPose", portName: "pose", direction: "output" },
        readable: true,
        writable: true,
      },
    ],
    augmentations: [{ version: 1, script: { enums: { RED: 1 } } }],
  });

  const localItems = getScriptCompletions({
    source: "A := 1; ",
    cursorOffset: "A := 1; ".length,
    environment,
    attributeName: "code",
    attributeInfo: { kind: "script-node-code", expectedResult: "ignored" },
  });

  assert.ok(
    localItems.some(
      (item) => item.label === "target" && item.detail === "Pose2D from ReadPose.pose",
    ),
  );
  assert.ok(
    localItems.some(
      (item) => item.label === "A" && item.detail === "number from earlier code declaration",
    ),
  );
  assert.ok(localItems.some((item) => item.label === "true"));
  assert.ok(localItems.some((item) => item.label === "false"));

  const enumItems = getScriptCompletions({
    source: "R",
    cursorOffset: 1,
    environment,
  });
  assert.ok(enumItems.some((item) => item.label === "RED" && item.detail === "enum value 1"));

  const operatorItems = getScriptCompletions({
    source: "target ",
    cursorOffset: "target ".length,
    environment,
  });
  assert.ok(operatorItems.some((item) => item.label === "=="));
  assert.ok(operatorItems.some((item) => item.label === ".."));
  assert.ok(operatorItems.some((item) => item.label === ":="));
  assert.ok(operatorItems.some((item) => item.label === "+="));
});

test("getScriptCompletions suggests assignment snippets only for ignored-result scripts", () => {
  const ignoredItems = getScriptCompletions({
    source: "",
    cursorOffset: 0,
    attributeInfo: { kind: "script-node-code", expectedResult: "ignored" },
  });
  assert.ok(ignoredItems.some((item) => item.label === "name := value"));
  assert.ok(ignoredItems.some((item) => item.label === "name = value"));

  const boolItems = getScriptCompletions({
    source: "",
    cursorOffset: 0,
    attributeInfo: { kind: "precondition", expectedResult: "bool-compatible" },
  });
  assert.equal(
    boolItems.some((item) => item.label === "name := value"),
    false,
  );
});
