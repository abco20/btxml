import { type SourceRange, type TextDocument, sourceRange } from "@btxml/foundation";
import type { BtXmlAttribute } from "@btxml/syntax";
import { completion } from "../completions.js";
import type { CompletionItem } from "../public-types.js";
import { type BlackboardSymbol, formatBlackboardReference } from "./blackboard-symbols.js";

function rangeFromOffsets(
  document: TextDocument,
  startOffset: number,
  endOffset: number,
): SourceRange {
  return sourceRange(document.positionAt(startOffset), document.positionAt(endOffset));
}

function getBlackboardReplacementRange(
  document: TextDocument,
  attribute: BtXmlAttribute,
  cursorOffset: number,
) {
  const valueContentRange = attribute.valueContentRange;
  if (!valueContentRange) return undefined;

  const valueStart = valueContentRange.start.offset;
  const valueEnd = valueContentRange.end.offset;
  const value = document.text.slice(valueStart, valueEnd);
  const startsInBraces = value.startsWith("{");
  const endsInBraces = value.endsWith("}");

  if (startsInBraces && cursorOffset > valueStart) {
    const innerStart = valueStart + 1;
    const innerEnd = endsInBraces ? valueEnd - 1 : valueEnd;
    return {
      replacementRange: rangeFromOffsets(document, innerStart, Math.max(innerStart, innerEnd)),
      wrapsReference: false,
    };
  }

  return {
    insertText: attribute.value,
    replacementRange: valueContentRange,
    wrapsReference: true,
  };
}

export function createBlackboardCompletionItem(args: {
  document: TextDocument;
  attribute: BtXmlAttribute;
  cursorOffset: number;
  symbol: BlackboardSymbol;
  detail: string;
}): CompletionItem {
  const { document, attribute, cursorOffset, symbol, detail } = args;
  const replacement = getBlackboardReplacementRange(document, attribute, cursorOffset);
  const label = formatBlackboardReference(symbol.key);
  const newText = replacement?.wrapsReference ? label : symbol.key;

  return completion(
    label,
    "Reference",
    detail,
    replacement
      ? {
          range: replacement.replacementRange,
          newText,
        }
      : undefined,
    {
      filterText: `${symbol.key} ${label}`,
      insertText: newText,
    },
  );
}
