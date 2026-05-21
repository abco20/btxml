import { type PortDef, isReservedAttribute } from "@btxml/model";
import type { BtXmlAttribute } from "@btxml/syntax";
import { getGenericSubTreePorts } from "../queries.js";
import type { SemanticIndex } from "../types.js";
import type { NodeTagForm, NodeUsageModelResolution, PortUsageResolution } from "./types.js";

export function mergePortsByName(ports: readonly PortDef[]): readonly PortDef[] {
  const byName = new Map<string, PortDef>();

  for (const port of ports) {
    if (!byName.has(port.name)) {
      byName.set(port.name, port);
    }
  }

  return [...byName.values()];
}

export function getPortCandidates(input: {
  index: SemanticIndex;
  tagForm: NodeTagForm;
  model: NodeUsageModelResolution;
  subtreeModelPorts?: readonly PortDef[];
}): readonly PortDef[] {
  const genericSubTreePorts = getGenericSubTreePorts(input.index);

  if (input.tagForm === "subtree") {
    const modelPorts =
      input.model.status === "resolved" ? input.model.model.ports : (input.subtreeModelPorts ?? []);

    return mergePortsByName([...modelPorts, ...genericSubTreePorts]);
  }

  if (input.model.status === "resolved") {
    return [...input.model.model.ports];
  }

  return [];
}

export function resolveAttributeAsPort(input: {
  attribute: BtXmlAttribute;
  ports: readonly PortDef[];
  allowsArbitraryAttributes: boolean;
  model: NodeUsageModelResolution;
  unknownModelPortStatus?: "unknown-node-model" | "undeclared";
}): PortUsageResolution {
  const { attribute } = input;

  const port = input.ports.find((candidate) => candidate.name === attribute.name);

  if (port) {
    return {
      status: "resolved",
      attribute,
      name: attribute.name,
      value: attribute.value,
      port,
    };
  }

  if (isReservedAttribute(attribute.name)) {
    return {
      status: "reserved-attribute",
      attribute,
      name: attribute.name,
      value: attribute.value,
    };
  }

  if (input.allowsArbitraryAttributes) {
    return {
      status: "allowed-arbitrary",
      attribute,
      name: attribute.name,
      value: attribute.value,
    };
  }

  if (input.unknownModelPortStatus === "undeclared") {
    return {
      status: "undeclared",
      attribute,
      name: attribute.name,
      value: attribute.value,
    };
  }

  if (input.model.status === "unresolved" || input.model.status === "ambiguous") {
    return {
      status: "unknown-node-model",
      attribute,
      name: attribute.name,
      value: attribute.value,
    };
  }

  return {
    status: "undeclared",
    attribute,
    name: attribute.name,
    value: attribute.value,
  };
}
