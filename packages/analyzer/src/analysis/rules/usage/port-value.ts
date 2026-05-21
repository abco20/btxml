import { getTypeDefinition, getTypeRegistry } from "@btxml/semantic";
import { RuleCodes } from "../../../rule-codes.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { isStructuralElement, reportLiteralValidation } from "./shared.js";

export const portValueRule: RuleModule = makeRuleModule({
  name: "model/valid-port-value",
  create(context) {
    return {
      Element(element) {
        if (isStructuralElement(element)) return;

        const usage = context.getNodeUsage(element);
        if (usage.model.status !== "resolved" && usage.tagForm !== "subtree") return;

        for (const attr of element.attributes) {
          const portUsage = context.getPortUsage(element, attr.name);
          if (portUsage?.status !== "resolved") continue;
          reportLiteralValidation(context, {
            port: portUsage.port,
            value: attr.value,
            range: attr.range,
            registry: getTypeRegistry(context.semantic),
            typeDefinition: getTypeDefinition(context.semantic, portUsage.port.type),
            allowRemap: true,
            diagnosticCode: RuleCodes.InvalidPortValueType,
            customLiteralDiagnosticCode: RuleCodes.CustomLiteralRequiresValidator,
            portLabel: attr.name,
          });
        }
      },
    };
  },
});
