import { RuleCodes } from "../../../rule-codes.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { getAnalyzedScriptAttributeCandidates, mapScriptRangeToDocument } from "./shared.js";

export const scriptValidExpressionTypeRule: RuleModule = makeRuleModule({
  name: "script/valid-expression-type",
  create(context) {
    return {
      Element(element) {
        for (const candidate of getAnalyzedScriptAttributeCandidates(context, element)) {
          if (!candidate.analysis) continue;

          for (const diagnostic of candidate.analysis.diagnostics) {
            if (diagnostic.code !== "invalid-operand-type") continue;

            context.report({
              code: RuleCodes.InvalidScriptOperandType,
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
