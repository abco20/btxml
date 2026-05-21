import type { BtXmlElement } from "@btxml/syntax";
import type { RuleContext } from "../../context.js";
import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { getElementChildren, isStructuralElement } from "./shared.js";

const specialChildCountRules = new Map<string, { min: number; max: number }>([
  ["IfThenElse", { min: 2, max: 3 }],
  ["WhileDoElse", { min: 2, max: 3 }],
]);

function formatExpectedChildCount(min: number, max: number): string {
  return min === max ? String(min) : `${min}\u2013${max}`;
}

export const childCountRule: RuleModule = makeRuleModule({
  name: "model/valid-child-count",
  create(context) {
    return {
      Element(element) {
        if (isStructuralElement(element)) return;

        const usage = context.getNodeUsage(element);
        if (usage.model.status !== "resolved") return;

        checkChildCount(context, element, usage.model.model.id, usage.model.model.kind);
      },
    };
  },
});

function checkChildCount(
  context: RuleContext,
  element: BtXmlElement,
  nodeId: string,
  kind: string,
) {
  const childCount = getElementChildren(element).length;
  const special = specialChildCountRules.get(nodeId);

  if (special) {
    if (childCount < special.min || childCount > special.max) {
      const expected = formatExpectedChildCount(special.min, special.max);
      context.report({
        message: `\`${nodeId}\` requires ${expected} child node(s), but has ${childCount}.`,
        range: element.range,
      });
    }
    return;
  }

  if (kind === "Action" || kind === "Condition") {
    if (childCount > 0) {
      context.report({
        message: `${kind} node \`${nodeId}\` must not have child nodes, but has ${childCount}.`,
        range: element.range,
      });
    }
    return;
  }

  if (kind === "Decorator") {
    if (childCount !== 1) {
      context.report({
        message: `Decorator node \`${nodeId}\` must have exactly 1 child node, but has ${childCount}.`,
        range: element.range,
      });
    }
    return;
  }

  if (kind === "Control") {
    if (childCount < 1) {
      context.report({
        message: `Control node \`${nodeId}\` must have at least 1 child node.`,
        range: element.range,
      });
    }
    return;
  }

  if (kind === "SubTree" && childCount > 0) {
    context.report({
      message: `SubTree node \`${nodeId}\` must not have child nodes, but has ${childCount}.`,
      range: element.range,
    });
  }
}
