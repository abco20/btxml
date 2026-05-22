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
    const innerValueStart = value[1] === "@" ? innerStart + 1 : innerStart;
    const innerEnd = endsInBraces ? valueEnd - 1 : valueEnd;
    return {
      replacementRange: rangeFromOffsets(
        document,
        innerValueStart,
        Math.max(innerValueStart, innerEnd),
      ),
      wrapsReference: false,
      hasScopeMarker: value[1] === "@",
    };
  }

  return {
    insertText: attribute.value,
    replacementRange: valueContentRange,
    wrapsReference: true,
    hasScopeMarker: false,
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
  const wrapsReference = replacement?.wrapsReference ?? false;
  const hasScopeMarker = replacement?.hasScopeMarker ?? false;
  const label = replacement?.wrapsReference
    ? formatBlackboardReference(symbol)
    : symbol.scope === "global"
      ? `@${symbol.key}`
      : symbol.key;
  const newText = wrapsReference
    ? formatBlackboardReference(symbol)
    : symbol.scope === "global"
      ? hasScopeMarker
        ? symbol.key
        : `@${symbol.key}`
      : symbol.key;

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
      filterText:
        `${symbol.key} ${label} ${symbol.scope === "global" ? `@${symbol.key}` : ""}`.trim(),
      insertText: newText,
    },
  );
}
