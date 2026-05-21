import type { TextEdit } from "@btxml/foundation";
import { sourceRange } from "@btxml/foundation";
import type { BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import type { BtTextDocument } from "./internal-types.js";

export function insertAtLineStart(document: BtTextDocument, line: number, text: string): TextEdit {
  const pos = document.positionAt(document.offsetAt({ line, character: 0 }));
  return { range: sourceRange(pos, pos), newText: text };
}

export function removeAttributeEdit(
  document: BtTextDocument,
  attribute: BtXmlAttribute,
): TextEdit | undefined {
  const start = attribute.fullRange?.start || attribute.range.start;
  let begin = start.offset;
  while (begin > 0 && /[ \t]/.test(document.text[begin - 1] || "")) begin -= 1;
  const range = sourceRange(
    document.positionAt(begin),
    document.positionAt(attribute.range.end.offset),
  );
  return { range, newText: "" };
}

export function addAttributeEdit(
  document: BtTextDocument,
  element: BtXmlElement,
  name: string,
): TextEdit {
  const closeOffset = Math.max(
    element.openTagRange.end.offset - (element.selfClosing ? 2 : 1),
    element.openTagRange.start.offset,
  );
  const pos = document.positionAt(closeOffset);
  return { range: sourceRange(pos, pos), newText: ` ${name}=""` };
}
