import { findIncompleteOpenStartTag, findJustClosedStartTag, scanXmlPrefix } from "@btxml/syntax";
import type * as vscode from "vscode";

export type OpenStartTagContext = {
  tagName: string;
  openTagLine: number;
  openTagColumn: number;
  baseIndent: string;
  firstAttributeColumn?: number;
  isClosedBeforePosition: boolean;
  closingTokenBeforePosition?: ">" | "/>";
};

function trimTypedLineBreakBeforeOffset(text: string, endOffset: number) {
  let offset = endOffset;
  const lineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;

  while (offset > lineStart && (text[offset - 1] === " " || text[offset - 1] === "\t")) {
    offset -= 1;
  }
  while (offset > 0 && (text[offset - 1] === "\n" || text[offset - 1] === "\r")) {
    offset -= 1;
  }

  return offset;
}

export function findOpenStartTagContextBeforePosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): OpenStartTagContext | undefined {
  const text = document.getText();
  const endOffset = trimTypedLineBreakBeforeOffset(text, document.offsetAt(position));
  const scan = scanXmlPrefix(text, endOffset);
  if (scan.context !== "text") return undefined;

  const closedTag = findJustClosedStartTag(text, endOffset);
  const tag = closedTag ?? findIncompleteOpenStartTag(text, endOffset);
  if (!tag) return undefined;

  const openTagPosition = document.positionAt(tag.tagStartOffset);
  const openTagLine = document.lineAt(openTagPosition.line);
  const baseIndent = openTagLine.text.slice(0, openTagPosition.character);

  return {
    tagName: tag.tagName,
    openTagLine: openTagPosition.line,
    openTagColumn: openTagPosition.character,
    baseIndent,
    firstAttributeColumn:
      tag.firstAttributeOffset === undefined
        ? undefined
        : document.positionAt(tag.firstAttributeOffset).character,
    isClosedBeforePosition: closedTag !== undefined,
    closingTokenBeforePosition: closedTag?.closingToken,
  };
}
