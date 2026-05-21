import { DiagnosticSeverity, type SourcePosition, containsOffset } from "@btxml/foundation";
import type {
  BtDocumentView,
  PortBindingView,
  SemanticDocumentView,
  SemanticNodeIdentityIndex,
  SemanticPortBindingView,
  SemanticSubTreeCallView,
  SemanticTreeNodeView,
  SemanticTreeSelection,
  SubTreeCallView,
  TreeNodeView,
} from "./types.js";

function containsNodePosition(node: TreeNodeView, offset: number): boolean {
  const range = node.element.fullRange || node.element.range;
  return containsOffset(range, offset);
}

function narrowerRange(left: TreeNodeView, right: TreeNodeView): boolean {
  const leftRange = left.element.fullRange || left.element.range;
  const rightRange = right.element.fullRange || right.element.range;
  return (
    leftRange.end.offset - leftRange.start.offset < rightRange.end.offset - rightRange.start.offset
  );
}

export function getAllTreeNodes(view: BtDocumentView): readonly TreeNodeView[] {
  return view.nodes;
}

export function getSubTreeCalls(view: BtDocumentView): readonly SubTreeCallView[] {
  return view.subtreeCalls;
}

export function findTreeNodeAtPosition(
  view: BtDocumentView,
  position: SourcePosition,
): TreeNodeView | undefined {
  let match: TreeNodeView | undefined;
  for (const node of view.nodes) {
    if (!containsNodePosition(node, position.offset)) continue;
    if (!match || narrowerRange(node, match)) match = node;
  }
  return match;
}

export function findPortBindingAtPosition(
  view: BtDocumentView,
  position: SourcePosition,
): PortBindingView | undefined {
  for (const node of view.nodes) {
    for (const binding of node.portBindings) {
      if (containsOffset(binding.attribute.range, position.offset)) return binding;
    }
  }
  return undefined;
}

function containsSemanticNodePosition(node: SemanticTreeNodeView, offset: number): boolean {
  return containsOffset(node.fullRange || node.range, offset);
}

function narrowerSemanticRange(left: SemanticTreeNodeView, right: SemanticTreeNodeView): boolean {
  const leftRange = left.fullRange || left.range;
  const rightRange = right.fullRange || right.range;
  return (
    leftRange.end.offset - leftRange.start.offset < rightRange.end.offset - rightRange.start.offset
  );
}

export function getAllSemanticTreeNodes(
  view: SemanticDocumentView,
): readonly SemanticTreeNodeView[] {
  return view.nodes;
}

export function getSemanticSubTreeCalls(
  view: SemanticDocumentView,
): readonly SemanticSubTreeCallView[] {
  return view.subtreeCalls;
}

export function getSemanticTreeNodesForBehaviorTree(
  view: SemanticDocumentView,
  treeId: string | undefined,
): readonly SemanticTreeNodeView[] {
  return view.nodes.filter((node) => node.behaviorTreeId === treeId);
}

export function selectDefaultBehaviorTree(
  view: SemanticDocumentView,
  preferredTreeId?: string,
): SemanticTreeSelection {
  if (view.behaviorTrees.length === 0) {
    return {
      ok: false,
      reason: "no-tree",
      diagnostics: [
        {
          code: "BTXML_SEMANTIC_TREE_SELECTION",
          severity: DiagnosticSeverity.Error,
          message: "document does not contain any BehaviorTree",
          uri: view.uri,
        },
      ],
    };
  }

  const hasTree = (candidateId: string | undefined) =>
    view.behaviorTrees.some((tree) => tree.id === candidateId);

  if (preferredTreeId !== undefined) {
    if (!hasTree(preferredTreeId)) {
      return {
        ok: false,
        reason: "unknown-preferred-tree",
        diagnostics: [
          {
            code: "BTXML_SEMANTIC_TREE_SELECTION",
            severity: DiagnosticSeverity.Error,
            message: `preferred tree \`${preferredTreeId}\` was not found`,
            uri: view.uri,
          },
        ],
      };
    }
    return { ok: true, treeId: preferredTreeId, reason: "preferred" };
  }

  if (view.mainTreeToExecute !== undefined) {
    if (hasTree(view.mainTreeToExecute)) {
      return {
        ok: true,
        treeId: view.mainTreeToExecute,
        reason: "main_tree_to_execute",
      };
    }
    return {
      ok: false,
      reason: "unknown-main-tree",
      diagnostics: [
        {
          code: "BTXML_SEMANTIC_TREE_SELECTION",
          severity: DiagnosticSeverity.Error,
          message: `main_tree_to_execute references unknown BehaviorTree \`${view.mainTreeToExecute}\``,
          uri: view.uri,
          range: view.mainTreeToExecuteRange,
        },
      ],
    };
  }

  if (view.behaviorTrees.length === 1) {
    return {
      ok: true,
      treeId: view.behaviorTrees[0]?.id,
      reason: "only-tree",
    };
  }

  return {
    ok: true,
    treeId: view.behaviorTrees[0]?.id,
    reason: "first-tree",
  };
}

function appendCandidate(
  byCandidate: Map<string, string[]>,
  byNodeId: Map<string, string[]>,
  nodeId: string,
  candidate: string | undefined,
) {
  if (!candidate) return;
  const existingNodeCandidates = byNodeId.get(nodeId);
  if (existingNodeCandidates?.includes(candidate)) return;

  const nodeCandidates = existingNodeCandidates ?? [];
  nodeCandidates.push(candidate);
  byNodeId.set(nodeId, nodeCandidates);

  const candidateNodeIds = byCandidate.get(candidate) ?? [];
  candidateNodeIds.push(nodeId);
  byCandidate.set(candidate, candidateNodeIds);
}

export function buildSemanticNodeIdentityIndex(
  view: SemanticDocumentView,
): SemanticNodeIdentityIndex {
  const byNodeId = new Map<string, string[]>();
  const byCandidate = new Map<string, string[]>();

  for (const node of view.nodes) {
    for (const candidate of node.identityCandidates) {
      appendCandidate(byCandidate, byNodeId, node.nodeId, candidate);
    }
  }

  return {
    byNodeId,
    byCandidate,
    ambiguousCandidates: [...byCandidate.entries()]
      .filter(([, nodeIds]) => nodeIds.length >= 2)
      .map(([candidate]) => candidate)
      .sort(),
  };
}

export function findSemanticNodeAtPosition(
  view: SemanticDocumentView,
  position: SourcePosition,
): SemanticTreeNodeView | undefined {
  let match: SemanticTreeNodeView | undefined;
  for (const node of view.nodes) {
    if (!containsSemanticNodePosition(node, position.offset)) continue;
    if (!match || narrowerSemanticRange(node, match)) match = node;
  }
  return match;
}

export function findSemanticPortBindingAtPosition(
  view: SemanticDocumentView,
  position: SourcePosition,
): SemanticPortBindingView | undefined {
  for (const node of view.nodes) {
    for (const binding of node.portBindings) {
      if (containsOffset(binding.range, position.offset)) return binding;
    }
  }
  return undefined;
}
