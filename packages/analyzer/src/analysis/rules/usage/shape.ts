import { makeRuleModule } from "../../module.js";
import type { RuleModule } from "../../rule.js";
import { hasElementChildren, isStructuralElement } from "./shared.js";

export const shapeRules: RuleModule[] = [
  makeRuleModule({
    name: "model/no-childless-control-shape-mismatch",
    create(context) {
      return {
        Element(element) {
          if (isStructuralElement(element) || !element.selfClosing) return;

          const node = context.getTreeNodeView(element);
          if (node?.model.status !== "resolved") return;

          const kind = node.model.model.kind;
          if (kind !== "Control" && kind !== "Decorator") return;

          context.report({
            message: `${kind} node \`${node.model.model.id}\` normally expects child nodes.`,
            range: element.range,
          });
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/no-leaf-block-shape",
    create(context) {
      return {
        Element(element) {
          if (isStructuralElement(element) || element.selfClosing || hasElementChildren(element)) {
            return;
          }

          const node = context.getTreeNodeView(element);
          if (node?.model.status !== "resolved") return;

          const kind = node.model.model.kind;
          if (kind !== "Action" && kind !== "Condition" && kind !== "SubTree") return;

          context.report({
            message: `${kind} node \`${node.model.model.id}\` should be self-closing or have no children.`,
            range: element.range,
          });
        },
      };
    },
  }),
];
