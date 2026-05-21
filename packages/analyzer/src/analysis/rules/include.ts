import type { RuleName } from "../../rules/registry.js";
import type { IncludeIssue } from "../facts.js";
import { makeRuleModule } from "../module.js";
import type { RuleModule } from "../rule.js";

const includeIssueRuleByKind = {
  "missing-path": "include/require-path",
  "not-found": "include/no-missing-file",
  cycle: "include/no-cycle",
  "unresolved-variable": "include/no-unresolved-variable",
  "outside-root": "include/no-outside-root",
  "external-used": "include/report-external-used",
  "depth-exceeded": "include/no-depth-exceeded",
  "too-many-files": "include/no-too-many-files",
} as const satisfies Record<IncludeIssue["kind"], RuleName>;

function makeIncludeRule(kind: IncludeIssue["kind"]) {
  return makeRuleModule({
    name: includeIssueRuleByKind[kind],
    create(context) {
      return {
        ProgramExit() {
          for (const issue of context.getIncludeIssues(kind)) {
            context.report({
              message: issue.message,
              range: issue.range,
              data: includeIssueData(issue),
            });
          }
        },
      };
    },
  });
}

function includeIssueData(issue: IncludeIssue) {
  switch (issue.kind) {
    case "missing-path":
      return undefined;
    case "unresolved-variable":
      return { variable: issue.variable };
    case "cycle":
      return { path: issue.path, cycle: issue.cycle };
    default:
      return { path: issue.path };
  }
}

export const includeRules = [
  makeIncludeRule("missing-path"),
  makeIncludeRule("not-found"),
  makeIncludeRule("cycle"),
  makeIncludeRule("outside-root"),
  makeIncludeRule("unresolved-variable"),
  makeIncludeRule("depth-exceeded"),
  makeIncludeRule("too-many-files"),
  makeIncludeRule("external-used"),
] satisfies RuleModule[];
