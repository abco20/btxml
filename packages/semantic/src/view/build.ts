import type { SourcePosition, SourceRange } from "@btxml/foundation";
import type { BtDocument, BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import { buildSemanticIndex } from "../semantic-index.js";
import type { SemanticIndex } from "../types.js";
import { resolveNodeUsage } from "../usage/index.js";
import type { NodeUsageResolution, PortUsageResolution } from "../usage/index.js";
import type {
  BehaviorTreeView,
  BlackboardReferenceView,
  BtDocumentView,
  BuildBtDocumentViewOptions,
  BuildLocalBtDocumentViewOptions,
  BuildSemanticDocumentViewOptions,
  NodeModelResolution,
  PortBindingView,
  PortResolution,
  SemanticAttributeView,
  SemanticBehaviorTreeView,
  SemanticDocumentView,
  SemanticPortBindingView,
  SemanticSubTreeCallView,
  SemanticTreeNodeView,
  SubTreeCallView,
  TreeNodeKind,
  TreeNodeView,
} from "./types.js";

type MutableBehaviorTreeView = {
  id: string | undefined;
  element: BtXmlElement;
  rootNode: TreeNodeView | undefined;
  nodes: TreeNodeView[];
};

type MutableTreeNodeView = {
  element: BtXmlElement;
  path: readonly number[];
  tagName: string;
  kind: TreeNodeKind | "unknown";
  model: NodeModelResolution;
  usage: NodeUsageResolution;
  portBindings: PortBindingView[];
  children: TreeNodeView[];
  parent: TreeNodeView | undefined;
  behaviorTree: BehaviorTreeView;
};

function isTreeNodeKind(name: string): name is TreeNodeKind {
  return (
    name === "Action" ||
    name === "Condition" ||
    name === "Control" ||
    name === "Decorator" ||
    name === "SubTree"
  );
}

function getBehaviorTreeElements(document: BtDocument): BtXmlElement[] {
  const root = document.root;
  if (!root) return [];
  if (root.name === "BehaviorTree") return [root];
  return root.children.filter(
    (child): child is BtXmlElement => child.kind === "element" && child.name === "BehaviorTree",
  );
}

function advancePosition(start: SourcePosition, text: string): SourcePosition {
  let line = start.line;
  let character = start.character;
  let offset = start.offset;
  for (const char of text) {
    offset += char.length;
    if (char === "\n") {
      line += 1;
      character = 0;
      continue;
    }
    character += char.length;
  }
  return { line, character, offset };
}

function rangeFromText(start: SourcePosition, prefix: string, text: string): SourceRange {
  const rangeStart = advancePosition(start, prefix);
  const rangeEnd = advancePosition(rangeStart, text);
  return {
    start: rangeStart,
    end: rangeEnd,
  };
}

function extractBlackboardReferences(
  document: BtDocument,
  attribute: BtXmlAttribute,
): BlackboardReferenceView[] {
  const baseRange = attribute.valueContentRange || attribute.valueRange;
  const rawValue = document.originalText.slice(baseRange.start.offset, baseRange.end.offset);
  const references: BlackboardReferenceView[] = [];

  for (const match of rawValue.matchAll(/\{([^}]+)\}/g)) {
    const raw = match[0];
    const key = match[1];
    const index = match.index ?? 0;
    references.push({
      raw,
      key,
      range: rangeFromText(baseRange.start, rawValue.slice(0, index), raw),
      syntax: "braced",
    });
  }

  if (references.length === 0 && (rawValue.includes("{") || rawValue.includes("}"))) {
    references.push({
      raw: rawValue,
      key: rawValue,
      range: baseRange,
      syntax: "invalid",
    });
  }

  return references;
}

function inferTreeNodeKind(
  element: BtXmlElement,
  usage: NodeUsageResolution,
): TreeNodeKind | "unknown" {
  if (isTreeNodeKind(element.name)) return element.name;
  if (usage.model.status === "resolved") return usage.model.model.kind;
  return "unknown";
}

function flattenTreeNodes(nodes: readonly TreeNodeView[]): TreeNodeView[] {
  const flat: TreeNodeView[] = [];
  for (const node of nodes) {
    flat.push(node);
    flat.push(...flattenTreeNodes(node.children));
  }
  return flat;
}

function toSemanticDocumentKind(document: BtDocument): SemanticDocumentView["kind"] {
  if (document.kind === "bt-document") return "bt-xml";
  if (document.kind === "model-document") return "model-xml";
  return "unknown";
}

function createNodeIdResolver(behaviorTrees: readonly BehaviorTreeView[]) {
  const behaviorTreeIndexByTree = new Map(
    behaviorTrees.map((tree, index) => [tree, index] as const),
  );
  return (node: TreeNodeView) => {
    const behaviorTreeIndex = behaviorTreeIndexByTree.get(node.behaviorTree) ?? 0;
    return `bt:${behaviorTreeIndex}/node:${node.path.join(".")}`;
  };
}

function toSemanticAttributeView(attribute: BtXmlAttribute): SemanticAttributeView {
  return {
    name: attribute.name,
    value: attribute.value,
    range: attribute.range,
    nameRange: attribute.nameRange,
    valueRange: attribute.valueContentRange || attribute.valueRange,
  };
}

function getNodeName(element: BtXmlElement): string | undefined {
  return getAttribute(element, "name")?.value;
}

function getNodePathLabel(element: BtXmlElement): string {
  return getNodeName(element) || getAttribute(element, "ID")?.value || element.name;
}

function buildInstancePath(node: TreeNodeView): string {
  const segments: string[] = [];
  let current: TreeNodeView | undefined = node;
  while (current) {
    const index = current.path.at(-1) ?? 0;
    segments.unshift(`${index}:${getNodePathLabel(current.element)}`);
    current = current.parent;
  }
  return [node.behaviorTree.id || "<anonymous>", ...segments].join("/");
}

function toNodeModelResolution(usage: NodeUsageResolution): NodeModelResolution {
  if (usage.model.status === "resolved") {
    return {
      status: "resolved",
      model: usage.model.model,
      source: usage.model.model.sourceMeta,
    };
  }

  if (usage.model.status === "ambiguous") {
    return {
      status: "ambiguous",
      nodeType: usage.model.nodeType,
      candidates: usage.model.candidates,
    };
  }

  return {
    status: "unresolved",
    nodeType: usage.nodeType ?? usage.tagName,
  };
}

function toPortResolution(usage: PortUsageResolution): PortResolution {
  if (usage.status === "resolved") {
    return {
      status: "resolved",
      port: usage.port,
    };
  }

  if (usage.status === "allowed-arbitrary") {
    return {
      status: "allowed-arbitrary",
      name: usage.name,
    };
  }

  if (usage.status === "undeclared") {
    return {
      status: "undeclared",
      name: usage.name,
    };
  }

  return {
    status: "unknown-node-model",
  };
}

function getSemanticPortDirection(
  usage: PortUsageResolution,
): SemanticPortBindingView["direction"] {
  return usage.status === "resolved" ? usage.port.direction : "unknown";
}

function getSemanticPortValueKind(
  value: string,
  blackboardReferences: readonly BlackboardReferenceView[],
): SemanticPortBindingView["valueKind"] {
  if (value === "") return "empty";
  if (value === "{=}") return "substitution";
  if (blackboardReferences.some((reference) => reference.syntax === "braced")) {
    return "blackboard-reference";
  }
  if (blackboardReferences.some((reference) => reference.syntax === "invalid")) {
    return "unknown";
  }
  return "literal";
}

function toSemanticPortBindingView(
  nodeId: string,
  binding: PortBindingView,
): SemanticPortBindingView {
  return {
    nodeId,
    portName: binding.name,
    rawValue: binding.value,
    direction: getSemanticPortDirection(binding.usage),
    valueKind: getSemanticPortValueKind(binding.value, binding.blackboardReferences),
    range: binding.attribute.range,
    nameRange: binding.attribute.nameRange,
    valueRange: binding.attribute.valueContentRange || binding.attribute.valueRange,
    resolution: binding.declaredPort,
    usage: binding.usage,
    blackboardReferences: binding.blackboardReferences,
  };
}

function buildIdentityCandidates(input: {
  name: string | undefined;
  idAttr: string | undefined;
  nodeType: string;
  tagName: string;
  instancePath: string;
  behaviorTreeId: string | undefined;
  nodeId: string;
}): readonly string[] {
  const candidates = new Set<string>();
  for (const value of [
    input.name,
    input.idAttr,
    input.nodeType,
    input.tagName,
    input.instancePath,
    input.behaviorTreeId && !input.instancePath.startsWith(`${input.behaviorTreeId}/`)
      ? `${input.behaviorTreeId}/${input.instancePath}`
      : undefined,
    input.nodeId,
  ]) {
    if (value) candidates.add(value);
  }
  return [...candidates];
}

function getAttribute(element: BtXmlElement, name: string): BtXmlAttribute | undefined {
  return element.attributes.find((attribute) => attribute.name === name);
}

function getDocumentMainTreeToExecute(document: BtDocument): string | undefined {
  return document.root ? getAttribute(document.root, "main_tree_to_execute")?.value : undefined;
}

function collectModelDefinitionElements(root: BtXmlElement | undefined) {
  const elements = new Set<BtXmlElement>();
  if (!root) return elements;

  const collectDescendants = (element: BtXmlElement) => {
    elements.add(element);
    for (const child of element.children) {
      if (child.kind === "element") collectDescendants(child);
    }
  };

  if (root.name === "TreeNodesModel") {
    collectDescendants(root);
    return elements;
  }

  for (const child of root.children) {
    if (child.kind !== "element" || child.name !== "TreeNodesModel") continue;
    collectDescendants(child);
  }

  return elements;
}

export function buildBtDocumentView(
  document: BtDocument,
  options: BuildBtDocumentViewOptions,
): BtDocumentView {
  const index = options.semantic;
  const modelDefinitionElements = collectModelDefinitionElements(document.root);
  const behaviorTreeViews: MutableBehaviorTreeView[] = getBehaviorTreeElements(document).map(
    (element) => ({
      id: getAttribute(element, "ID")?.value,
      element,
      rootNode: undefined,
      nodes: [],
    }),
  );
  const subtreeCalls: SubTreeCallView[] = [];
  const allNodes: TreeNodeView[] = [];

  const buildTreeNode = (
    element: BtXmlElement,
    behaviorTree: MutableBehaviorTreeView,
    parent: TreeNodeView | undefined,
    path: readonly number[],
  ): TreeNodeView => {
    const usage = resolveNodeUsage(index, {
      element,
      uri: document.uri,
      documentRoot: document.root,
      config: options?.config,
      policy: options?.policy,
      isModelDefinition: modelDefinitionElements.has(element),
    });
    const model = toNodeModelResolution(usage);
    const node: MutableTreeNodeView = {
      element,
      path,
      tagName: element.name,
      kind: inferTreeNodeKind(element, usage),
      model,
      usage,
      portBindings: [],
      children: [],
      parent,
      behaviorTree: behaviorTree as BehaviorTreeView,
    };

    node.portBindings = usage.portUsages
      .filter((portUsage) => portUsage.status !== "reserved-attribute")
      .map((portUsage) => ({
        name: portUsage.name,
        value: portUsage.value,
        attribute: portUsage.attribute,
        declaredPort: toPortResolution(portUsage),
        usage: portUsage,
        blackboardReferences: extractBlackboardReferences(document, portUsage.attribute),
      }));

    node.children = element.children
      .filter((child): child is BtXmlElement => child.kind === "element")
      .map((child, childIndex) =>
        buildTreeNode(child, behaviorTree, node as TreeNodeView, [...path, childIndex]),
      );

    if (element.name === "SubTree") {
      const id = getAttribute(element, "ID")?.value;
      subtreeCalls.push({
        node: node as TreeNodeView,
        id,
        target: usage.subtree?.target ?? { status: "unresolved", id },
        portRemaps: node.portBindings,
      });
    }

    return node as TreeNodeView;
  };

  for (const behaviorTree of behaviorTreeViews) {
    const rootNodes = behaviorTree.element.children
      .filter((child): child is BtXmlElement => child.kind === "element")
      .map((child, childIndex) => buildTreeNode(child, behaviorTree, undefined, [childIndex]));
    behaviorTree.rootNode = rootNodes[0];
    behaviorTree.nodes = flattenTreeNodes(rootNodes);
    allNodes.push(...behaviorTree.nodes);
  }

  return {
    document,
    behaviorTrees: behaviorTreeViews as readonly BehaviorTreeView[],
    subtreeCalls,
    nodes: allNodes,
  };
}

export function buildLocalBtDocumentView(
  document: BtDocument,
  options: BuildLocalBtDocumentViewOptions,
): BtDocumentView {
  const semantic = buildSemanticIndex([document], {
    config: options.config,
    models: options.nodeModels,
  }).index;
  return buildBtDocumentView(document, {
    semantic,
    config: options.config,
    policy: options.policy,
  });
}

export function buildSemanticDocumentView(
  document: BtDocument,
  index: SemanticIndex,
  options?: BuildSemanticDocumentViewOptions,
): SemanticDocumentView {
  const view = buildBtDocumentView(document, {
    semantic: index,
    config: options?.config,
    policy: options?.policy,
  });
  const getNodeId = createNodeIdResolver(view.behaviorTrees);
  const nodes = view.nodes.map<SemanticTreeNodeView>((node) => {
    const nodeId = getNodeId(node);
    const usage = node.usage;
    const nodeType = usage.nodeType ?? node.tagName;
    const name = getNodeName(node.element);
    const idAttr = getAttribute(node.element, "ID")?.value;
    const instancePath = buildInstancePath(node);
    return {
      nodeId,
      path: node.path,
      instancePath,
      tagName: node.tagName,
      nodeType,
      name,
      idAttr,
      kind: node.kind,
      range: node.element.range,
      fullRange: node.element.fullRange,
      nameRange: node.element.nameRange,
      parentNodeId: node.parent ? getNodeId(node.parent) : undefined,
      childNodeIds: node.children.map(getNodeId),
      behaviorTreeId: node.behaviorTree.id,
      attributes: node.element.attributes.map(toSemanticAttributeView),
      identityCandidates: buildIdentityCandidates({
        name,
        idAttr,
        nodeType,
        tagName: node.tagName,
        instancePath,
        behaviorTreeId: node.behaviorTree.id,
        nodeId,
      }),
      model: toNodeModelResolution(usage),
      usage,
      portBindings: usage.portUsages
        .filter((portUsage) => portUsage.status !== "reserved-attribute")
        .map((portUsage) =>
          toSemanticPortBindingView(nodeId, {
            name: portUsage.name,
            value: portUsage.value,
            attribute: portUsage.attribute,
            declaredPort: toPortResolution(portUsage),
            usage: portUsage,
            blackboardReferences: extractBlackboardReferences(document, portUsage.attribute),
          }),
        ),
    };
  });

  const behaviorTrees = view.behaviorTrees.map<SemanticBehaviorTreeView>((behaviorTree) => ({
    id: behaviorTree.id,
    range: behaviorTree.element.range,
    idRange: getAttribute(behaviorTree.element, "ID")?.valueContentRange,
    rootNodeId: behaviorTree.rootNode ? getNodeId(behaviorTree.rootNode) : undefined,
    nodeIds: behaviorTree.nodes.map(getNodeId),
  }));

  const subtreeCalls = view.subtreeCalls.map<SemanticSubTreeCallView>((call) => ({
    nodeId: getNodeId(call.node),
    callId: call.id,
    range: call.node.element.range,
    target: call.target,
    portBindings: call.portRemaps.map((binding) =>
      toSemanticPortBindingView(getNodeId(call.node), binding),
    ),
  }));

  const mainTreeAttribute = document.root
    ? getAttribute(document.root, "main_tree_to_execute")
    : undefined;

  return {
    uri: document.uri,
    kind: toSemanticDocumentKind(document),
    mainTreeToExecute: getDocumentMainTreeToExecute(document),
    mainTreeToExecuteRange: mainTreeAttribute?.valueContentRange || mainTreeAttribute?.valueRange,
    behaviorTrees,
    nodes,
    subtreeCalls,
  };
}
