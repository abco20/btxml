import type { SourcePosition, SourceRange } from "./range.js";

export type TextDocument = {
  readonly uri: string;
  readonly languageId: "xml" | "btcpp-xml";
  readonly version: number;
  readonly text: string;
  positionAt(offset: number): SourcePosition;
  offsetAt(position: { line: number; character: number }): number;
  getText(range?: SourceRange): string;
};

type InternalTextDocument = TextDocument & {
  readonly lineOffsets: readonly number[];
};

function buildLineOffsets(text: string): number[] {
  const offsets = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createTextDocument(
  uri: string,
  text: string,
  version = 0,
  languageId: "xml" | "btcpp-xml" = "xml",
): TextDocument {
  const lineOffsets = buildLineOffsets(text);

  const positionAt = (offset: number): SourcePosition => {
    const safeOffset = clamp(offset, 0, text.length);
    let low = 0;
    let high = lineOffsets.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lineOffsets[mid] > safeOffset) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    const line = Math.max(0, low - 1);

    return {
      line,
      character: safeOffset - lineOffsets[line],
      offset: safeOffset,
    };
  };

  const offsetAt = (position: { line: number; character: number }): number => {
    const line = clamp(position.line, 0, Math.max(0, lineOffsets.length - 1));
    const start = lineOffsets[line];
    const end = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : text.length;

    return clamp(start + position.character, start, end);
  };

  const getText = (range?: SourceRange): string => {
    if (!range) return text;
    return text.slice(offsetAt(range.start), offsetAt(range.end));
  };

  const document: InternalTextDocument = {
    uri,
    languageId,
    version,
    text,
    lineOffsets,
    positionAt,
    offsetAt,
    getText,
  };

  return document;
}
