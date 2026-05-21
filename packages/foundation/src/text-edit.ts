import type { SourceRange } from "./range.js";

export type TextEdit = {
  readonly range: SourceRange;
  readonly newText: string;
};

export type WorkspaceEdit = {
  readonly uri: string;
  readonly edits: readonly TextEdit[];
};

export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .sort((a, b) => b.range.start.offset - a.range.start.offset)
    .reduce((current, edit) => {
      return (
        current.slice(0, edit.range.start.offset) +
        edit.newText +
        current.slice(edit.range.end.offset)
      );
    }, text);
}
