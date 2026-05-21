import type { BtXmlElement } from "@btxml/syntax";
import type { DocumentSymbol } from "./public-types.js";

function getAttr(element: BtXmlElement, name: string) {
  return element.attributes.find((attr) => attr.name === name);
}

export function buildSymbolsForElement(element: BtXmlElement): DocumentSymbol {
  const label =
    element.name === "BehaviorTree"
      ? getAttr(element, "ID")?.value || "BehaviorTree"
      : element.name;
  const kind =
    element.name === "BehaviorTree"
      ? "Class"
      : element.name === "TreeNodesModel"
        ? "Namespace"
        : element.name === "include"
          ? "File"
          : element.name === "SubTree"
            ? "Reference"
            : ["input_port", "output_port"].includes(element.name)
              ? "Property"
              : "Function";
  const children = element.children
    .filter((child): child is BtXmlElement => child.kind === "element")
    .map((child) => buildSymbolsForElement(child));
  return {
    name: label,
    detail: element.name,
    kind,
    range: element.range,
    selectionRange: element.nameRange || element.openTagRange,
    children: children.length > 0 ? children : undefined,
  };
}
