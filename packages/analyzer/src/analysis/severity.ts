import type { EffectiveFileConfig, ConfigSeverity as Severity } from "@btxml/config";
import {
  DiagnosticSeverity,
  type DiagnosticSeverity as DiagnosticSeverityType,
} from "@btxml/foundation";
import type { RuleName } from "../rules/registry.js";
import { normalizeRuleConfig } from "../rules/severity.js";

export function severityToDiagnosticSeverity(
  severity: Severity,
): DiagnosticSeverityType | undefined {
  if (severity === "off") return undefined;
  if (severity === "info") return DiagnosticSeverity.Info;
  if (severity === "warn") return DiagnosticSeverity.Warning;
  return DiagnosticSeverity.Error;
}

export function getConfiguredRuleOptions(
  config: EffectiveFileConfig,
  rule: RuleName,
): Record<string, unknown> {
  const normalized = normalizeRuleConfig(config.linter.rules[rule]);
  return normalized?.options ?? {};
}

export function getEffectiveRuleSeverity(input: {
  config: EffectiveFileConfig;
  rule: RuleName;
  defaultSeverity: Severity;
}): DiagnosticSeverityType | undefined {
  const normalized = normalizeRuleConfig(input.config.linter.rules[input.rule]);
  if (normalized) return severityToDiagnosticSeverity(normalized.severity);

  return severityToDiagnosticSeverity(input.defaultSeverity);
}
