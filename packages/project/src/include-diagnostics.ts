import { RULES, type RuleName } from "@btxml/analyzer/rules";
import { normalizeRuleConfig } from "@btxml/analyzer/rules";
import type { EffectiveFileConfig } from "@btxml/config";
import {
  type Diagnostic,
  DiagnosticSeverity,
  createDiagnostic as diagnostic,
} from "@btxml/foundation";
import type { IncludeIssue } from "./analyzer-facts.js";

const includeIssueRuleByKind = {
  "missing-path": "include/require-path",
  "not-found": "include/no-missing-file",
  cycle: "include/no-cycle",
  "unresolved-variable": "include/no-unresolved-variable",
  "outside-root": "include/no-outside-root",
  "external-used": "include/report-external-used",
  "depth-exceeded": "include/no-depth-exceeded",
  "too-many-files": "include/no-too-many-files",
  "ros-package-resolver-missing": "include/require-ros-package-resolver",
  "ros-package-not-found": "include/no-missing-ros-package",
} as const satisfies Record<IncludeIssue["kind"], RuleName>;

function severityToDiagnosticSeverity(severity: "off" | "info" | "warn" | "error") {
  if (severity === "off") return undefined;
  if (severity === "info") return DiagnosticSeverity.Info;
  if (severity === "warn") return DiagnosticSeverity.Warning;
  return DiagnosticSeverity.Error;
}

function getRuleSeverity(config: EffectiveFileConfig, rule: RuleName) {
  const normalized = normalizeRuleConfig(config.linter.rules[rule]);
  if (normalized) return severityToDiagnosticSeverity(normalized.severity);
  return severityToDiagnosticSeverity(RULES[rule].defaultSeverity);
}

function includeIssueData(issue: IncludeIssue) {
  switch (issue.kind) {
    case "missing-path":
      return undefined;
    case "unresolved-variable":
      return { variable: issue.variable };
    case "ros-package-resolver-missing":
      return { packageName: issue.packageName };
    case "ros-package-not-found":
      return { packageName: issue.packageName, path: issue.path };
    case "cycle":
      return { path: issue.path, cycle: issue.cycle };
    default:
      return { path: issue.path };
  }
}

export function createIncludeIssueDiagnostics(input: {
  issues: IncludeIssue[];
  config: EffectiveFileConfig;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const issue of input.issues) {
    const rule = includeIssueRuleByKind[issue.kind];
    const severity = getRuleSeverity(input.config, rule);
    if (!severity) continue;

    const diag = diagnostic(
      RULES[rule].code,
      severity,
      issue.message,
      issue.range,
      issue.uri,
      undefined,
      includeIssueData(issue),
    );
    diagnostics.push({ ...diag, rule });
  }
  return diagnostics;
}
