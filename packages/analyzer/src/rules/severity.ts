import { SEVERITIES, type ConfigSeverity as Severity } from "@btxml/config";
import { DiagnosticSeverity, createDiagnostic as diagnostic } from "@btxml/foundation";
import type { z } from "zod";
export { getNodeUsagePolicyForRules } from "./options.js";
import { RULES, type RuleName, type RuleRegistryEntry } from "./registry.js";

export function isRuleName(value: string): value is RuleName {
  return value in RULES;
}

export function getRuleNameForCode(code: string): RuleName | undefined {
  for (const [name, rule] of Object.entries(RULES)) {
    const entry: RuleRegistryEntry = rule;
    if (entry.code === code || entry.codes?.includes(code)) {
      return name as RuleName;
    }
  }
  return undefined;
}

export function getDiagnosticCodeForRule(rule: RuleName): string {
  return RULES[rule].code;
}

export function normalizeRuleConfig(
  input: unknown,
): { severity: Severity; options?: Record<string, unknown> } | null {
  if (typeof input === "string") {
    if (SEVERITIES.includes(input as Severity)) {
      return { severity: input as Severity };
    }
    return null;
  }

  if (Array.isArray(input) && input.length >= 1 && input.length <= 2) {
    const [severity, options] = input;
    if (
      typeof severity === "string" &&
      SEVERITIES.includes(severity as Severity) &&
      (options === undefined ||
        (typeof options === "object" && options !== null && !Array.isArray(options)))
    ) {
      const result: { severity: Severity; options?: Record<string, unknown> } = {
        severity: severity as Severity,
      };
      if (options !== undefined) {
        result.options = options as Record<string, unknown>;
      }
      return result;
    }
  }

  return null;
}

export function getRuleSeverity(rules: Record<string, unknown>, rule: RuleName): Severity {
  const configured = rules[rule];
  if (configured !== undefined) {
    const normalized = normalizeRuleConfig(configured);
    if (normalized) {
      return normalized.severity;
    }
  }
  return RULES[rule].defaultSeverity;
}

export function validateRuleOptions(
  rule: RuleName,
  options: Record<string, unknown>,
): ReturnType<typeof diagnostic>[] {
  const diagnostics: ReturnType<typeof diagnostic>[] = [];
  const entry: RuleRegistryEntry = RULES[rule];
  const schema = entry.optionsSchema;
  if (!schema) return diagnostics;

  const result = schema.safeParse(options);
  if (result.success) return diagnostics;

  for (const issue of result.error.issues) {
    diagnostics.push(...ruleOptionIssueToDiagnostics(rule, issue));
  }

  return diagnostics;
}

function ruleOptionIssueToDiagnostics(rule: RuleName, issue: z.core.$ZodIssue) {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) =>
      diagnostic(
        "CFG011_INVALID_RULE_OPTION",
        DiagnosticSeverity.Error,
        `unknown option \`${String(key)}\` for rule \`${rule}\``,
        undefined,
        undefined,
        { help: validOptionsHelp(rule) },
      ),
    );
  }

  const key = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
  return [
    diagnostic(
      "CFG011_INVALID_RULE_OPTION",
      DiagnosticSeverity.Error,
      key
        ? `invalid option \`${key}\`: ${issue.message}`
        : `invalid options for rule \`${rule}\`: ${issue.message}`,
      undefined,
      undefined,
      { help: validOptionsHelp(rule) },
    ),
  ];
}

function validOptionsHelp(rule: RuleName) {
  const entry: RuleRegistryEntry = RULES[rule];
  const options = entry.options?.map((option) => option.name) ?? [];
  return options.length > 0 ? `valid options are: ${options.join(", ")}` : undefined;
}
