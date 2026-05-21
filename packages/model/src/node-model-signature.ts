import type { TreeNodeKind, TreeNodeModelDef } from "./public-types.js";

export type NodeModelSignature = {
  id: string;
  kind: TreeNodeKind;
  ports: NodeModelPortSignature[];
};

export type NodeModelPortSignature = {
  name: string;
  direction: string;
  type?: string;
  required: boolean;
  defaultValue?: string;
  enum?: string[];
  description?: string;
};

export function getNodeModelSignature(model: TreeNodeModelDef): NodeModelSignature {
  return {
    id: model.id,
    kind: model.kind,
    ports: [...model.ports]
      .sort((a, b) => {
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) return nameCmp;
        const dirCmp = a.direction.localeCompare(b.direction);
        if (dirCmp !== 0) return dirCmp;
        const typeCmp = (a.type ?? "").localeCompare(b.type ?? "");
        if (typeCmp !== 0) return typeCmp;
        const defCmp = (a.defaultValue ?? "").localeCompare(b.defaultValue ?? "");
        if (defCmp !== 0) return defCmp;
        return (a.description ?? "").localeCompare(b.description ?? "");
      })
      .map((port) => ({
        name: port.name,
        direction: port.direction,
        type: port.type,
        required: port.required,
        defaultValue: port.defaultValue,
        enum: port.enum ? [...port.enum].sort() : undefined,
        description: port.description,
      })),
  };
}

export function areEquivalentNodeModels(a: TreeNodeModelDef, b: TreeNodeModelDef): boolean {
  const sigA = getNodeModelSignature(a);
  const sigB = getNodeModelSignature(b);
  return JSON.stringify(sigA) === JSON.stringify(sigB);
}

export type NodeModelDifferenceKind = "none" | "kind" | "ports" | "port-default" | "mixed";

export function classifyNodeModelDifference(
  a: TreeNodeModelDef,
  b: TreeNodeModelDef,
): NodeModelDifferenceKind {
  if (areEquivalentNodeModels(a, b)) return "none";

  const sigA = getNodeModelSignature(a);
  const sigB = getNodeModelSignature(b);

  if (sigA.kind !== sigB.kind) return "kind";

  if (sigA.ports.length !== sigB.ports.length) return "ports";

  const mapB = new Map(sigB.ports.map((p) => [p.name, p]));

  let hasDefaultDiff = false;
  let hasOtherDiff = false;

  for (const portA of sigA.ports) {
    const portB = mapB.get(portA.name);
    if (!portB) {
      hasOtherDiff = true;
      continue;
    }
    if (
      portA.direction !== portB.direction ||
      portA.type !== portB.type ||
      portA.required !== portB.required
    ) {
      hasOtherDiff = true;
    }
    const enumA = portA.enum ? JSON.stringify(portA.enum) : "";
    const enumB = portB.enum ? JSON.stringify(portB.enum) : "";
    if (enumA !== enumB) {
      hasOtherDiff = true;
    }
    if (portA.description !== portB.description) {
      hasOtherDiff = true;
    }
    if (portA.defaultValue !== portB.defaultValue) {
      hasDefaultDiff = true;
    }
  }

  if (hasOtherDiff) return "ports";
  if (hasDefaultDiff) return "port-default";
  return "mixed";
}
