import type { ConfigNodeModel, ConfigPortDef } from "./node-definitions/schema.js";
import type { PortDef, PortDirection } from "./public-types.js";

const reservedAttributes = new Set([
  "ID",
  "name",
  "_name",
  "_autoremap",
  // precondition attributes
  "_failureIf",
  "_successIf",
  "_skipIf",
  "_while",
  // postcondition attributes
  "_onSuccess",
  "_onFailure",
  "_onHalted",
  "_post",
]);

const reservedPortNames = new Set([
  ...reservedAttributes,
  "_autoremap",
  "_description",
  "__shared_blackboard",
]);

const invalidPortNameCharacterDescriptions = new Map<string, string>([
  [".", "port names must not contain `.`"],
  ["<", "port names must not contain `<`"],
  [">", "port names must not contain `>`"],
  ["&", "port names must not contain `&`"],
  ['"', 'port names must not contain `"`'],
  ["'", "port names must not contain `'`"],
  ["/", "port names must not contain `/`"],
  ["\\", "port names must not contain `\\`"],
  [":", "port names must not contain `:`"],
  ["*", "port names must not contain `*`"],
  ["?", "port names must not contain `?`"],
  ["|", "port names must not contain `|`"],
]);

export function isReservedAttribute(name: string) {
  return reservedAttributes.has(name);
}

export function isReservedPortName(name: string) {
  return reservedPortNames.has(name);
}

export function getInvalidPortNameReason(name: string): string | undefined {
  if (name.length === 0) {
    return "port names must not be empty";
  }

  if (/^[0-9]/.test(name)) {
    return "port names must not start with a digit";
  }

  if (isReservedPortName(name)) {
    return `\`${name}\` is a reserved attribute name`;
  }

  for (const char of name) {
    const controlCode = char.charCodeAt(0);
    if (controlCode <= 0x1f || controlCode === 0x7f) {
      return "port names must not contain ASCII control characters";
    }
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      return "port names must not contain whitespace";
    }
    const description = invalidPortNameCharacterDescriptions.get(char);
    if (description) {
      return description;
    }
  }

  return undefined;
}

export function normalizeConfigPort(name: string, port: ConfigPortDef): PortDef {
  const direction = port.direction ?? "input";
  return {
    source: "config",
    name,
    direction,
    type: port.type,
    defaultValue: port.default,
    description: port.description,
    required:
      port.required ??
      ((direction === "input" || direction === "inout") && port.default === undefined),
    enum: port.enum,
  };
}

export function normalizeConfigNodeModel(id: string, model: ConfigNodeModel) {
  return {
    id,
    kind: model.kind,
    source: "config" as const,
    sourceMeta: { sourceKind: "config" as const },
    editable: true,
    ports: Object.entries(model.ports ?? {}).map(([name, port]) => normalizeConfigPort(name, port)),
  };
}

export function inferRequired(direction: PortDirection, defaultValue?: string, explicit?: boolean) {
  if (explicit !== undefined) return explicit;
  return (direction === "input" || direction === "inout") && defaultValue === undefined;
}
