import type { PortDef, TreeNodeModelDef } from "@btxml/model";
import type { SignatureVariant } from "./types.ts";

export function getRepairPortSignatureKey(port: PortDef): string {
  return JSON.stringify({
    direction: port.direction,
    name: port.name,
    type: port.type ?? null,
    required: port.required,
    defaultValue: port.defaultValue ?? null,
    enumValues: port.enum ?? null,
    description: port.description ?? null,
  });
}

export function getRepairSignatureKey(model: TreeNodeModelDef): string {
  return JSON.stringify({
    kind: model.kind,
    ports: model.ports
      .map((port) => ({
        name: port.name,
        direction: port.direction,
        type: port.type ?? null,
        required: port.required,
        defaultValue: port.defaultValue ?? null,
        enum: port.enum ? [...port.enum].sort() : null,
        description: port.description ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  });
}

function formatPort(port: PortDef): string {
  const parts: string[] = [port.name];
  if (port.type) parts.push(`: ${port.type}`);
  if (!port.required && port.defaultValue !== undefined) {
    parts.push(` = "${port.defaultValue}"`);
  }
  const base = parts.join("");
  if (port.direction === "output") return `${base} [output]`;
  if (port.direction === "inout") return `${base} [inout]`;
  return base;
}

export function getRepairSignatureText(model: TreeNodeModelDef): string {
  return `${model.kind} ${model.id}(${model.ports.map(formatPort).join(", ")})`;
}

export function groupModelsBySignature(models: TreeNodeModelDef[]): SignatureVariant[] {
  const byKey = new Map<string, TreeNodeModelDef[]>();
  for (const model of models) {
    const key = getRepairSignatureKey(model);
    const list = byKey.get(key) ?? [];
    list.push(model);
    byKey.set(key, list);
  }

  const entries = Array.from(byKey.entries());
  entries.sort((left, right) => {
    const firstLeft = left[1][0];
    const firstRight = right[1][0];
    const uriLeft = firstLeft.uri ?? "";
    const uriRight = firstRight.uri ?? "";
    if (uriLeft !== uriRight) return uriLeft.localeCompare(uriRight);
    const offsetLeft = firstLeft.range?.start.offset ?? 0;
    const offsetRight = firstRight.range?.start.offset ?? 0;
    return offsetLeft - offsetRight;
  });

  const signatureIds = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return entries.map(([key, groupModels], index) => {
    const id = signatureIds[index] ?? `S${index}`;
    const representative = groupModels[0];
    const definitions = groupModels.map((model) => ({
      definitionId: `${model.id}:${model.uri ?? ""}:${model.range?.start.offset ?? 0}`,
      uri: model.uri,
      sourceKind: model.source || "inline-tree-nodes-model",
      kind: model.kind,
      range: model.range,
      signatureKey: key,
      signatureId: id,
      signatureText: getRepairSignatureText(model),
      model,
    }));

    return {
      id,
      signatureKey: key,
      signatureText: getRepairSignatureText(representative),
      kind: representative.kind,
      definitions,
      editableDefinitions: definitions.filter((definition) => definition.model.editable !== false),
      nonEditableDefinitions: definitions.filter(
        (definition) => definition.model.editable === false,
      ),
    };
  });
}
