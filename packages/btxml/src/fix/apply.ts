import { applyTextEdits } from "@btxml/foundation";
import type { FixPlan } from "./types.ts";

export async function applyFixPlan(input: {
  plan: FixPlan;
  readText: (uri: string) => string;
  writeText: (uri: string, text: string) => void;
}): Promise<{
  originalTextByUri: Map<string, string>;
  fixedTextByUri: Map<string, string>;
}> {
  const originalTextByUri = new Map<string, string>();
  const fixedTextByUri = new Map<string, string>();

  for (const [uri, edits] of input.plan.editsByUri) {
    const originalText = input.readText(uri);
    const sorted = [...edits].sort(
      (left, right) => right.range.start.offset - left.range.start.offset,
    );
    const fixedText = applyTextEdits(originalText, sorted);

    originalTextByUri.set(uri, originalText);
    fixedTextByUri.set(uri, fixedText);
    input.writeText(uri, fixedText);
  }

  return {
    originalTextByUri,
    fixedTextByUri,
  };
}
