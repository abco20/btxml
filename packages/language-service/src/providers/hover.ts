import { type TreeNodeModelDef, resolveNodeUsage, resolvePortUsage } from "@btxml/semantic";
import { findPortBindingAtPosition, findTreeNodeAtPosition } from "@btxml/semantic/ast-view";
import { inspectXmlCursor } from "@btxml/syntax";
import type { LanguageRequestContext } from "../context.js";
import type { InternalHoverInput } from "../internal-types.js";
import type { HoverResult } from "../public-types.js";
import {
  describeScriptSymbol,
  formatScriptType,
  getScriptIdentifierTarget,
} from "./script-context.js";

function describePort(port: TreeNodeModelDef["ports"][number]) {
  return [
    `**Port** \`${port.name}\``,
    "",
    `Direction: ${port.direction}  `,
    `Type: \`${port.type || "unknown"}\`  `,
    `Required: ${port.required ? "yes" : "no"}${port.description ? `  \nDescription: ${port.description}` : ""}`,
  ].join("\n");
}

function describeModel(model: TreeNodeModelDef) {
  const kind =
    model.source === "builtin" ? `${model.kind.toLowerCase()} node` : `${model.kind} node`;
  return `**${kind[0].toUpperCase()}${kind.slice(1)}** \`${model.id}\`${model.ports.length ? `\n\nPorts: ${model.ports.map((port) => `\`${port.name}\``).join(", ")}` : ""}`;
}

function describeAmbiguousSubTree(id: string, uris: readonly string[]) {
  return `**SubTree** \`${id}\`\n\nResolves ambiguously across ${uris.length} candidates:\n${uris
    .map((uri) => `- \`${uri}\``)
    .join("\n")}`;
}

function getSubTreeCandidateLabels(
  candidates: readonly { uri?: string; idRange?: { start: { offset: number } } }[],
  fallbackUri: string,
) {
  return candidates.map((candidate) => {
    const uri = candidate.uri || fallbackUri;
    const offset = candidate.idRange?.start.offset ?? -1;
    return `${uri}:${offset}`;
  });
}

export function getHover(context: LanguageRequestContext, input: InternalHoverInput): HoverResult {
  const scriptTarget = getScriptIdentifierTarget(context, input.position);
  if (scriptTarget) {
    if (scriptTarget.reference.kind === "enum") {
      return {
        range: scriptTarget.range,
        contents: `**Enum** \`${scriptTarget.reference.name}\`\n\nValue: \`${scriptTarget.reference.value}\``,
      };
    }

    if (scriptTarget.reference.kind === "global-blackboard") {
      const symbol = scriptTarget.reference.symbol;
      return {
        range: scriptTarget.range,
        contents: symbol
          ? [
              `**Global Blackboard** \`@${scriptTarget.reference.key}\``,
              "",
              `Type: \`${formatScriptType(symbol.type)}\``,
              `Source: ${describeScriptSymbol(symbol)}`,
            ].join("\n")
          : `**Global Blackboard** \`@${scriptTarget.reference.key}\``,
      };
    }

    const symbol = scriptTarget.reference.symbol;
    return {
      range: scriptTarget.range,
      contents: [
        `**Script Symbol** \`${symbol.name}\``,
        "",
        `Type: \`${formatScriptType(symbol.type)}\``,
        `Source: ${describeScriptSymbol(symbol)}`,
      ].join("\n"),
    };
  }

  const inspect = inspectXmlCursor({
    document: input.document,
    parsed: context.parsed,
    position: input.position,
  });
  const element = "element" in inspect ? inspect.element : undefined;
  const attribute = "attribute" in inspect ? inspect.attribute : undefined;
  const usage = element
    ? resolveNodeUsage(context.semantic, {
        element,
        documentRoot: context.parsed?.root,
        uri: input.document.uri,
        config: context.config,
        policy: context.nodeUsagePolicy,
      })
    : undefined;
  if (element?.name === "SubTree" && attribute?.name === "ID") {
    const target = usage?.subtree?.target;
    if (target?.status === "resolved" && target.kind === "behavior-tree") {
      const def = target.behaviorTree;
      return {
        range: attribute.valueContentRange || attribute.valueRange,
        contents: `**SubTree** \`${attribute.value}\`\n\nResolves to \`BehaviorTree ID="${attribute.value}"\` in \`${def.uri}\`.`,
      };
    }
    if (target?.status === "ambiguous") {
      const fallbackUri = context.parsed?.uri || "workspace";
      const candidates = getSubTreeCandidateLabels(
        [...target.behaviorTrees, ...target.definitions],
        fallbackUri,
      );
      return {
        range: attribute.valueContentRange || attribute.valueRange,
        contents: describeAmbiguousSubTree(attribute.value, candidates),
      };
    }
    if (target?.status === "resolved" && target.kind === "node-model") {
      return {
        range: attribute.valueContentRange || attribute.valueRange,
        contents: `**SubTree** \`${attribute.value}\`\n\nResolves to SubTree model in \`${target.model.uri || context.parsed?.uri || "workspace"}\`.`,
      };
    }
  }
  if (attribute && element) {
    const binding = context.documentView
      ? findPortBindingAtPosition(context.documentView, input.position)
      : undefined;
    if (binding?.declaredPort.status === "resolved") {
      return { range: attribute.nameRange, contents: describePort(binding.declaredPort.port) };
    }
    const portUsage = resolvePortUsage(context.semantic, {
      element,
      documentRoot: context.parsed?.root,
      attributeName: attribute.name,
      uri: input.document.uri,
      config: context.config,
      policy: context.nodeUsagePolicy,
    });
    if (portUsage?.status === "resolved") {
      return { range: attribute.nameRange, contents: describePort(portUsage.port) };
    }
  }
  const treeNode = context.documentView
    ? findTreeNodeAtPosition(context.documentView, input.position)
    : undefined;
  if (treeNode) {
    if (treeNode.usage.model.status === "resolved") {
      const model = treeNode.usage.model.model;
      return {
        range: treeNode.element.nameRange || treeNode.element.openTagRange,
        contents: describeModel(model),
      };
    }
  }
  if (element && usage?.model.status === "resolved") {
    return {
      range: element.nameRange || element.openTagRange,
      contents: describeModel(usage.model.model),
    };
  }
  return {};
}
