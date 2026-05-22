import { RuleCodes } from "../../../rule-codes.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { getAnalyzedScriptAttributeCandidates, mapScriptRangeToDocument } from "./shared.js";

export const scriptValidAssignmentRule: RuleModule = makeRuleModule({
  name: "script/valid-assignment",
  create(context) {
    return {
      Element(element) {
        for (const candidate of getAnalyzedScriptAttributeCandidates(context, element)) {
          if (!candidate.analysis) continue;

          for (const diagnostic of candidate.analysis.diagnostics) {
            const code =
              diagnostic.code === "assignment-to-unknown-variable"
                ? RuleCodes.AssignmentToUnknownVariable
                : diagnostic.code === "invalid-compound-assignment"
                  ? RuleCodes.InvalidCompoundAssignment
                  : diagnostic.code === "variable-type-mismatch"
                    ? RuleCodes.ScriptVariableTypeMismatch
                    : diagnostic.code === "invalid-global-blackboard-identifier"
                      ? RuleCodes.InvalidGlobalBlackboardIdentifier
                    : undefined;
            if (!code) continue;

            context.report({
              code,
              message: diagnostic.message,
              range: mapScriptRangeToDocument(context, candidate.attribute, diagnostic.range),
              details: diagnostic.details,
            });
          }
        }
      },
    };
  },
});
