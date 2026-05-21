import type { RuleName } from "../../rules/registry.js";
import type { SuppressionIssue } from "../facts.js";
import { makeRuleModule } from "../module.js";
import type { RuleModule } from "../rule.js";

export const suppressionIssueRuleByKind = {
  unused: "suppression/no-unused",
  "missing-reason": "suppression/require-reason",
} as const satisfies Record<SuppressionIssue["kind"], RuleName>;

function makeSuppressionRule(kind: SuppressionIssue["kind"]) {
  return makeRuleModule({
    name: suppressionIssueRuleByKind[kind],
    create(context) {
      return {
        ProgramExit() {
          for (const issue of context.getSuppressionIssues(kind)) {
            context.report({
              message: issue.message,
              range: issue.range,
              data: suppressionIssueData(issue),
            });
          }
        },
      };
    },
  });
}

function suppressionIssueData(issue: SuppressionIssue) {
  return issue.code ? { code: issue.code } : undefined;
}

export const suppressionRules = [
  makeSuppressionRule("unused"),
  makeSuppressionRule("missing-reason"),
] satisfies RuleModule[];
