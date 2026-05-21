import type { LanguageRequestContext } from "../context.js";
import type { InternalDocumentSymbolsInput } from "../internal-types.js";
import type { DocumentSymbolsResult } from "../public-types.js";
import { buildSymbolsForElement } from "../symbols.js";

export function getDocumentSymbols(
  context: LanguageRequestContext,
  _input: InternalDocumentSymbolsInput,
): DocumentSymbolsResult {
  if (!context.parsed?.root) return { symbols: [] };
  return { symbols: [buildSymbolsForElement(context.parsed.root)] };
}
