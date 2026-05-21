import { type SourcePosition, type SourceRange, sourceRange } from "@btxml/foundation";
import type {
  BtDocument,
  BtXmlAttribute,
  BtXmlElement,
  TextLikeDocument,
  XmlCursorContext,
} from "@btxml/syntax";
import { inspectXmlCursor } from "@btxml/syntax";

export function fullDocumentRange(document: {
  text: string;
  positionAt(offset: number): SourcePosition;
}): SourceRange {
  return sourceRange(document.positionAt(0), document.positionAt(document.text.length));
}

export type InspectResult = {
  element?: BtXmlElement;
  attribute?: BtXmlAttribute;
  nodeKind?: XmlCursorContext["kind"];
  valuePrefix?: string;
  tagNamePrefix?: string;
  tagText?: string;
  replacementRange?: SourceRange;
};

function toInspectResult(context: XmlCursorContext): InspectResult {
  switch (context.kind) {
    case "tag-name":
      return {
        nodeKind: context.kind,
        element: context.element,
        replacementRange: context.replacementRange,
      };
    case "attribute-name":
      return {
        nodeKind: context.kind,
        element: context.element,
        attribute: context.attribute,
      };
    case "attribute-value":
      return {
        nodeKind: context.kind,
        element: context.element,
        attribute: context.attribute,
        valuePrefix: context.valuePrefix,
      };
    case "closing-tag-name":
      return {
        nodeKind: context.kind,
        tagNamePrefix: context.tagNamePrefix,
        tagText: context.tagText,
        replacementRange: context.replacementRange,
      };
    case "element":
      return {
        nodeKind: context.kind,
        element: context.element,
      };
    case "comment":
    case "text":
    case "unknown":
      return {
        nodeKind: context.kind,
      };
  }
}

export function inspectDocument(
  document: TextLikeDocument,
  parsed?: BtDocument,
  position?: SourcePosition,
): InspectResult {
  return toInspectResult(
    inspectXmlCursor({
      document,
      parsed,
      position: position ?? document.positionAt(0),
    }),
  );
}
