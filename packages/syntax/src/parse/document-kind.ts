import { DiagnosticSeverity } from "@btxml/foundation";
import type { BtDocument, BtDocumentKind, BtXmlElement, BtXmlNode } from "../ast.js";
import type { ParseOptions, ParseResult } from "../types.js";

export function finalizeDocumentKind(input: {
  document: BtDocument;
  diagnostics: ParseResult["diagnostics"];
  partial: boolean;
  options: ParseOptions;
}): ParseResult {
  const { document, diagnostics, options, partial } = input;
  const hasErrors = diagnostics.some((diag) => diag.severity === DiagnosticSeverity.Error);

  let kind: BtDocumentKind = "generic-xml";
  if (hasErrors) {
    kind = "invalid-xml";
  } else if (document.root) {
    const root = document.root;
    const hasBehaviorTree = root.children.some(
      (c) => c.kind === "element" && c.name === "BehaviorTree",
    );
    const hasTreeNodesModel = root.children.some(
      (c) => c.kind === "element" && c.name === "TreeNodesModel",
    );
    const hasFormat4 = root.attributes.some((a) => a.name === "BTCPP_format" && a.value === "4");

    const isModelOnly =
      root.name === "TreeNodesModel" ||
      (root.name === "root" && !hasBehaviorTree && hasTreeNodesModel);

    if (options.kind === "model-xml" || isModelOnly) {
      kind = "model-document";
    } else if (root.name === "BehaviorTree") {
      kind = "bt-document";
    } else if (root.name === "root" && (hasFormat4 || hasBehaviorTree)) {
      kind = "bt-document";
    } else if (options.kind === "bt-xml") {
      kind = "bt-document";
    }
  }

  document.kind = kind;
  document.isBtXml = kind === "bt-document" || kind === "model-document";

  if (!hasErrors && !partial) {
    return {
      ok: true,
      document,
      diagnostics,
      partial: false,
    };
  }

  return {
    ok: false,
    document,
    diagnostics,
    partial,
  };
}

export function hasMixedContent(element: BtXmlElement): boolean {
  if (element.name === "input_port" || element.name === "output_port") return false;
  const children = element.children || [];
  const hasText = children.some((c) => c.kind === "text" && c.text.trim() !== "");
  const hasElement = children.some((c) => c.kind === "element");
  return hasText && hasElement;
}

export function walkMixedContent(node: BtXmlNode, visit: (node: BtXmlElement) => void) {
  if (node.kind !== "element") return;
  if (hasMixedContent(node)) {
    visit(node);
  }
  for (const child of node.children || []) {
    walkMixedContent(child, visit);
  }
}
