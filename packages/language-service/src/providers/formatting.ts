import type { LanguageRequestContext } from "../context.js";
import { getFormattingEdits as formatDocument } from "../formatting.js";
import type { InternalFormattingInput } from "../internal-types.js";
import type { FormattingResult } from "../public-types.js";

export function getFormattingEdits(
  context: LanguageRequestContext,
  input: InternalFormattingInput,
): FormattingResult {
  return formatDocument(input, context.config.formatter);
}
