import { isScriptTypeBoolCompatible } from "@btxml/script";
import { RuleCodes } from "../../../rule-codes.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { getAnalyzedScriptAttributeCandidates, mapScriptRangeToDocument } from "./shared.js";

export const scriptValidResultTypeRule: RuleModule = makeRuleModule({
  name: "script/valid-result-type",
  create(context) {
    return {
      Element(element) {
        for (const candidate of getAnalyzedScriptAttributeCandidates(context, element)) {
          if (candidate.info.expectedResult !== "bool-compatible") continue;
          if (!candidate.parseResult.ok || !candidate.analysis) continue;

          const finalExpression = candidate.parseResult.program.statements.at(-1);
          const finalType = candidate.analysis.finalType;
          if (!finalExpression || !finalType || isScriptTypeBoolCompatible(finalType)) continue;

          context.report({
            code: RuleCodes.ScriptResultNotBoolCompatible,
            message: `script result for \`${candidate.attribute.name}\` is not bool-compatible`,
            range: mapScriptRangeToDocument(context, candidate.attribute, finalExpression.range),
            details: {
              primaryLabel: "script result is not bool-compatible here",
              help: "return a boolean or numeric expression, or move side effects into a postcondition/script node",
            },
          });
        }
      },
    };
  },
});
