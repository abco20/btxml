import type { SourceRange } from "@btxml/foundation";
import { getRemappedKey } from "@btxml/model";
import {
  type AnalyzeScriptResult,
  type ParseScriptResult,
  type ScriptEnvironment,
  type ScriptEnvironmentSymbolInput,
  type ScriptFlowEntryResult,
  analyzeScript,
  analyzeScriptFlow,
  classifyScriptAttribute,
  createScriptEnvironment,
  parseScript,
  scriptTypeFromTypeName,
} from "@btxml/script";
import {
  areTypesCompatible,
  getModelAugmentations,
  getTypeDefinition,
  getTypeRegistry,
} from "@btxml/semantic";
import type { BehaviorTreeView, TreeNodeView } from "@btxml/semantic/ast-view";
import { mapDecodedAttributeRangeToDocumentRange } from "@btxml/syntax";
import type { BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import type { RuleContext } from "../../context.js";
import { getResolvedPortType } from "../usage/shared.js";

export type ScriptAttributeCandidate = {
  attribute: BtXmlAttribute;
  info: NonNullable<ReturnType<typeof classifyScriptAttribute>>;
  parseResult: ParseScriptResult;
};

export type AnalyzedScriptAttributeCandidate = ScriptAttributeCandidate & {
  environment: ScriptEnvironment;
  analysis: AnalyzeScriptResult | undefined;
};

type ScriptAttributeFlowState = ScriptFlowEntryResult<string> & {
  node: TreeNodeView;
  candidate: ScriptAttributeCandidate;
};

const analyzerScriptFlowCache = new WeakMap<
  object,
  WeakMap<BehaviorTreeView, ScriptAttributeFlowState[]>
>();

export function getScriptAttributeCandidates(
  context: RuleContext,
  element: BtXmlElement,
): ScriptAttributeCandidate[] {
  const usage = context.getNodeUsage(element);
  const resolvedNodeType =
    usage.model.status === "resolved" ? usage.model.model.id : usage.nodeType;

  return element.attributes.flatMap((attribute) => {
    const info = classifyScriptAttribute({
      elementName: element.name,
      attributeName: attribute.name,
      resolvedNodeType,
    });
    if (!info) return [];
    return [{ attribute, info, parseResult: parseScript(attribute.value) }];
  });
}

export function mapScriptRangeToDocument(
  context: RuleContext,
  attribute: BtXmlAttribute,
  range: { start: number; end: number },
): SourceRange {
  return mapDecodedAttributeRangeToDocumentRange(context.document, attribute, range);
}

export function attributeScriptRange(attribute: BtXmlAttribute) {
  return { start: 0, end: attribute.value.length };
}

export function getAnalyzedScriptAttributeCandidates(
  context: RuleContext,
  element: BtXmlElement,
): AnalyzedScriptAttributeCandidate[] {
  const treeNode = context.getTreeNodeView(element);
  const behaviorTree = treeNode?.behaviorTree;
  if (!treeNode || !behaviorTree) {
    return getScriptAttributeCandidates(context, element).map((candidate) => {
      const environment = buildBaseScriptEnvironment(context, []);
      return {
        ...candidate,
        environment,
        analysis: candidate.parseResult.ok
          ? analyzeScript({
              program: candidate.parseResult.program,
              environment,
              attributeName: candidate.attribute.name,
            })
          : undefined,
      };
    });
  }

  return getBehaviorTreeScriptFlow(context, behaviorTree)
    .filter((entry) => entry.node.element === element)
    .map((entry) => ({
      ...entry.candidate,
      environment: entry.environmentBefore,
      analysis: entry.analysis,
    }));
}

function getBehaviorTreeScriptFlow(context: RuleContext, behaviorTree: BehaviorTreeView) {
  let contextCache = analyzerScriptFlowCache.get(context.view);
  if (!contextCache) {
    contextCache = new WeakMap();
    analyzerScriptFlowCache.set(context.view, contextCache);
  }

  const cached = contextCache.get(behaviorTree);
  if (cached) return cached;

  const scriptEntries = behaviorTree.nodes.flatMap((node) =>
    getScriptAttributeCandidates(context, node.element).map((candidate, index) => ({
      id: `${node.path.join(".")}:${candidate.attribute.name}:${index}`,
      node,
      candidate,
    })),
  );

  const analyzed = analyzeScriptFlow({
    baseEnvironment: buildBaseScriptEnvironment(context, behaviorTree.nodes),
    entries: scriptEntries.map((entry) => ({
      id: entry.id,
      source: entry.candidate.attribute.value,
      attributeName: entry.candidate.attribute.name,
      originId: entry.id,
      parseResult: entry.candidate.parseResult,
    })),
  }).flatMap((state, index) => {
    const entry = scriptEntries[index];
    return entry ? [{ ...state, node: entry.node, candidate: entry.candidate }] : [];
  });

  contextCache.set(behaviorTree, analyzed);
  return analyzed;
}

function buildBaseScriptEnvironment(
  context: RuleContext,
  nodes: readonly TreeNodeView[],
): ScriptEnvironment {
  const registry = getTypeRegistry(context.semantic);
  const portSymbols: ScriptEnvironmentSymbolInput[] = [];
  const behaviorTreeId = nodes[0]?.behaviorTree.id;

  if (behaviorTreeId) {
    const subtreeModel = context.getNodeModel(behaviorTreeId);
    if (subtreeModel?.kind === "SubTree") {
      for (const port of subtreeModel.ports) {
        const resolvedTypeName = getResolvedPortType(port);
        const resolvedDefinition = getTypeDefinition(context.semantic, resolvedTypeName);
        const compatibilityKey = resolvedDefinition?.canonical ?? resolvedTypeName;

        portSymbols.push({
          name: port.name,
          type: scriptTypeFromTypeName(registry, resolvedTypeName),
          source: {
            kind: "subtree-port",
            nodeType: behaviorTreeId,
            portName: port.name,
            direction: port.direction,
          },
          readable: true,
          writable: port.direction === "output" || port.direction === "inout",
          compatibilityKey,
        });
      }
    }
  }

  for (const node of nodes) {
    const nodeType =
      node.usage.model.status === "resolved" ? node.usage.model.model.id : node.usage.nodeType;
    for (const binding of node.portBindings) {
      if (binding.usage.status !== "resolved") continue;
      const remappedKey = getRemappedKey(binding.usage.port.name, binding.usage.value);
      if (!remappedKey) continue;

      const resolvedTypeName = getResolvedPortType(binding.usage.port);
      const resolvedDefinition = getTypeDefinition(context.semantic, resolvedTypeName);
      const compatibilityKey = resolvedDefinition?.canonical ?? resolvedTypeName;
      const direction = binding.usage.port.direction;

      portSymbols.push({
        name: remappedKey,
        type: scriptTypeFromTypeName(registry, resolvedTypeName),
        source: {
          kind: "port-remap",
          nodeType,
          portName: binding.usage.port.name,
          direction,
        },
        readable: direction === "input" || direction === "output" || direction === "inout",
        writable: direction === "output" || direction === "inout",
        compatibilityKey,
      });
    }
  }

  return createScriptEnvironment({
    symbols: portSymbols,
    augmentations: getModelAugmentations(context.semantic),
    areTypesCompatible: (left, right) =>
      left && right ? areTypesCompatible(context.semantic, left, right) : true,
  });
}
