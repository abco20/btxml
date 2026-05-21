import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { isStructuralElement } from "./shared.js";

export const requiredPortRule: RuleModule = makeRuleModule({
  name: "model/require-port",
  create(context) {
    return {
      Element(element) {
        if (isStructuralElement(element)) return;

        const usage = context.getNodeUsage(element);
        if (usage.tagForm === "subtree" && usage.allowsArbitraryAttributes) return;
        if (usage.model.status !== "resolved" && usage.tagForm !== "subtree") return;

        for (const port of usage.ports) {
          if (!port.required) continue;

          const hasBinding = usage.portUsages.some(
            (binding) => binding.name === port.name && binding.status === "resolved",
          );
          if (hasBinding) continue;

          context.report({
            message: `missing required port \`${port.name}\``,
            range: element.range,
            details:
              usage.tagForm === "subtree"
                ? {
                    primaryLabel:
                      usage.model.status === "resolved"
                        ? `node \`${usage.model.model.id}\` requires port \`${port.name}\``
                        : `SubTree requires port \`${port.name}\``,
                    help: `add \`${port.name}="..."\` or provide a blackboard reference such as \`${port.name}="{value}"\``,
                  }
                : undefined,
          });
        }
      },
    };
  },
});
