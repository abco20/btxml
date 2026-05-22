import {
  type BlackboardScope,
  formatBlackboardReference as formatSemanticBlackboardReference,
  makeBlackboardIdentity,
} from "@btxml/semantic";
import type { LanguageRequestContext } from "../context.js";

export type BlackboardSymbol = {
  identity: string;
  key: string;
  scope: BlackboardScope;
  type?: string;
  direction: "input" | "output" | "inout";
  nodeType: string;
  portName: string;
  conflict?: boolean;
};

export function formatBlackboardReference(symbol: Pick<BlackboardSymbol, "scope" | "key">) {
  return formatSemanticBlackboardReference(symbol);
}

export function normalizeType(type?: string) {
  return type
    ?.trim()
    .replace(/^const\s+/, "")
    .replace(/[&*]\s*$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isCompatibleType(current?: string, candidate?: string) {
  if (!current || !candidate) return false;
  return normalizeType(current) === normalizeType(candidate);
}

export function collectBlackboardSymbols(context: LanguageRequestContext): BlackboardSymbol[] {
  const grouped = new Map<string, BlackboardSymbol>();

  for (const node of context.documentView?.nodes ?? []) {
    for (const binding of node.portBindings) {
      if (binding.declaredPort.status !== "resolved") continue;

      const port = binding.declaredPort.port;
      for (const ref of binding.blackboardReferences) {
        if (ref.syntax === "invalid") continue;

        const next: BlackboardSymbol = {
          identity: ref.identity,
          key: ref.key,
          scope: ref.scope,
          type: port.type,
          direction: port.direction,
          nodeType: node.usage.nodeType || node.tagName,
          portName: port.name,
        };
        const current = grouped.get(ref.identity);
        if (!current) {
          grouped.set(ref.identity, next);
          continue;
        }

        const currentType = normalizeType(current.type);
        const nextType = normalizeType(next.type);
        if (currentType && nextType && currentType !== nextType) {
          grouped.set(ref.identity, {
            ...current,
            conflict: true,
          });
          continue;
        }

        if (!currentType && nextType) {
          grouped.set(ref.identity, {
            ...current,
            type: next.type,
          });
        }
      }
    }
  }

  return [...grouped.values()];
}

export function getBlackboardIdentity(input: {
  key: string;
  scope: BlackboardScope;
}) {
  return makeBlackboardIdentity(input);
}
