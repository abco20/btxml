import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { isStructuralElement } from "./shared.js";

export const unknownPortRule: RuleModule = makeRuleModule({
  name: "model/no-unknown-port",
  create(context) {
    return {
      Element(element) {
        if (isStructuralElement(element)) return;

        const usage = context.getNodeUsage(element);

        for (const portUsage of usage.portUsages) {
          if (portUsage.status !== "undeclared") continue;

          const definedPorts = usage.ports.map((port) => port.name).sort();
          const notes =
            definedPorts.length >= 1 && definedPorts.length <= 8
              ? [`note: defined ports: ${definedPorts.map((port) => `\`${port}\``).join(", ")}`]
              : undefined;

          context.report({
            message: `unknown port \`${portUsage.name}\``,
            range: portUsage.attribute.range,
            details:
              usage.tagForm === "subtree"
                ? {
                    primaryLabel:
                      usage.model.status === "resolved"
                        ? `node \`${usage.model.model.id}\` does not define this port`
                        : "SubTree does not define this port in strict mode",
                    help:
                      usage.model.status === "resolved"
                        ? `remove \`${portUsage.name}\` or add it to the \`${usage.model.model.id}\` SubTree model`
                        : `remove \`${portUsage.name}\`, add it to a SubTree model, or set the \`model/no-unknown-port\` rule option \`subTreePorts\` to \`loose\``,
                    notes,
                  }
                : undefined,
          });
        }
      },
    };
  },
});
