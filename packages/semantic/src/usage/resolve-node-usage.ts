import { resolveSubTreeTarget } from "../subtree-resolution.js";
import type { SemanticIndex } from "../types.js";
import { resolveNodeUsageModel } from "./model-resolution.js";
import {
  classifyNodeTag,
  getAttributeValue,
  getNodeTypeFromElement,
  isModelPortDefinitionTag,
  isTreeNodesModelDescendant,
} from "./node-type.js";
import { normalizeNodeUsagePolicy } from "./policy.js";
import { getPortCandidates, mergePortsByName, resolveAttributeAsPort } from "./port-resolution.js";
import type {
  NodeUsageModelResolution,
  NodeUsageResolution,
  ResolveNodeUsageInput,
} from "./types.js";

export function resolveNodeUsage(
  index: SemanticIndex,
  input: ResolveNodeUsageInput,
): NodeUsageResolution {
  const policy = normalizeNodeUsagePolicy(input.policy);
  const element = input.element;

  let tagForm = classifyNodeTag(element);
  const inTreeNodesModel = isTreeNodesModelDescendant(input.documentRoot, element);

  if (
    input.isModelDefinition ||
    (inTreeNodesModel && (tagForm === "generic-node" || tagForm === "subtree"))
  ) {
    tagForm = "model-definition";
  }

  if (inTreeNodesModel && isModelPortDefinitionTag(element)) {
    tagForm = "unknown-xml";
  }

  if (
    tagForm === "root" ||
    tagForm === "behavior-tree" ||
    tagForm === "tree-nodes-model" ||
    tagForm === "include" ||
    tagForm === "model-definition" ||
    tagForm === "unknown-xml"
  ) {
    return {
      element,
      tagName: element.name,
      tagForm,
      model: { status: "not-a-node" },
      ports: [],
      allowsArbitraryAttributes: false,
      portUsages: [],
    };
  }

  const nodeType = getNodeTypeFromElement(element);

  if (tagForm !== "subtree") {
    const model = resolveNodeUsageModel(index, nodeType);
    const ports = getPortCandidates({
      index,
      tagForm,
      model,
    });

    const portUsages = element.attributes.map((attribute) =>
      resolveAttributeAsPort({
        attribute,
        ports,
        allowsArbitraryAttributes: false,
        model,
      }),
    );

    return {
      element,
      tagName: element.name,
      tagForm,
      nodeType,
      model,
      ports,
      allowsArbitraryAttributes: false,
      portUsages,
    };
  }

  const subtreeId = getAttributeValue(element, "ID");
  const target = subtreeId
    ? resolveSubTreeTarget(index, {
        id: subtreeId,
        fileLocalUri: input.uri,
        config: input.config as Parameters<typeof resolveSubTreeTarget>[1]["config"],
      })
    : { status: "unresolved" as const, id: undefined };

  let model: NodeUsageModelResolution = {
    status: "unresolved" as const,
    nodeType: subtreeId,
  };
  let allowsArbitraryAttributes = false;

  if (target.status === "resolved" && target.kind === "node-model") {
    model = {
      status: "resolved",
      model: target.model,
    };
  } else if (target.status === "resolved" && target.kind === "behavior-tree") {
    const maybeModel = resolveNodeUsageModel(index, target.treeId);

    if (maybeModel.status === "resolved" && maybeModel.model.kind === "SubTree") {
      model = maybeModel;
    } else {
      allowsArbitraryAttributes = policy.unknownSubTreePorts === "allow";
    }
  } else if (target.status === "ambiguous") {
    if (target.definitions.length > 0) {
      model =
        target.definitions.length === 1
          ? { status: "resolved", model: target.definitions[0] }
          : {
              status: "ambiguous",
              nodeType: subtreeId ?? "SubTree",
              candidates: target.definitions,
            };
    } else {
      allowsArbitraryAttributes = policy.unknownSubTreePorts === "allow";
    }
  } else {
    allowsArbitraryAttributes = policy.unknownSubTreePorts === "allow";
  }

  const ports = getPortCandidates({
    index,
    tagForm,
    model,
    subtreeModelPorts:
      target.status === "ambiguous"
        ? mergePortsByName(target.definitions.flatMap((definition) => definition.ports))
        : undefined,
  });

  const portUsages = element.attributes.map((attribute) =>
    resolveAttributeAsPort({
      attribute,
      ports,
      allowsArbitraryAttributes,
      model,
      unknownModelPortStatus:
        !allowsArbitraryAttributes && model.status !== "resolved" ? "undeclared" : undefined,
    }),
  );

  return {
    element,
    tagName: element.name,
    tagForm,
    nodeType,
    model,
    subtree: {
      id: subtreeId,
      target,
    },
    ports,
    allowsArbitraryAttributes,
    portUsages,
  };
}
