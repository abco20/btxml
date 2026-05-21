import { DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import { mergeResolvedBtxmlConfig } from "./merge.js";
import { STRICT_CONFIG_OVERRIDES, getDefaultResolvedBtxmlConfig } from "./presets.js";
import type {
  ConfigDiagnostic,
  ConfigNormalizeResult,
  PartialResolvedFormatterConfig,
  PartialResolvedLinterConfig,
  RawBtxmlConfig,
  RawOverrideConfig,
  ResolvedBtxmlConfig,
  ResolvedOverrideConfig,
} from "./types.js";
import { parseBtxmlConfig } from "./validate.js";

function normalizeRawFormatterOverrideConfig(
  raw: RawBtxmlConfig["formatter"],
): PartialResolvedFormatterConfig | undefined {
  if (!raw) return undefined;
  const out: PartialResolvedFormatterConfig = {};
  if (raw.indentWidth !== undefined) out.indentWidth = raw.indentWidth;
  if (raw.xmlDeclaration !== undefined) out.xmlDeclaration = raw.xmlDeclaration;
  if (raw.blankLineBetweenBehaviorTrees !== undefined) {
    out.blankLineBetweenBehaviorTrees = raw.blankLineBetweenBehaviorTrees;
  }
  if (raw.lineEnding !== undefined) out.lineEnding = raw.lineEnding;
  return out;
}

function normalizeRawLinterOverrideConfig(
  raw: RawOverrideConfig["linter"],
): PartialResolvedLinterConfig | undefined {
  if (!raw) return undefined;
  const out: PartialResolvedLinterConfig = {};
  if (raw.rules !== undefined) out.rules = raw.rules;
  if (raw.suppressions !== undefined) {
    out.suppressions = {};
    if (raw.suppressions.inline !== undefined) {
      out.suppressions.inline = raw.suppressions.inline;
    }
  }
  return out;
}

function toFoundationDiagnostics(configDiagnostics: ConfigDiagnostic[]) {
  return configDiagnostics.map((diagnostic) =>
    createDiagnostic(
      diagnostic.code,
      diagnostic.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      diagnostic.message,
      undefined,
      "",
      diagnostic.help ? { help: diagnostic.help } : undefined,
    ),
  );
}

function normalizeParsedBtxmlConfig(raw: RawBtxmlConfig): ConfigNormalizeResult {
  const diagnostics: ReturnType<typeof createDiagnostic>[] = [];
  let config = getDefaultResolvedBtxmlConfig();

  const { $schema: _rawSchema, strict, overrides: rawOverrides, ...rawConfig } = raw;

  if (strict) {
    config = mergeResolvedBtxmlConfig(
      config,
      STRICT_CONFIG_OVERRIDES as unknown as Partial<ResolvedBtxmlConfig>,
    );
  }

  config = mergeResolvedBtxmlConfig(config, rawConfig as unknown as Partial<ResolvedBtxmlConfig>);

  config.overrides = (rawOverrides ?? []).map(
    (override): ResolvedOverrideConfig => ({
      files: override.files,
      linter: normalizeRawLinterOverrideConfig(override.linter),
      formatter: normalizeRawFormatterOverrideConfig(override.formatter),
    }),
  );

  const ok = !diagnostics.some((d) => d.severity === DiagnosticSeverity.Error);
  return { config, diagnostics, ok };
}

export function normalizeBtxmlConfig(raw: unknown): ConfigNormalizeResult {
  const parsed = parseBtxmlConfig(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      config: getDefaultResolvedBtxmlConfig(),
      diagnostics: toFoundationDiagnostics(parsed.diagnostics),
    };
  }

  return normalizeParsedBtxmlConfig(parsed.value);
}
