import { RuleCodes } from "../../../rule-codes.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import {
  attributeScriptRange,
  getScriptAttributeCandidates,
  mapScriptRangeToDocument,
} from "./shared.js";

export const scriptValidSyntaxRule: RuleModule = makeRuleModule({
  name: "script/valid-syntax",
  create(context) {
    return {
      Element(element) {
        for (const candidate of getScriptAttributeCandidates(context, element)) {
          if (candidate.parseResult.ok) continue;

          for (const error of candidate.parseResult.errors) {
            const code =
              error.kind === "empty-script"
                ? RuleCodes.EmptyScript
                : error.kind === "invalid-token"
                  ? RuleCodes.InvalidScriptToken
                  : RuleCodes.InvalidScriptSyntax;

            context.report({
              code,
              message: error.message,
              range:
                error.kind === "empty-script"
                  ? (candidate.attribute.valueContentRange ??
                    candidate.attribute.valueRange ??
                    mapScriptRangeToDocument(
                      context,
                      candidate.attribute,
                      attributeScriptRange(candidate.attribute),
                    ))
                  : mapScriptRangeToDocument(context, candidate.attribute, error.range),
              details: {
                primaryLabel: `invalid script in \`${candidate.attribute.name}\``,
              },
            });
          }
        }
      },
    };
  },
});
