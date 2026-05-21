import { sourcePosition } from "@btxml/foundation";
import type { SourcePosition } from "@btxml/foundation";

export function positionAt(text: string, offset: number): SourcePosition {
  let line = 0;
  let character = 0;
  for (let i = 0; i < Math.min(offset, text.length); i++) {
    if (text[i] === "\n") {
      line++;
      character = 0;
    } else {
      character++;
    }
  }
  return sourcePosition(line, character, offset);
}
