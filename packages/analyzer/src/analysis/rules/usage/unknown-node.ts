import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";

export const unknownNodeRule: RuleModule = makeRuleModule({
  name: "model/no-unknown-node",
  create(context) {
    return {
      Element(element) {
        const usage = context.getNodeUsage(element);

        if (
          usage.tagForm === "root" ||
          usage.tagForm === "behavior-tree" ||
          usage.tagForm === "tree-nodes-model" ||
          usage.tagForm === "include" ||
          usage.tagForm === "model-definition" ||
          usage.tagForm === "subtree" ||
          usage.tagForm === "unknown-xml"
        ) {
          return;
        }

        if (usage.model.status === "resolved" || usage.model.status === "ambiguous") {
          return;
        }

        const idAttribute = element.attributes.find((attribute) => attribute.name === "ID");

        context.report({
          message: `unknown node \`${usage.nodeType ?? usage.tagName}\``,
          range: idAttribute?.valueContentRange ?? idAttribute?.valueRange ?? element.range,
        });
      },
    };
  },
});
