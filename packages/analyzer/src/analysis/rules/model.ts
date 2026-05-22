import {
  formatBlackboardReference,
  makeBlackboardIdentity,
  type PortDef,
  type ResolvedTypeDefinition,
  getInvalidPortNameReason,
} from "@btxml/model";
import {
  areTypesCompatible,
  getModelConflicts,
  getTypeDefinition,
  getTypeRegistry,
} from "@btxml/semantic";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import { RuleCodes } from "../../rule-codes.js";
import { makeRuleModule } from "../module.js";
import type { RuleModule } from "../rule.js";
import {
  getExactBlackboardReference,
  getResolvedPortType,
  getResolvedPortTypeDefinition,
  reportLiteralValidation,
} from "./usage/shared.js";

export const modelRules = [
  makeRuleModule({
    name: "model/require-port-name",
    meta: { description: "Port elements require a name attribute." },
    create(context) {
      return {
        TreeNodeModel(node) {
          for (const port of node.ports) {
            if (port.name) continue;
            context.report({
              message: "Port must have name attribute",
              range: port.range || port.nameRange || node.idRange || node.range,
            });
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/no-duplicate-port-name",
    meta: { description: "Ports with the same name are not allowed." },
    create(context) {
      return {
        TreeNodeModel(node) {
          const seenPorts = new Set<string>();
          for (const port of node.ports) {
            if (!port.name) continue;
            if (seenPorts.has(port.name)) {
              context.report({
                message: `Duplicate port name "${port.name}" in ${node.id}`,
                range: port.nameRange || port.range || node.idRange || node.range,
              });
            }
            seenPorts.add(port.name);
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/valid-port-name",
    meta: { description: "Port names must be valid XML attribute names for BT nodes." },
    create(context) {
      return {
        TreeNodeModel(node) {
          for (const port of node.ports) {
            if (!port.name) continue;

            const reason = getInvalidPortNameReason(port.name);
            if (!reason) continue;

            context.report({
              code: RuleCodes.InvalidPortName,
              message: `invalid port name \`${port.name}\`: ${reason}`,
              range: port.nameRange || port.range || node.idRange || node.range,
              details: {
                primaryLabel: `invalid port name \`${port.name}\``,
                help: "rename the port to a non-reserved XML attribute name without forbidden characters",
              },
            });
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/no-conflicting-definition",
    create(context) {
      return {
        ProgramExit() {
          for (const conflict of getModelConflicts(context.semantic)) {
            if (conflict.uri && conflict.uri !== context.document.uri) continue;
            if (hasLocalDuplicateModelDiagnostic(context.document, conflict.id)) continue;
            context.report({
              code: conflict.code,
              message: conflict.message,
              range: conflict.range,
              details: conflict.details,
              data: conflict.data,
              relatedInformation: conflict.relatedInformation,
            });
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/valid-port-default-value",
    meta: { description: "TreeNodesModel port defaults must match the declared type." },
    create(context) {
      return {
        Element(element) {
          if (!isPortElement(element)) return;

          const defaultAttr =
            element.attributes.find((attr) => attr.name === "default") ??
            element.attributes.find((attr) => attr.name === "default_value");
          if (!defaultAttr) return;

          const portName = element.attributes.find((attr) => attr.name === "name")?.value;
          if (!portName) return;

          const modelElement = findTreeNodeModelAncestor(context.document.root, element);
          const modelId = modelElement?.attributes.find((attr) => attr.name === "ID")?.value;
          if (!modelId) return;

          const model = context.getNodeModel(modelId);
          const port = model?.ports.find((candidate) => candidate.name === portName);
          if (!port) return;

          if (port.direction === "output") {
            if (getExactBlackboardReference(port.name, defaultAttr.value) === undefined) {
              context.report({
                code: RuleCodes.InvalidPortDefaultValue,
                message: `output port default for \`${port.name}\` must be a blackboard remap`,
                range: defaultAttr.range,
                details: {
                  primaryLabel: `output port default for \`${port.name}\` must be a blackboard remap`,
                  help: `use \`${port.name}="{${port.name}}"\` or \`${port.name}="{=}"\``,
                },
              });
            }
            return;
          }

          reportLiteralValidation(context, {
            port,
            value: defaultAttr.value,
            range: defaultAttr.range,
            registry: getTypeRegistry(context.semantic),
            typeDefinition: getTypeDefinition(context.semantic, port.type),
            allowRemap: true,
            diagnosticCode: RuleCodes.InvalidPortDefaultValue,
            customLiteralDiagnosticCode: RuleCodes.CustomLiteralRequiresValidator,
            portLabel: port.name,
          });
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/no-blackboard-type-mismatch",
    meta: {
      description: "Blackboard entries must not mix incompatible resolved port types.",
    },
    create(context) {
      return {
        ProgramExit() {
          const typeRegistry = getTypeRegistry(context.semantic);
          const bindingsByIdentity = new Map<string, BlackboardBindingRecord[]>();
          const allowStringEntryCompatibility =
            (context.options as { allowStringEntryCompatibility?: boolean })
              .allowStringEntryCompatibility ?? true;

          for (const node of context.view.nodes) {
            for (const binding of node.portBindings) {
              if (binding.declaredPort.status !== "resolved") continue;

              const reference = getExactBlackboardReference(binding.name, binding.value);
              if (!reference) continue;

              const typeDefinition = getResolvedPortTypeDefinition(
                typeRegistry,
                binding.declaredPort.port,
              );
              if (!typeDefinition || typeDefinition.kind === "any") continue;

              const identity = makeBlackboardIdentity(reference);
              const records = bindingsByIdentity.get(identity) ?? [];
              records.push({
                key: reference.key,
                scope: reference.scope,
                displayName: formatBlackboardReference(reference),
                identity,
                nodeId: describeBindingNode(node.element),
                port: binding.declaredPort.port,
                typeDefinition,
                range: binding.attribute.range,
              });
              bindingsByIdentity.set(identity, records);
            }
          }

          for (const bindings of bindingsByIdentity.values()) {
            const incompatibleTypes = collectIncompatibleTypes(
              context.semantic,
              bindings,
              allowStringEntryCompatibility,
            );
            if (incompatibleTypes.length < 2) continue;

            const primary = bindings.find(
              (binding) => binding.typeDefinition.canonical === incompatibleTypes[0],
            );

            context.report({
              code: RuleCodes.BlackboardTypeMismatch,
              message: `blackboard entry \`${primary?.displayName ?? bindings[0]?.displayName ?? bindings[0]?.key ?? ""}\` is used with incompatible port types: ${incompatibleTypes.map((type) => `\`${type}\``).join(", ")}`,
              range: primary?.range,
              details: {
                primaryLabel: `blackboard entry \`${primary?.displayName ?? bindings[0]?.displayName ?? bindings[0]?.key ?? ""}\` mixes incompatible port types`,
                notes: bindings
                  .filter((binding) => incompatibleTypes.includes(binding.typeDefinition.canonical))
                  .map(
                    (binding) =>
                      `${binding.nodeId}.${binding.port.name} declares ${formatPortType(binding.port, binding.typeDefinition)}`,
                  ),
                help: "use different blackboard keys, align the port types, or declare compatibility in btxml.model-augment.json",
              },
            });
          }
        },
      };
    },
  }),
  makeRuleModule({
    name: "model/require-output-port-remap",
    meta: {
      description: "Resolved output ports must write to a blackboard remap.",
    },
    create(context) {
      return {
        Element(element) {
          if (isStructuralElement(element)) return;

          const usage = context.getNodeUsage(element);
          if (usage.model.status !== "resolved" && usage.tagForm !== "subtree") return;

          for (const attr of element.attributes) {
            const portUsage = context.getPortUsage(element, attr.name);
            if (portUsage?.status !== "resolved") continue;
            if (portUsage.port.direction !== "output") continue;
            if (getExactBlackboardReference(portUsage.port.name, attr.value) !== undefined) continue;

            context.report({
              code: RuleCodes.OutputPortRequiresRemap,
              message: `output port \`${portUsage.port.name}\` must be remapped to a blackboard entry`,
              range: attr.range,
              details: {
                primaryLabel: `output port \`${portUsage.port.name}\` requires a blackboard remap`,
                help: `use \`${portUsage.port.name}="{${portUsage.port.name}}"\` or \`${portUsage.port.name}="{some_key}"\``,
              },
            });
          }
        },
      };
    },
  }),
] satisfies RuleModule[];

type BlackboardBindingRecord = {
  key: string;
  scope: "local" | "global";
  displayName: string;
  identity: string;
  nodeId: string;
  port: PortDef;
  typeDefinition: ResolvedTypeDefinition;
  range: PortDef["range"];
};

function hasLocalDuplicateModelDiagnostic(document: BtDocument, nodeId: string) {
  return document.diagnostics.some(
    (diag) =>
      diag.code === RuleCodes.DuplicateNodeModelId && diag.message.includes(`\`${nodeId}\``),
  );
}

function isPortElement(element: BtXmlElement) {
  return (
    element.name === "input_port" || element.name === "output_port" || element.name === "inout_port"
  );
}

function findTreeNodeModelAncestor(root: BtXmlElement | undefined, target: BtXmlElement) {
  if (!root) return undefined;

  return walk(root, false, undefined);

  function walk(
    element: BtXmlElement,
    inTreeNodesModel: boolean,
    currentModel: BtXmlElement | undefined,
  ): BtXmlElement | undefined {
    const nextInTreeNodesModel = inTreeNodesModel || element.name === "TreeNodesModel";
    const nextModel =
      nextInTreeNodesModel &&
      (element.name === "Action" ||
        element.name === "Condition" ||
        element.name === "Control" ||
        element.name === "Decorator" ||
        element.name === "SubTree")
        ? element
        : currentModel;

    if (element === target) return nextModel;

    for (const child of element.children) {
      if (child.kind !== "element") continue;
      const found = walk(child, nextInTreeNodesModel, nextModel);
      if (found) return found;
    }

    return undefined;
  }
}

function collectIncompatibleTypes(
  semantic: Parameters<typeof areTypesCompatible>[0],
  bindings: BlackboardBindingRecord[],
  allowStringEntryCompatibility: boolean,
) {
  const incompatible = new Set<string>();

  for (let index = 0; index < bindings.length; index += 1) {
    const left = bindings[index];
    if (!left) continue;
    for (let otherIndex = index + 1; otherIndex < bindings.length; otherIndex += 1) {
      const right = bindings[otherIndex];
      if (!right) continue;
      if (
        allowStringEntryCompatibility &&
        (left.typeDefinition.canonical === "std::string" ||
          right.typeDefinition.canonical === "std::string")
      ) {
        continue;
      }
      if (
        areTypesCompatible(semantic, left.typeDefinition.canonical, right.typeDefinition.canonical)
      ) {
        continue;
      }
      incompatible.add(left.typeDefinition.canonical);
      incompatible.add(right.typeDefinition.canonical);
    }
  }

  return [...incompatible].sort();
}

function formatPortType(
  port: Pick<PortDef, "effectiveType" | "type">,
  typeDefinition: ResolvedTypeDefinition,
) {
  return getResolvedPortType(port) ?? typeDefinition.canonical;
}

function describeBindingNode(element: BtXmlElement) {
  return (
    element.attributes.find((attr) => attr.name === "name")?.value ??
    element.attributes.find((attr) => attr.name === "ID")?.value ??
    element.name
  );
}

function isStructuralElement(element: BtXmlElement) {
  return (
    element.name === "root" || element.name === "BehaviorTree" || element.name === "TreeNodesModel"
  );
}
