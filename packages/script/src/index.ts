export { classifyScriptAttribute } from "./classifier.js";
export { analyzeScript } from "./analysis/infer.js";
export { getScriptCompletions, getScriptCursorContext } from "./completion.js";
export {
  analyzeScriptFlow,
  areScriptTypesCompatible,
  cloneScriptEnvironment,
  commonScriptType,
  collectScriptEnums,
  createScriptEnvironment,
  isScriptTypeAssignable,
  isScriptTypeBoolCompatible,
  scriptTypeFromResolvedType,
  scriptTypeFromTypeName,
} from "./analysis/environment.js";
export { collectScriptIdentifiers, isScriptIdentifier } from "./analysis/symbols.js";
export { parseProgram, parseScript } from "./parser.js";
export { tokenizeScript } from "./tokenizer.js";

export type { ScriptAttributeInfo, ScriptAttributeKind } from "./classifier.js";
export type {
  ScriptCompletionInput,
  ScriptCompletionItem,
  ScriptCursorContext,
} from "./completion.js";
export type {
  AnalyzeScriptInput,
  AnalyzeScriptResult,
  CreateScriptEnvironmentInput,
  ScriptAnalysisDiagnostic,
  ScriptAnalysisDiagnosticCode,
  ScriptEnvironment,
  ScriptEnvironmentSymbolInput,
  ScriptFlowEntry,
  ScriptFlowEntryResult,
  ScriptIdentifierAccess,
  ScriptIdentifierAccessKind,
  ResolvedScriptIdentifier,
  ScriptSymbol,
  ScriptSymbolSource,
  ScriptType,
} from "./analysis/types.js";

export type {
  ParseScriptResult,
  ScriptParseError,
  ScriptParseErrorKind,
} from "./parser.js";

export type {
  ScriptAssignmentExpression,
  ScriptBinaryExpression,
  ScriptComparisonChain,
  ScriptConditionalExpression,
  ScriptExpression,
  ScriptIdentifier,
  ScriptLiteral,
  ScriptNode,
  ScriptProgram,
  ScriptRange,
  ScriptUnaryExpression,
} from "./ast.js";

export type { ScriptToken, ScriptTokenType } from "./tokenizer.js";
