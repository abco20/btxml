import type { ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic, SourceRange } from "@btxml/foundation";
import type {
  TreeNodeKind as BtcppTreeNodeKind,
  NodeModelSource,
  PortDef,
  TreeNodeModelDef,
} from "@btxml/model";
import type { BtDocument, BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import type { SubTreeResolution } from "../subtree-resolution.js";
import type { SemanticIndex } from "../types.js";
import type {
  NodeUsagePolicy,
  NodeUsageResolution,
  PortUsageResolution,
  UsageResolverConfig,
} from "../usage/index.js";

export type TreeNodeKind = BtcppTreeNodeKind;

export type BuildBtDocumentViewOptions = {
  readonly semantic: SemanticIndex;
  readonly config?: UsageResolverConfig;
  readonly policy?: Partial<NodeUsagePolicy>;
};

export type BuildLocalBtDocumentViewOptions = {
  readonly config: ResolvedBtxmlConfig;
  readonly nodeModels?: readonly TreeNodeModelDef[];
  readonly policy?: Partial<NodeUsagePolicy>;
};

export type BuildSemanticDocumentViewOptions = {
  readonly config?: UsageResolverConfig;
  readonly policy?: Partial<NodeUsagePolicy>;
};

export type NodeModelResolution =
  | {
      readonly status: "resolved";
      readonly model: TreeNodeModelDef;
      readonly source: NodeModelSource | undefined;
    }
  | {
      readonly status: "unresolved";
      readonly nodeType: string;
    }
  | {
      readonly status: "ambiguous";
      readonly nodeType: string;
      readonly candidates: readonly TreeNodeModelDef[];
    };

export type PortResolution =
  | {
      readonly status: "resolved";
      readonly port: PortDef;
    }
  | {
      readonly status: "allowed-arbitrary";
      readonly name: string;
    }
  | {
      readonly status: "undeclared";
      readonly name: string;
    }
  | {
      readonly status: "unknown-node-model";
    };

export interface BlackboardReferenceView {
  readonly raw: string;
  readonly key: string;
  readonly range: SourceRange;
  readonly syntax: "braced" | "bare" | "invalid";
}

export interface SemanticAttributeView {
  readonly name: string;
  readonly value: string;
  readonly range: SourceRange;
  readonly nameRange: SourceRange;
  readonly valueRange: SourceRange | undefined;
}

export interface PortBindingView {
  readonly name: string;
  readonly value: string;
  readonly attribute: BtXmlAttribute;
  readonly declaredPort: PortResolution;
  readonly usage: PortUsageResolution;
  readonly blackboardReferences: readonly BlackboardReferenceView[];
}

export interface BehaviorTreeView {
  readonly id: string | undefined;
  readonly element: BtXmlElement;
  readonly rootNode: TreeNodeView | undefined;
  readonly nodes: readonly TreeNodeView[];
}

export interface TreeNodeView {
  readonly element: BtXmlElement;
  readonly path: readonly number[];
  readonly tagName: string;
  readonly kind: TreeNodeKind | "unknown";
  readonly model: NodeModelResolution;
  readonly usage: NodeUsageResolution;
  readonly portBindings: readonly PortBindingView[];
  readonly children: readonly TreeNodeView[];
  readonly parent: TreeNodeView | undefined;
  readonly behaviorTree: BehaviorTreeView;
}

export interface SubTreeCallView {
  readonly node: TreeNodeView;
  readonly id: string | undefined;
  readonly target: SubTreeResolution;
  readonly portRemaps: readonly PortBindingView[];
}

export interface BtDocumentView {
  readonly document: BtDocument;
  readonly behaviorTrees: readonly BehaviorTreeView[];
  readonly subtreeCalls: readonly SubTreeCallView[];
  readonly nodes: readonly TreeNodeView[];
}

export type SemanticNodeModelResolution =
  | {
      readonly status: "resolved";
      readonly model: TreeNodeModelDef;
      readonly source: NodeModelSource | undefined;
    }
  | {
      readonly status: "unresolved";
      readonly nodeType: string;
    }
  | {
      readonly status: "ambiguous";
      readonly nodeType: string;
      readonly candidates: readonly TreeNodeModelDef[];
    };

export type SemanticPortResolution =
  | {
      readonly status: "resolved";
      readonly port: PortDef;
    }
  | {
      readonly status: "allowed-arbitrary";
      readonly name: string;
    }
  | {
      readonly status: "undeclared";
      readonly name: string;
    }
  | {
      readonly status: "unknown-node-model";
    };

export interface SemanticPortBindingView {
  readonly nodeId: string;
  readonly portName: string;
  readonly rawValue: string;
  readonly direction: "input" | "output" | "inout" | "unknown";
  readonly valueKind: "literal" | "blackboard-reference" | "substitution" | "empty" | "unknown";
  readonly range: SourceRange;
  readonly nameRange: SourceRange;
  readonly valueRange: SourceRange | undefined;
  readonly resolution: SemanticPortResolution;
  readonly usage: PortUsageResolution;
  readonly blackboardReferences: readonly BlackboardReferenceView[];
}

export interface SemanticBehaviorTreeView {
  readonly id: string | undefined;
  readonly range: SourceRange;
  readonly idRange: SourceRange | undefined;
  readonly rootNodeId: string | undefined;
  readonly nodeIds: readonly string[];
}

export type SemanticTreeSelection =
  | {
      readonly ok: true;
      readonly treeId: string | undefined;
      readonly reason: "preferred" | "main_tree_to_execute" | "only-tree" | "first-tree";
    }
  | {
      readonly ok: false;
      readonly reason: "no-tree" | "unknown-preferred-tree" | "unknown-main-tree";
      readonly diagnostics: readonly Diagnostic[];
    };

export interface SemanticTreeNodeView {
  readonly nodeId: string;
  readonly path: readonly number[];
  readonly instancePath: string;
  readonly tagName: string;
  readonly nodeType: string;
  readonly name: string | undefined;
  readonly idAttr: string | undefined;
  readonly kind: TreeNodeKind | "unknown";
  readonly range: SourceRange;
  readonly fullRange: SourceRange | undefined;
  readonly nameRange: SourceRange | undefined;
  readonly parentNodeId: string | undefined;
  readonly childNodeIds: readonly string[];
  readonly behaviorTreeId: string | undefined;
  readonly attributes: readonly SemanticAttributeView[];
  readonly identityCandidates: readonly string[];
  readonly model: SemanticNodeModelResolution;
  readonly usage: NodeUsageResolution;
  readonly portBindings: readonly SemanticPortBindingView[];
}

export interface SemanticSubTreeCallView {
  readonly nodeId: string;
  readonly callId: string | undefined;
  readonly range: SourceRange;
  readonly target: SubTreeResolution;
  readonly portBindings: readonly SemanticPortBindingView[];
}

export interface SemanticDocumentView {
  readonly uri: string;
  readonly kind: "bt-xml" | "model-xml" | "unknown";
  readonly mainTreeToExecute: string | undefined;
  readonly mainTreeToExecuteRange: SourceRange | undefined;
  readonly behaviorTrees: readonly SemanticBehaviorTreeView[];
  readonly nodes: readonly SemanticTreeNodeView[];
  readonly subtreeCalls: readonly SemanticSubTreeCallView[];
}

export interface SemanticNodeIdentityIndex {
  readonly byNodeId: ReadonlyMap<string, readonly string[]>;
  readonly byCandidate: ReadonlyMap<string, readonly string[]>;
  readonly ambiguousCandidates: readonly string[];
}
