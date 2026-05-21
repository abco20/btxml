import type { Diagnostic } from "@btxml/foundation";
import type { BtXmlElement, BtXmlNode } from "../ast.js";

function escapeText(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function significantChildren(children: BtXmlNode[]) {
  return children.filter((child) => !(child.kind === "text" && child.text.trim() === ""));
}

function indentText(depth: number, text: string, indentSize: number) {
  return `${" ".repeat(depth * indentSize)}${text}`;
}

export function renderOpenTag(
  node: BtXmlElement,
  depth: number,
  suffix: string,
  indentSize: number,
) {
  const indent = " ".repeat(depth * indentSize);
  const attrs = node.attributes || [];
  if (attrs.length === 0) return [`${indent}<${node.name}${suffix}`];
  if (attrs.length === 1) {
    return [`${indent}<${node.name} ${attrs[0].name}="${escapeAttr(attrs[0].value)}"${suffix}`];
  }
  const lines = [`${indent}<${node.name} ${attrs[0].name}="${escapeAttr(attrs[0].value)}"`];
  const pad = " ".repeat(indent.length + 1 + node.name.length + 1);
  for (let i = 1; i < attrs.length; i += 1) {
    const attr = attrs[i];
    const ending = i === attrs.length - 1 ? suffix : "";
    lines.push(`${pad}${attr.name}="${escapeAttr(attr.value)}"${ending}`);
  }
  return lines;
}

export function renderNode(
  node: BtXmlNode,
  depth: number,
  indentSize: number,
  diagnostics: Diagnostic[],
): string[] {
  const indent = " ".repeat(depth * indentSize);
  if (node.kind === "comment") return [`${indent}<!--${node.text}-->`];
  if (node.kind === "text") {
    const trimmed = node.text.trim();
    return trimmed ? [indentText(depth, escapeText(trimmed), indentSize)] : [];
  }

  const children = significantChildren(node.children || []);
  const isPort =
    node.kind === "element" && (node.name === "input_port" || node.name === "output_port");
  const text = (node.children || [])
    .filter((child) => child.kind === "text")
    .map((child) => child.text)
    .join("")
    .trim();
  const blockChildren = children.some(
    (child) => child.kind === "element" || child.kind === "comment",
  );
  if (text && blockChildren && !isPort) {
    diagnostics.push({
      code: "XML015_UNSUPPORTED_MIXED_CONTENT",
      severity: "error",
      message: "Mixed XML content is not supported by btxml-checker formatter",
      uri: "",
    });
  }

  if (text && !blockChildren) {
    if ((node.attributes || []).length <= 1) {
      const attrPart =
        (node.attributes || []).length === 0
          ? ""
          : ` ${node.attributes[0].name}="${escapeAttr(node.attributes[0].value)}"`;
      return [`${indent}<${node.name}${attrPart}>${escapeText(text)}</${node.name}>`];
    }
    return renderOpenTag(node, depth, `>${escapeText(text)}</${node.name}>`, indentSize);
  }

  if (children.length === 0) {
    if (node.selfClosing) {
      return renderOpenTag(node, depth, "/>".slice(0), indentSize);
    }
    const lines = renderOpenTag(node, depth, ">", indentSize);
    lines.push(`${indent}</${node.name}>`);
    return lines;
  }

  const lines = renderOpenTag(node, depth, ">", indentSize);
  for (const child of node.children || []) {
    if (child.kind === "text" && child.text.trim() === "") continue;
    lines.push(...renderNode(child, depth + 1, indentSize, diagnostics));
  }
  lines.push(`${indent}</${node.name}>`);
  return lines;
}
