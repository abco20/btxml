import type { LanguageRequestContext } from "./context.js";
import type { InternalDiagnosticsInput, InternalDiagnosticsResult } from "./internal-types.js";

export { buildParsedState } from "./parsed-state.js";

export function getDiagnostics(
  context: LanguageRequestContext,
  _input: InternalDiagnosticsInput,
): InternalDiagnosticsResult {
  return {
    diagnostics: context.diagnostics,
    document: context.parsed,
    partial: context.partial,
  };
}
