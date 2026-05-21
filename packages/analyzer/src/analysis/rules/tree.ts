import {
  getBehaviorTreeIds,
  getBehaviorTrees,
  getDocumentModel,
  hasBehaviorTree,
} from "@btxml/semantic";
import type { BtXmlElement } from "@btxml/syntax";
import { RuleCodes } from "../../rule-codes.js";
import { makeRuleModule } from "../module.js";

function getAttr(element: BtXmlElement, name: string) {
  return element.attributes.find((attr) => attr.name === name);
}

export const treeRules = [
  makeRuleModule({
    name: "tree/require-id",
    create(context) {
      return {
        Element(element) {
          if (element.name !== "BehaviorTree" || getAttr(element, "ID")) return;
          context.report({ message: "BehaviorTree must have ID attribute", range: element.range });
        },
      };
    },
  }),
  makeRuleModule({
    name: "tree/no-duplicate-id-in-file",
    create(context) {
      const seen = new Set<string>();
      return {
        ProgramExit() {
          const model = getDocumentModel(context.semantic, context.document.uri);
          for (const bt of model?.behaviorTrees ?? []) {
            if (!bt.idRange) continue;
            if (seen.has(bt.id)) {
              context.report({ message: `Duplicate BehaviorTree ID: ${bt.id}`, range: bt.idRange });
            }
            seen.add(bt.id);
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "tree/no-duplicate-id",
    create(context) {
      return {
        ProgramExit() {
          if (context.config.resolver.behaviorTreeIds === "allow-ambiguous") return;
          for (const id of getBehaviorTreeIds(context.semantic)) {
            const defs = getBehaviorTrees(context.semantic, id);
            if (defs.length <= 1) continue;
            const uris = new Set(defs.map((def) => def.uri));
            if (uris.size <= 1) continue;
            const localDefs = defs.filter((def) => def.uri === context.document.uri);
            if (localDefs.length > 0) {
              context.report({
                message: `Duplicate BehaviorTree ID: ${id}`,
                range: localDefs[0]?.idRange,
              });
            }
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "tree/no-unknown-main-tree",
    create(context) {
      return {
        Document() {
          const root = context.document.root;
          if (context.document.kind !== "bt-document" || !root) return;
          const mainTree = getAttr(root, "main_tree_to_execute");
          if (!mainTree?.value || hasBehaviorTree(context.semantic, mainTree.value)) return;
          context.report({
            message: `main_tree_to_execute references unknown BehaviorTree: ${mainTree.value}`,
            range: mainTree.range,
          });
        },
      };
    },
  }),
  makeRuleModule({
    name: "tree/no-unknown-subtree",
    create(context) {
      return {
        Element(element) {
          if (element.name !== "SubTree") return;
          const call = context.getSubTreeCallView(element);
          const idAttr =
            call?.node.element.attributes.find((attr) => attr.name === "ID") ??
            getAttr(element, "ID");
          if (!idAttr) return;
          if (call?.target.status === "resolved") return;
          const resolution = context.resolveSubTree(idAttr.value, context.document.uri);
          if (resolution.status !== "unresolved") return;
          context.report({
            message: `unknown subtree \`${idAttr.value}\``,
            range: idAttr.valueContentRange || idAttr.valueRange,
          });
        },
      };
    },
  }),
  makeRuleModule({
    name: "tree/no-ambiguous-subtree",
    create(context) {
      return {
        Element(element) {
          if (element.name !== "SubTree") return;
          const idAttr = getAttr(element, "ID");
          if (!idAttr) return;
          const call = context.getSubTreeCallView(element);
          if (call?.target.status === "resolved") return;
          const resolution = context.resolveSubTree(idAttr.value, context.document.uri);
          if (resolution.status !== "ambiguous" || resolution.behaviorTrees.length <= 1) {
            return;
          }
          context.report({
            message: `ambiguous subtree \`${idAttr.value}\``,
            range: idAttr.valueContentRange || idAttr.valueRange,
          });
        },
      };
    },
  }),
  makeRuleModule({
    name: "tree/no-duplicate-node-model-id",
    meta: {
      description: "TreeNodesModel elements must have unique IDs within the same model block.",
    },
    create() {
      return {};
    },
  }),
];
