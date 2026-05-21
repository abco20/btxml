import type {
  PartialResolvedFormatterConfig,
  PartialResolvedLinterConfig,
  PartialResolvedModelsConfig,
  PartialResolvedResolverConfig,
  RawBtxmlConfigInput,
  RawFilesConfig,
  RawFormatterConfig,
  RawLinterConfig,
  RawModelsConfig,
  RawResolverConfig,
  ResolvedBtxmlConfig,
  ResolvedFilesConfig,
  ResolvedFormatterConfig,
  ResolvedLinterConfig,
  ResolvedModelsConfig,
  ResolvedOverrideConfig,
  ResolvedResolverConfig,
} from "./types.js";

export function mergeBtxmlConfig(
  base: RawBtxmlConfigInput,
  override: RawBtxmlConfigInput,
): RawBtxmlConfigInput {
  return {
    ...base,
    ...override,
    files:
      base.files || override.files
        ? { ...(base.files ?? {}), ...(override.files ?? {}) }
        : undefined,
    resolver:
      base.resolver || override.resolver
        ? { ...(base.resolver ?? {}), ...(override.resolver ?? {}) }
        : undefined,
    models:
      base.models || override.models
        ? { ...(base.models ?? {}), ...(override.models ?? {}) }
        : undefined,
    linter:
      base.linter || override.linter
        ? {
            ...(base.linter ?? {}),
            ...(override.linter ?? {}),
            rules: {
              ...(base.linter?.rules ?? {}),
              ...(override.linter?.rules ?? {}),
            },
          }
        : undefined,
    formatter:
      base.formatter || override.formatter
        ? { ...(base.formatter ?? {}), ...(override.formatter ?? {}) }
        : undefined,
    overrides: [...(base.overrides ?? []), ...(override.overrides ?? [])],
  };
}

export function mergeRawFilesConfig(
  base: RawFilesConfig,
  override: RawFilesConfig,
): RawFilesConfig {
  return { ...base, ...override };
}

export function mergeRawResolverConfig(
  base: RawResolverConfig,
  override: RawResolverConfig,
): RawResolverConfig {
  return { ...base, ...override };
}

export function mergeRawModelsConfig(
  base: RawModelsConfig,
  override: RawModelsConfig,
): RawModelsConfig {
  return { ...base, ...override };
}

export function mergeRawLinterConfig(
  base: RawLinterConfig,
  override: RawLinterConfig,
): RawLinterConfig {
  return { ...base, ...override };
}

export function mergeRawFormatterConfig(
  base: RawFormatterConfig,
  override: RawFormatterConfig,
): RawFormatterConfig {
  return { ...base, ...override };
}

export function mergeResolvedFilesConfig(
  base: ResolvedFilesConfig,
  override: Partial<ResolvedFilesConfig>,
): ResolvedFilesConfig {
  return { ...base, ...override };
}

export function mergeResolvedResolverConfig(
  base: ResolvedResolverConfig,
  override: Partial<ResolvedResolverConfig>,
): ResolvedResolverConfig {
  return { ...base, ...override };
}

export function mergeResolvedModelsConfig(
  base: ResolvedModelsConfig,
  override: Partial<ResolvedModelsConfig>,
): ResolvedModelsConfig {
  return { ...base, ...override };
}

export function mergeResolvedLinterConfig(
  base: ResolvedLinterConfig,
  override: Partial<ResolvedLinterConfig>,
): ResolvedLinterConfig {
  return { ...base, ...override };
}

export function mergeResolvedFormatterConfig(
  base: ResolvedFormatterConfig,
  override: Partial<ResolvedFormatterConfig>,
): ResolvedFormatterConfig {
  return { ...base, ...override };
}

export function mergeResolvedBtxmlConfig(
  base: ResolvedBtxmlConfig,
  override: {
    files?: Partial<ResolvedFilesConfig>;
    resolver?: PartialResolvedResolverConfig;
    models?: PartialResolvedModelsConfig;
    linter?: PartialResolvedLinterConfig;
    formatter?: PartialResolvedFormatterConfig;
    overrides?: ResolvedOverrideConfig[];
  },
): ResolvedBtxmlConfig {
  return {
    files: override.files ? { ...base.files, ...override.files } : base.files,
    resolver: override.resolver
      ? {
          ...base.resolver,
          ...override.resolver,
          includes: {
            ...base.resolver.includes,
            ...(override.resolver.includes || {}),
            variables: {
              ...base.resolver.includes.variables,
              ...(override.resolver.includes?.variables || {}),
            },
          },
        }
      : base.resolver,
    models: override.models ? { ...base.models, ...override.models } : base.models,
    linter: override.linter
      ? {
          ...base.linter,
          ...override.linter,
          rules: override.linter.rules
            ? { ...base.linter.rules, ...override.linter.rules }
            : base.linter.rules,
          suppressions: override.linter.suppressions
            ? { ...base.linter.suppressions, ...override.linter.suppressions }
            : base.linter.suppressions,
        }
      : base.linter,
    formatter: override.formatter ? { ...base.formatter, ...override.formatter } : base.formatter,
    overrides: override.overrides ? [...base.overrides, ...override.overrides] : base.overrides,
  };
}
