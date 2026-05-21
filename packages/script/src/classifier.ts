export type ScriptAttributeKind =
  | "precondition"
  | "postcondition"
  | "script-node-code"
  | "script-condition-code"
  | "precondition-node-if";

export type ScriptAttributeInfo = {
  kind: ScriptAttributeKind;
  expectedResult: "bool-compatible" | "ignored";
};

const PRECONDITION_ATTRIBUTES = new Set(["_failureIf", "_successIf", "_skipIf", "_while"]);
const POSTCONDITION_ATTRIBUTES = new Set(["_onSuccess", "_onFailure", "_onHalted", "_post"]);

export function classifyScriptAttribute(input: {
  elementName: string;
  attributeName: string;
  resolvedNodeType?: string;
}): ScriptAttributeInfo | undefined {
  if (PRECONDITION_ATTRIBUTES.has(input.attributeName)) {
    return { kind: "precondition", expectedResult: "bool-compatible" };
  }

  if (POSTCONDITION_ATTRIBUTES.has(input.attributeName)) {
    return { kind: "postcondition", expectedResult: "ignored" };
  }

  const builtinId = input.resolvedNodeType ?? input.elementName;

  if (input.attributeName === "code" && builtinId === "Script") {
    return { kind: "script-node-code", expectedResult: "ignored" };
  }

  if (input.attributeName === "code" && builtinId === "ScriptCondition") {
    return { kind: "script-condition-code", expectedResult: "bool-compatible" };
  }

  if (input.attributeName === "if" && builtinId === "Precondition") {
    return { kind: "precondition-node-if", expectedResult: "bool-compatible" };
  }

  return undefined;
}
