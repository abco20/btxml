import { containsOffset } from "@btxml/foundation";
import type { BtDocument, BtXmlElement, BtXmlNode } from "./ast.js";

export { containsOffset } from "@btxml/foundation";

export function findElementAt(element: BtXmlElement, offset: number): BtXmlElement | undefined {
  if (!containsOffset(element.range, offset) && !containsOffset(element.fullRange, offset))
    return undefined;
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    const found = findElementAt(child, offset);
    if (found) return found;
  }
  return element;
}

export function isElement(node: BtXmlNode): node is BtXmlElement {
  return node.kind === "element";
}

export function getAttribute(
  element: BtXmlElement,
  name: string,
): import("./ast.js").BtXmlAttribute | undefined {
  return element.attributes.find((attribute) => attribute.name === name);
}

export function getElementChildren(element: BtXmlElement): readonly BtXmlElement[] {
  return element.children.filter(isElement);
}

export function getElementText(element: BtXmlElement): string {
  return element.children
    .filter((child): child is import("./ast.js").BtXmlText => child.kind === "text")
    .map((child) => child.text)
    .join("");
}

export function walkElements(
  node: BtDocument | BtXmlElement,
  visit: (element: BtXmlElement) => void,
): void {
  let root: BtXmlElement | undefined;
  if ((node as BtXmlElement).kind === "element") {
    root = node as BtXmlElement;
  } else {
    root = (node as BtDocument).root;
  }
  if (!root) return;

  const walk = (element: BtXmlElement) => {
    visit(element);
    for (const child of element.children) {
      if (!isElement(child)) continue;
      walk(child);
    }
  };

  walk(root);
}
