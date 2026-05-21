export { createLanguageService } from "./service.js";
export { createWorkspaceService } from "./workspace-service.js";
export { completion, replaceRange, uniqueItems } from "./completions.js";
export type { LanguageRequestContext } from "./context.js";
export { getDiagnostics } from "./diagnostics.js";
export { addAttributeEdit, insertAtLineStart, removeAttributeEdit } from "./edits.js";
export { getFormattingEdits } from "./formatting.js";
export { buildLanguageRequestContext, buildParsedState } from "./parsed-state.js";
export { fullDocumentRange } from "./ranges.js";
export { buildSymbolsForElement } from "./symbols.js";
export {
  getCodeActions,
  getCompletions,
  getDefinition,
  getDefinitionLocations,
  getDocumentSymbols,
  getFormattingEdits as getProviderFormattingEdits,
  getHover,
  getReferences,
} from "./providers/index.js";

export type * from "./internal-types.js";
export type * from "./public-types.js";
export type { LanguageRequestInput } from "./parsed-state.js";
