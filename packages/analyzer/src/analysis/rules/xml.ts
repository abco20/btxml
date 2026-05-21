import type { EffectiveFileConfig } from "@btxml/config";
import type { BtXmlElement } from "@btxml/syntax";
import { RuleCodes } from "../../rule-codes.js";
import { makeRuleModule } from "../module.js";
import type { RuleModule } from "../rule.js";

function getAttr(element: BtXmlElement, name: string) {
  return element.attributes.find((attr) => attr.name === name);
}

function topLevelAllowedNames(config: EffectiveFileConfig) {
  const elements = config.resolver.includes.elements;
  return new Set(["BehaviorTree", "TreeNodesModel", ...elements.map((entry) => entry.name)]);
}

export const xmlRules = [
  makeRuleModule({
    name: "xml/valid-root",
    create(context) {
      return {
        Document() {
          const root = context.document.root;
          if (context.document.kind !== "bt-document" || !root || root.name === "root") return;
          context.report({ message: "Root element must be <root>", range: root.range });
        },
      };
    },
  }),
  {
    name: "xml/require-btcpp-format",
    code: RuleCodes.MissingBTCPPFormat,
    defaultSeverity: "error",
    meta: { description: 'Root element must declare BTCPP_format="4".' },
    create(context) {
      return {
        Document() {
          const root = context.document.root;
          if (context.document.kind !== "bt-document" || !root) return;
          const btcpp = getAttr(root, "BTCPP_format");
          if (btcpp?.value === "4") return;
          context.report({ message: 'Root element must have BTCPP_format="4"', range: root.range });
        },
      };
    },
  },
  makeRuleModule({
    name: "xml/no-unknown-top-level-element",
    meta: {
      description:
        "Top-level elements must be BehaviorTree, TreeNodesModel, or configured include elements.",
    },
    create(context) {
      return {
        Element(element) {
          const root = context.document.root;
          if (context.document.kind !== "bt-document" || !root || element === root) return;
          if (
            !root.children.includes(element) ||
            topLevelAllowedNames(context.config).has(element.name)
          )
            return;
          context.report({
            message: `Unknown top-level element: ${element.name}`,
            range: element.range,
          });
        },
      };
    },
  }),
] satisfies RuleModule[];
