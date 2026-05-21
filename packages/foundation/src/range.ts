export type SourcePosition = {
  line: number;
  character: number;
  offset: number;
};

export type SourceRange = {
  start: SourcePosition;
  end: SourcePosition;
};

export function sourcePosition(line: number, character: number, offset: number): SourcePosition {
  return { line, character, offset };
}

export function sourceRange(start: SourcePosition, end: SourcePosition): SourceRange {
  return { start, end };
}

export function containsOffset(range: SourceRange | undefined, offset: number) {
  if (!range) return false;
  return range.start.offset <= offset && offset <= range.end.offset;
}
