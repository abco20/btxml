import type { EffectiveFileConfig } from "@btxml/config";
import { formatBtXml } from "@btxml/syntax";
import type { FormattingInput, FormattingResult } from "./public-types.js";
import { fullDocumentRange } from "./ranges.js";

export function getFormattingEdits(
  input: FormattingInput,
  config?: EffectiveFileConfig["formatter"],
): FormattingResult {
  const formatted = formatBtXml(input.document.text, {
    indentWidth: config?.indentWidth,
    xmlDeclaration: config?.xmlDeclaration,
    blankLineBetweenBehaviorTrees: config?.blankLineBetweenBehaviorTrees,
    lineEnding: config?.lineEnding,
  });
  if (!formatted.ok || formatted.skipped) {
    return { edits: [], diagnostics: formatted.diagnostics };
  }
  if (formatted.text === input.document.text) return { edits: [], diagnostics: [] };
  return {
    edits: [{ range: fullDocumentRange(input.document), newText: formatted.text }],
    diagnostics: [],
  };
}
