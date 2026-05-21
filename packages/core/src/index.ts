export { formatBtXml } from "@btxml/syntax";

export { validateBtXml } from "@btxml/analyzer";

export {
  parseBtxmlConfig,
  normalizeBtxmlConfig,
  getEffectiveConfigForFile,
  getEffectiveConfigForUri,
  createInitConfig,
} from "@btxml/config";

export { checkBtXml } from "./check-bt-xml.js";

export type {
  Diagnostic,
  DiagnosticData,
  DiagnosticDetails,
  RelatedInformation,
  SourcePosition,
  SourceRange,
  TextDocument,
  TextEdit,
  WorkspaceEdit,
} from "@btxml/foundation";

export type { FormatOptions, FormatResult } from "@btxml/syntax";

export type { ValidateOptions, ValidateResult } from "@btxml/analyzer";

export type {
  ConfigSeverity,
  RuleConfig,
  RawBtxmlConfig,
  RawBtxmlConfigInput,
  ResolvedBtxmlConfig,
  EffectiveFileConfig,
  ConfigDiagnostic,
  ConfigParseResult,
  ConfigNormalizeResult,
} from "@btxml/config";

export type { CheckOptions, CheckResult } from "./check-bt-xml.js";
