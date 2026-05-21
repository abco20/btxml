import type { EffectiveFileConfig } from "@btxml/config";
import { type Diagnostic, createDiagnostic as diagnostic } from "@btxml/foundation";
import { RULES } from "../rules/registry.js";
import type { SuppressionIssue } from "./facts.js";
import { suppressionIssueRuleByKind } from "./rules/suppression.js";
import { getEffectiveRuleSeverity } from "./severity.js";

const suppressionIssueCodeByKind = {
  unused: "BT351_UNUSED_SUPPRESSION",
  "missing-reason": "BT353_MISSING_SUPPRESSION_REASON",
} as const satisfies Record<SuppressionIssue["kind"], string>;

export function runSuppressionIssueRules(input: {
  issues: SuppressionIssue[];
  config: EffectiveFileConfig;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const issue of input.issues) {
    const rule = suppressionIssueRuleByKind[issue.kind];
    const severity = getEffectiveRuleSeverity({
      config: input.config,
      rule,
      defaultSeverity: RULES[rule].defaultSeverity,
    });
    if (!severity) continue;

    const diag = diagnostic(
      suppressionIssueCodeByKind[issue.kind],
      severity,
      issue.message,
      issue.range,
      issue.uri,
      undefined,
      issue.code ? { code: issue.code } : undefined,
    );
    diagnostics.push({ ...diag, rule });
  }
  return diagnostics;
}
