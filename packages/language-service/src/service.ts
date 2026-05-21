import type {
  InternalCodeActionsInput,
  InternalCompletionInput,
  InternalDefinitionInput,
  InternalDiagnosticsInput,
  InternalDocumentSymbolsInput,
  InternalFormattingInput,
  InternalHoverInput,
  InternalReferencesInput,
} from "./internal-types.js";
import type { InternalDiagnosticsResult } from "./internal-types.js";
import { buildLanguageRequestContext } from "./parsed-state.js";
import {
  getCodeActions,
  getCompletions,
  getDefinition,
  getDiagnostics,
  getDocumentSymbols,
  getFormattingEdits,
  getHover,
  getReferences,
} from "./providers/index.js";
import type { LanguageService, LanguageServiceOptions } from "./public-types.js";

function toPublicDiagnosticsResult(result: InternalDiagnosticsResult) {
  return {
    diagnostics: result.diagnostics,
    partial: result.partial || undefined,
  };
}

export function createLanguageService(options: LanguageServiceOptions = {}): LanguageService {
  return {
    getDiagnostics(input) {
      return toPublicDiagnosticsResult(
        getDiagnostics(
          buildLanguageRequestContext(input as InternalDiagnosticsInput, options),
          input as InternalDiagnosticsInput,
        ),
      );
    },
    getCompletions(input) {
      return getCompletions(
        buildLanguageRequestContext(input as InternalCompletionInput, options),
        input as InternalCompletionInput,
      );
    },
    getHover(input) {
      return getHover(
        buildLanguageRequestContext(input as InternalHoverInput, options),
        input as InternalHoverInput,
      );
    },
    getDefinition(input) {
      return getDefinition(
        buildLanguageRequestContext(input as InternalDefinitionInput, options),
        input as InternalDefinitionInput,
      );
    },
    getReferences(input) {
      return getReferences(
        buildLanguageRequestContext(input as InternalReferencesInput, options),
        input as InternalReferencesInput,
      );
    },
    getDocumentSymbols(input) {
      return getDocumentSymbols(
        buildLanguageRequestContext(input as InternalDocumentSymbolsInput, options),
        input as InternalDocumentSymbolsInput,
      );
    },
    getCodeActions(input) {
      return getCodeActions(
        buildLanguageRequestContext(input as InternalCodeActionsInput, options),
        input as InternalCodeActionsInput,
      );
    },
    getFormattingEdits(input) {
      return getFormattingEdits(
        buildLanguageRequestContext(input as InternalFormattingInput, options),
        input as InternalFormattingInput,
      );
    },
  };
}
