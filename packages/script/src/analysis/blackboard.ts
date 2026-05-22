import { parseScriptBlackboardIdentifier } from "@btxml/model";

export type ScriptIdentifierClassification =
  | { kind: "local"; name: string }
  | { kind: "global-blackboard"; key: string }
  | { kind: "invalid-global-blackboard"; raw: string; message: string };

export function classifyScriptIdentifier(name: string): ScriptIdentifierClassification {
  if (!name.startsWith("@")) {
    return { kind: "local", name };
  }

  const parsed = parseScriptBlackboardIdentifier({ rawName: name });
  if (!parsed.ok) {
    return {
      kind: "invalid-global-blackboard",
      raw: name,
      message: `invalid global blackboard identifier \`${name}\``,
    };
  }

  return { kind: "global-blackboard", key: parsed.reference.key };
}
