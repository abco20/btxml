import type { BtXmlElement } from "@btxml/syntax";
import type { NodeTagForm } from "./types.js";

const GENERIC_NODE_TAGS = ["Action", "Condition", "Control", "Decorator"] as const;

const GENERIC_NODE_TAG_SET = new Set<string>(GENERIC_NODE_TAGS);

const MODEL_DEFINITION_TAGS = new Set(["Action", "Condition", "Control", "Decorator", "SubTree"]);

const MODEL_PORT_DEFINITION_TAGS = new Set(["input_port", "output_port", "inout_port"]);

export type GenericNodeKind = (typeof GENERIC_NODE_TAGS)[number];

export function isGenericNodeTag(name: string): name is GenericNodeKind {
  return GENERIC_NODE_TAG_SET.has(name);
}

export function getGenericNodeKindFromTag(name: string): GenericNodeKind | undefined {
  return isGenericNodeTag(name) ? name : undefined;
}

export function getAttributeValue(element: BtXmlElement, name: string): string | undefined {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

function isModelDefinitionElement(element: BtXmlElement): boolean {
  return MODEL_DEFINITION_TAGS.has(element.name);
}

function hasDescendantElement(root: BtXmlElement, target: BtXmlElement): boolean {
  if (root === target) return true;

  for (const child of root.children) {
    if (child.kind !== "element") continue;
    if (hasDescendantElement(child, target)) return true;
  }

  return false;
}

export function isTreeNodesModelDescendant(
  root: BtXmlElement | undefined,
  element: BtXmlElement,
): boolean {
  if (!root) return false;

  if (root.name === "TreeNodesModel") {
    return hasDescendantElement(root, element);
  }

  for (const child of root.children) {
    if (child.kind !== "element" || child.name !== "TreeNodesModel") continue;
    if (hasDescendantElement(child, element)) return true;
  }

  return false;
}

export function isModelDefinitionTag(element: BtXmlElement): boolean {
  return isModelDefinitionElement(element);
}

export function isModelPortDefinitionTag(element: BtXmlElement): boolean {
  return MODEL_PORT_DEFINITION_TAGS.has(element.name);
}

export function classifyNodeTag(element: BtXmlElement): NodeTagForm {
  if (element.name === "root") return "root";
  if (element.name === "BehaviorTree") return "behavior-tree";
  if (element.name === "TreeNodesModel") return "tree-nodes-model";
  if (element.name === "include") return "include";
  if (element.name === "SubTree") return "subtree";
  if (isGenericNodeTag(element.name)) return "generic-node";
  if (isModelPortDefinitionTag(element)) return "unknown-xml";
  return "concrete-node";
}

export function isTreeNodesModelChild(element: BtXmlElement): boolean {
  return isModelDefinitionElement(element);
}

export function getNodeTypeFromElement(element: BtXmlElement): string | undefined {
  if (element.name === "SubTree") {
    return getAttributeValue(element, "ID") || "SubTree";
  }

  if (isGenericNodeTag(element.name)) {
    return getAttributeValue(element, "ID");
  }

  if (
    element.name === "root" ||
    element.name === "BehaviorTree" ||
    element.name === "TreeNodesModel" ||
    element.name === "include" ||
    isModelPortDefinitionTag(element)
  ) {
    return undefined;
  }

  return element.name;
}
