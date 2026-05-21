import type { ConfigDiagnostic, RawBtxmlConfig, RawLinterConfig } from "@btxml/config";
import { isRuleName, normalizeRuleConfig, validateRuleOptions } from "./severity.js";

export function validateRawConfigRules(raw: RawBtxmlConfig): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];

  collectRuleDiagnostics(raw.linter, "linter.rules", diagnostics);

  for (const [index, override] of (raw.overrides ?? []).entries()) {
    collectRuleDiagnostics(override.linter, `overrides.${index}.linter.rules`, diagnostics);
  }

  return diagnostics;
}

function collectRuleDiagnostics(
  linter: RawLinterConfig | undefined,
  rulesPath: string,
  diagnostics: ConfigDiagnostic[],
): void {
  for (const [rule, value] of Object.entries(linter?.rules ?? {})) {
    const rulePath = `${rulesPath}.${rule}`;

    if (!isRuleName(rule)) {
      diagnostics.push({
        code: "CFG010_UNKNOWN_RULE",
        severity: "error",
        path: rulePath,
        message: `unknown lint rule \`${rule}\``,
        help: "see docs/rules.md for a list of valid rule names",
      });
      continue;
    }

    const normalized = normalizeRuleConfig(value);
    if (!normalized?.options) continue;

    for (const diagnostic of validateRuleOptions(rule, normalized.options)) {
      diagnostics.push({
        code: "CFG011_INVALID_RULE_OPTION",
        severity: "error",
        path: optionDiagnosticPath(rulePath, normalized.options, diagnostic.message),
        message: diagnostic.message,
        help: diagnostic.details?.help,
      });
    }
  }
}

function optionDiagnosticPath(
  rulePath: string,
  options: Record<string, unknown>,
  message: string,
): string {
  const option = Object.keys(options).find((key) => message.includes(`\`${key}\``));
  return option ? `${rulePath}.1.${option}` : `${rulePath}.1`;
}
