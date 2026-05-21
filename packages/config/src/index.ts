export type {
  ConfigSeverity,
  RuleConfig,
  RawFilesConfig,
  ResolvedFilesConfig,
  RawResolverIncludesConfig,
  ResolvedResolverIncludesConfig,
  RawResolverConfig,
  ResolvedResolverConfig,
  RawModelsConfig,
  ResolvedModelsConfig,
  RawLinterSuppressionsConfig,
  ResolvedLinterSuppressionsConfig,
  RawLinterConfig,
  ResolvedLinterConfig,
  RawFormatterConfig,
  ResolvedFormatterConfig,
  RawOverrideConfig,
  ResolvedOverrideConfig,
  RawBtxmlConfig,
  RawBtxmlConfigInput,
  ResolvedBtxmlConfig,
  EffectiveFileConfig,
  ConfigDiagnostic,
  ConfigParseResult,
  ConfigNormalizeResult,
} from "./types.js";

export {
  CONFIG_ROOT_FIELDS,
  SEVERITIES,
  BEHAVIOR_TREE_ID_POLICIES,
} from "./spec.js";

export {
  getDefaultBtxmlConfig,
  getDefaultResolvedBtxmlConfig,
} from "./presets.js";

export { mergeBtxmlConfig } from "./merge.js";
export { normalizeBtxmlConfig } from "./normalize.js";
export { parseBtxmlConfig } from "./validate.js";
export { createInitConfig } from "./init.js";
export {
  fileUriToPath,
  getEffectiveConfigForFile,
  getEffectiveConfigForUri,
  isIncludedFilePath,
  isIncludedUri,
} from "./effective.js";
export { matchOverrides, fileMatchesPattern } from "./overrides.js";
