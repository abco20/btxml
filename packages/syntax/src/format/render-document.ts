import type { Diagnostic } from "@btxml/foundation";
import type { BtXmlNode } from "../ast.js";
import { renderNode } from "./render-node.js";

function significantChildren(children: BtXmlNode[]) {
  return children.filter((child) => !(child.kind === "text" && child.text.trim() === ""));
}

export function topLevelNodeLines(
  children: BtXmlNode[],
  indentSize: number,
  blankLineBetweenBehaviorTrees: boolean,
  diagnostics: Diagnostic[],
) {
  const lines: string[] = [];
  const top = significantChildren(children);
  for (let i = 0; i < top.length; i += 1) {
    const child = top[i];
    const prev = top[i - 1];
    const next = top[i + 1];
    const blankBeforeBehaviorTree =
      blankLineBetweenBehaviorTrees &&
      child.kind === "element" &&
      child.name === "BehaviorTree" &&
      prev &&
      prev.kind === "element" &&
      prev.name === "BehaviorTree";
    const blankBeforeTreeNodesModel =
      child.kind === "element" &&
      child.name === "TreeNodesModel" &&
      prev !== undefined &&
      prev.kind !== "comment";
    const blankBeforeComment =
      child.kind === "comment" &&
      next &&
      next.kind === "element" &&
      next.name === "TreeNodesModel" &&
      prev !== undefined;
    if (
      (blankBeforeBehaviorTree || blankBeforeTreeNodesModel || blankBeforeComment) &&
      lines.length > 0 &&
      lines[lines.length - 1] !== ""
    ) {
      lines.push("");
    }
    if (child.kind === "element") {
      lines.push(...renderNode(child, 1, indentSize, diagnostics));
      if (child.name === "TreeNodesModel") lines.push("");
    } else {
      lines.push(...renderNode(child, 1, indentSize, diagnostics));
    }
  }
  return lines;
}
