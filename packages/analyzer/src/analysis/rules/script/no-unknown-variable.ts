import { RuleCodes } from "../../../rule-codes.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { getAnalyzedScriptAttributeCandidates, mapScriptRangeToDocument } from "./shared.js";

export const scriptNoUnknownVariableRule: RuleModule = makeRuleModule({
  name: "script/no-unknown-variable",
  create(context) {
    return {
      Element(element) {
        for (const candidate of getAnalyzedScriptAttributeCandidates(context, element)) {
          if (!candidate.analysis) continue;

          for (const identifier of candidate.analysis.unknownIdentifiers) {
            context.report({
              code: RuleCodes.UnknownScriptVariable,
              message: `unknown script variable \`${identifier.name}\``,
              range: mapScriptRangeToDocument(context, candidate.attribute, identifier.range),
              details: {
                primaryLabel: `\`${identifier.name}\` is not defined in the script environment`,
                help: "introduce it earlier with `:=`, add a matching blackboard remap, or define a script enum in btxml.model-augment.json",
              },
            });
          }
        }
      },
    };
  },
});
