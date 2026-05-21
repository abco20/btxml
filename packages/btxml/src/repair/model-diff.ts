import type { PortDef, TreeNodeModelDef } from "@btxml/model";
import type { NodeModelDifference } from "./types.ts";

function toSerializablePort(port: PortDef) {
  return {
    name: port.name,
    direction: port.direction,
    type: port.type,
    required: port.required,
    defaultValue: port.defaultValue,
    enum: port.enum ? [...port.enum].sort() : undefined,
    description: port.description,
  };
}

export function diffNodeModels(
  left: TreeNodeModelDef,
  right: TreeNodeModelDef,
): NodeModelDifference[] {
  const differences: NodeModelDifference[] = [];

  if (left.kind !== right.kind) {
    differences.push({ kind: "node-kind", left: left.kind, right: right.kind });
  }

  const leftPorts = new Map(left.ports.map((port) => [port.name, port]));
  const rightPorts = new Map(right.ports.map((port) => [port.name, port]));

  for (const [name, port] of leftPorts) {
    if (!rightPorts.has(name)) {
      differences.push({
        kind: "port-removed",
        portName: name,
        sourceIndex: 0,
        port: toSerializablePort(port),
      });
    }
  }

  for (const [name, port] of rightPorts) {
    if (!leftPorts.has(name)) {
      differences.push({
        kind: "port-added",
        portName: name,
        sourceIndex: 1,
        port: toSerializablePort(port),
      });
    }
  }

  for (const [name, leftPort] of leftPorts) {
    const rightPort = rightPorts.get(name);
    if (!rightPort) continue;

    if (leftPort.direction !== rightPort.direction) {
      differences.push({
        kind: "port-direction",
        portName: name,
        left: leftPort.direction,
        right: rightPort.direction,
      });
    }
    if (leftPort.type !== rightPort.type) {
      differences.push({
        kind: "port-type",
        portName: name,
        left: leftPort.type,
        right: rightPort.type,
      });
    }
    if (leftPort.required !== rightPort.required) {
      differences.push({
        kind: "port-required",
        portName: name,
        left: leftPort.required,
        right: rightPort.required,
      });
    }
    if (leftPort.defaultValue !== rightPort.defaultValue) {
      differences.push({
        kind: "port-default",
        portName: name,
        left: leftPort.defaultValue,
        right: rightPort.defaultValue,
      });
    }
    const leftEnum = leftPort.enum ? JSON.stringify([...leftPort.enum].sort()) : "";
    const rightEnum = rightPort.enum ? JSON.stringify([...rightPort.enum].sort()) : "";
    if (leftEnum !== rightEnum) {
      differences.push({
        kind: "port-enum",
        portName: name,
        left: leftPort.enum ? [...leftPort.enum].sort() : undefined,
        right: rightPort.enum ? [...rightPort.enum].sort() : undefined,
      });
    }
    if (leftPort.description !== rightPort.description) {
      differences.push({
        kind: "port-description",
        portName: name,
        left: leftPort.description,
        right: rightPort.description,
      });
    }
  }

  return differences;
}

function normalizeDiffValue(value: unknown): string {
  if (value === undefined || value === null) return "undefined";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.sort().join(";") || "empty";
  return String(value);
}

export function getDifferencePatternKey(differences: NodeModelDifference[]): string {
  const parts: string[] = [];
  for (const diff of differences) {
    switch (diff.kind) {
      case "node-kind":
        parts.push(`node-kind:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`);
        break;
      case "port-added":
        parts.push(`added:${diff.portName}`);
        break;
      case "port-removed":
        parts.push(`removed:${diff.portName}`);
        break;
      case "port-direction":
        parts.push(
          `direction:${diff.portName}:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`,
        );
        break;
      case "port-type":
        parts.push(
          `type:${diff.portName}:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`,
        );
        break;
      case "port-required":
        parts.push(
          `required:${diff.portName}:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`,
        );
        break;
      case "port-default":
        parts.push(
          `default:${diff.portName}:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`,
        );
        break;
      case "port-enum":
        parts.push(
          `enum:${diff.portName}:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`,
        );
        break;
      case "port-description":
        parts.push(
          `description:${diff.portName}:${normalizeDiffValue(diff.left)}:${normalizeDiffValue(diff.right)}`,
        );
        break;
    }
  }
  return parts.sort().join("|");
}

function hasPortName(
  diff: NodeModelDifference,
): diff is Extract<NodeModelDifference, { portName: string }> {
  return "portName" in diff;
}

export function getDifferencePatternLabel(differences: NodeModelDifference[]): string {
  const portDiffs = differences.filter((diff) => diff.kind.startsWith("port-"));
  if (portDiffs.length === 0) {
    return differences.length === 1 && differences[0].kind === "node-kind"
      ? "node kind differs"
      : `${differences.length} structural differences`;
  }
  const uniquePorts = new Set(portDiffs.filter(hasPortName).map((diff) => diff.portName));
  if (uniquePorts.size === 1) {
    const portName = Array.from(uniquePorts)[0];
    const kinds = portDiffs.map((diff) => diff.kind.replace("port-", "")).join(", ");
    return `${kinds} on \`${portName}\``;
  }
  return `${uniquePorts.size} differing ports`;
}
