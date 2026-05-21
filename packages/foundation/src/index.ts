export {
  DiagnosticSeverity,
  createDiagnostic,
  isErrorDiagnostic,
  hasErrorDiagnostics,
  countDiagnosticsBySeverity,
} from "./diagnostic.js";

export type {
  Diagnostic,
  DiagnosticData,
  DiagnosticDetails,
  RelatedInformation,
} from "./diagnostic.js";

export {
  sourcePosition,
  sourceRange,
  containsOffset,
} from "./range.js";

export type {
  SourcePosition,
  SourceRange,
} from "./range.js";

export { createTextDocument } from "./text-document.js";

export type { TextDocument } from "./text-document.js";

export { applyTextEdits } from "./text-edit.js";

export type {
  TextEdit,
  WorkspaceEdit,
} from "./text-edit.js";

export type { Result } from "./result.js";
