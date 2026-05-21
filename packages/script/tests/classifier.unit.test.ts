import assert from "node:assert/strict";
import test from "node:test";
import { classifyScriptAttribute } from "@btxml/script";

test("classifyScriptAttribute classifies script-bearing attributes", () => {
  assert.deepEqual(classifyScriptAttribute({ elementName: "Node", attributeName: "_successIf" }), {
    kind: "precondition",
    expectedResult: "bool-compatible",
  });
  assert.deepEqual(classifyScriptAttribute({ elementName: "Node", attributeName: "_onSuccess" }), {
    kind: "postcondition",
    expectedResult: "ignored",
  });
  assert.deepEqual(classifyScriptAttribute({ elementName: "Script", attributeName: "code" }), {
    kind: "script-node-code",
    expectedResult: "ignored",
  });
  assert.deepEqual(
    classifyScriptAttribute({
      elementName: "Action",
      attributeName: "code",
      resolvedNodeType: "ScriptCondition",
    }),
    { kind: "script-condition-code", expectedResult: "bool-compatible" },
  );
  assert.deepEqual(classifyScriptAttribute({ elementName: "Precondition", attributeName: "if" }), {
    kind: "precondition-node-if",
    expectedResult: "bool-compatible",
  });
});

test("classifyScriptAttribute ignores non-script attributes", () => {
  assert.equal(
    classifyScriptAttribute({ elementName: "Precondition", attributeName: "else" }),
    undefined,
  );
  assert.equal(classifyScriptAttribute({ elementName: "Node", attributeName: "foo" }), undefined);
});
