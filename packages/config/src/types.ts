import type { Diagnostic } from "@btxml/foundation";
import type { RawBtxmlConfig, RuleConfig } from "./schema.js";

export type {
  ConfigSeverity,
  RawBtxmlConfig,
  RawBtxmlConfigInput,
  RawFilesConfig,
  RawFormatterConfig,
  RawLinterConfig,
  RawLinterSuppressionsConfig,
  RawModelsConfig,
  RawOverrideConfig,
  RawResolverConfig,
  RawResolverIncludesConfig,
  RuleConfig,
} from "./schema.js";

export type ResolvedFilesConfig = {
  include: string[];
  ignore: string[];
  useGitignore: boolean;
  followSymlinks: boolean;
  maxSize: number;
};

export type ResolvedResolverIncludesConfig = {
  elements: {
    name: string;
    attribute: string;
    base: "file" | "project-root";
  }[];
  variables: Record<string, string>;
  allowOutsideRoot: boolean;
  maxDepth: number;
  maxFiles: number;
};

export type ResolvedResolverConfig = {
  entrypoints: string[];
  includes: ResolvedResolverIncludesConfig;
  behaviorTreeIds: "workspace-unique" | "file-local-first" | "allow-ambiguous";
};

export type ModelConvention = "allow-unused" | "used-only" | "single-source";

export type ResolvedModelsConfig = {
  builtins: string[];
  files: string[];
  augmentations: string[];
  definitions: string[];
  inline: Record<string, unknown>;
  convention: ModelConvention;
};

export type ResolvedLinterSuppressionsConfig = {
  inline: "allow" | "deny";
};

export type ResolvedLinterConfig = {
  enabled: boolean;
  rules: Record<string, RuleConfig>;
  baseline: string | undefined;
  suppressions: ResolvedLinterSuppressionsConfig;
};

export type ResolvedFormatterConfig = {
  indentWidth: number;
  xmlDeclaration: "always" | "never" | "preserve";
  blankLineBetweenBehaviorTrees: boolean;
  lineEnding: "lf" | "crlf" | "auto";
};

export type PartialResolvedResolverConfig = {
  entrypoints?: ResolvedResolverConfig["entrypoints"];
  includes?: Partial<ResolvedResolverIncludesConfig>;
  behaviorTreeIds?: ResolvedResolverConfig["behaviorTreeIds"];
};

export type PartialResolvedModelsConfig = {
  builtins?: ResolvedModelsConfig["builtins"];
  files?: ResolvedModelsConfig["files"];
  augmentations?: ResolvedModelsConfig["augmentations"];
  definitions?: ResolvedModelsConfig["definitions"];
  inline?: ResolvedModelsConfig["inline"];
  convention?: ResolvedModelsConfig["convention"];
};

export type PartialResolvedLinterSuppressionsConfig = {
  inline?: ResolvedLinterSuppressionsConfig["inline"];
};

export type PartialResolvedLinterConfig = {
  enabled?: ResolvedLinterConfig["enabled"];
  rules?: ResolvedLinterConfig["rules"];
  baseline?: ResolvedLinterConfig["baseline"];
  suppressions?: PartialResolvedLinterSuppressionsConfig;
};

export type PartialResolvedFormatterConfig = {
  indentWidth?: ResolvedFormatterConfig["indentWidth"];
  xmlDeclaration?: ResolvedFormatterConfig["xmlDeclaration"];
  blankLineBetweenBehaviorTrees?: ResolvedFormatterConfig["blankLineBetweenBehaviorTrees"];
  lineEnding?: ResolvedFormatterConfig["lineEnding"];
};

export type ResolvedOverrideConfig = {
  files: string[];
  linter?: PartialResolvedLinterConfig;
  formatter?: PartialResolvedFormatterConfig;
};

export type ResolvedBtxmlConfig = {
  files: ResolvedFilesConfig;
  resolver: ResolvedResolverConfig;
  models: ResolvedModelsConfig;
  linter: ResolvedLinterConfig;
  formatter: ResolvedFormatterConfig;
  overrides: ResolvedOverrideConfig[];
};

export type EffectiveFileConfig = {
  files: ResolvedFilesConfig;
  resolver: ResolvedResolverConfig;
  models: ResolvedModelsConfig;
  linter: ResolvedLinterConfig;
  formatter: ResolvedFormatterConfig;
};

export type ConfigDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
  help?: string;
};

export type ConfigParseResult =
  | { ok: true; value: RawBtxmlConfig; diagnostics: ConfigDiagnostic[] }
  | { ok: false; diagnostics: ConfigDiagnostic[] };

export type ConfigNormalizeResult = {
  ok: boolean;
  config: ResolvedBtxmlConfig;
  diagnostics: Diagnostic[];
};
