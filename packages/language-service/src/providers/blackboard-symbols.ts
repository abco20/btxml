import type { LanguageRequestContext } from "../context.js";

export type BlackboardSymbol = {
  key: string;
  type?: string;
  direction: "input" | "output" | "inout";
  nodeType: string;
  portName: string;
  conflict?: boolean;
};

const BLACKBOARD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_./:-]*$/;

export function validateExtractedBlackboardKey(raw?: string) {
  const key = raw?.trim();
  if (!key) return undefined;
  if (key.includes("{") || key.includes("}")) return undefined;
  return BLACKBOARD_KEY_RE.test(key) ? key : undefined;
}

export function normalizeBlackboardKey(raw?: string) {
  const value = raw?.trim();
  if (!value) return undefined;

  const extracted =
    value.startsWith("{") && value.endsWith("}") ? value.slice(1, -1).trim() : value;

  return validateExtractedBlackboardKey(extracted);
}

export function formatBlackboardReference(key: string) {
  return `{${key}}`;
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
        const key = normalizeBlackboardKey(ref.key);
        if (!key) continue;

        const next: BlackboardSymbol = {
          key,
          type: port.type,
          direction: port.direction,
          nodeType: node.usage.nodeType || node.tagName,
          portName: port.name,
        };
        const current = grouped.get(key);
        if (!current) {
          grouped.set(key, next);
          continue;
        }

        const currentType = normalizeType(current.type);
        const nextType = normalizeType(next.type);
        if (currentType && nextType && currentType !== nextType) {
          grouped.set(key, {
            ...current,
            conflict: true,
          });
          continue;
        }

        if (!currentType && nextType) {
          grouped.set(key, {
            ...current,
            type: next.type,
          });
        }
      }
    }
  }

  return [...grouped.values()];
}
