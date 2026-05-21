import type { RuleName } from "@btxml/analyzer/rules";
import { RuleCodes, getRuleSeverity } from "@btxml/analyzer/rules";
import type { EffectiveFileConfig } from "@btxml/config";
import {
  type Diagnostic,
  DiagnosticSeverity,
  createDiagnostic as diagnostic,
} from "@btxml/foundation";
import type { SuppressionIssue } from "./analyzer-facts.js";

const suppressionIssueRuleByKind = {
  unused: "suppression/no-unused",
  "missing-reason": "suppression/require-reason",
} as const satisfies Record<SuppressionIssue["kind"], RuleName>;

const suppressionIssueCodeByKind = {
  unused: RuleCodes.UnusedSuppression,
  "missing-reason": RuleCodes.MissingSuppressionReason,
} as const satisfies Record<SuppressionIssue["kind"], string>;

function severityToDiagnosticSeverity(severity: "off" | "info" | "warn" | "error") {
  if (severity === "off") return undefined;
  if (severity === "info") return DiagnosticSeverity.Info;
  if (severity === "warn") return DiagnosticSeverity.Warning;
  return DiagnosticSeverity.Error;
}

function getDiagnosticSeverity(config: EffectiveFileConfig, rule: RuleName) {
  return severityToDiagnosticSeverity(getRuleSeverity(config.linter.rules, rule));
}

export function runSuppressionIssueRules(input: {
  issues: SuppressionIssue[];
  config: EffectiveFileConfig;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const issue of input.issues) {
    const rule = suppressionIssueRuleByKind[issue.kind];
    const severity = getDiagnosticSeverity(input.config, rule);
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
