import { sourceRange } from "@btxml/foundation";
import type { SourceRange } from "@btxml/foundation";
import type { BtDocument, BtXmlAttribute } from "./ast.js";
import { positionAt } from "./position.js";

export function mapDecodedAttributeOffsetToRawOffset(
  attribute: BtXmlAttribute,
  decodedOffset: number,
): number {
  const offsets = attribute.valueOffsets;
  if (!offsets || offsets.length === 0) return decodedOffset;
  if (decodedOffset <= 0) return 0;
  if (decodedOffset >= offsets.length) return offsets[offsets.length - 1] ?? 0;
  return offsets[decodedOffset] ?? 0;
}

export function mapDecodedAttributeRangeToDocumentRange(
  document: BtDocument | { originalText: string },
  attribute: BtXmlAttribute,
  range: { start: number; end: number },
): SourceRange {
  const anchor = attribute.valueContentRange ?? attribute.valueRange;
  const rawStart = mapDecodedAttributeOffsetToRawOffset(attribute, range.start);
  const rawEnd = mapDecodedAttributeOffsetToRawOffset(attribute, range.end);
  const start = positionAt(document.originalText, anchor.start.offset + rawStart);
  const end = positionAt(document.originalText, anchor.start.offset + rawEnd);
  return sourceRange(start, end);
}
