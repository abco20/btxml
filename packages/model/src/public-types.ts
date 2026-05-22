import type { SourceRange } from "@btxml/foundation";
import type { BlackboardReferenceSyntax, BlackboardScope } from "./blackboard-reference.js";

export type ModelSourceRef = {
  readonly uri?: string;
  readonly sourceKind: NodeModelSourceKind;
  readonly nodeId: string;
  readonly kind: TreeNodeKind;
  readonly range?: SourceRange;
  readonly idRange?: SourceRange;
  readonly sourceIndex: number;
};

export type PortSourceRef = {
  readonly uri?: string;
  readonly sourceKind: NodeModelSourceKind;
  readonly nodeId: string;
  readonly portName: string;
  readonly direction: PortDirection;
  readonly range?: SourceRange;
  readonly nameRange?: SourceRange;
  readonly sourceIndex: number;
};

export type BehaviorTreeDef = {
  readonly id: string;
  readonly kind: "BehaviorTree";
  readonly uri: string;
  readonly range?: SourceRange;
  readonly elementRange?: SourceRange;
  readonly idRange?: SourceRange;
};

export type TreeNodeKind = "Action" | "Condition" | "Control" | "Decorator" | "SubTree";

export type PortDirection = "input" | "output" | "inout";

export type NodeModelSourceKind =
  | "config"
  | "node-definition-file"
  | "inline-tree-nodes-model"
  | "external-tree-nodes-model"
  | "model-augmentation"
  | "builtin";

export type TypeLiteralValidator =
  | {
      readonly kind: "pattern";
      readonly pattern: string;
    }
  | {
      readonly kind: "enum";
      readonly values: readonly string[];
    }
  | {
      readonly kind: "tuple";
      readonly separator: string;
      readonly items: readonly string[];
    }
  | {
      readonly kind: "json-schema";
      readonly schema: unknown;
    };

export type TypeDefinition = {
  readonly kind: "primitive" | "opaque" | "any";
  readonly canonical?: string;
  readonly aliases?: readonly string[];
  readonly compatibleWith?: readonly string[];
  readonly validate?: TypeLiteralValidator;
};

export type PortTypeRefinement = {
  readonly from?: string;
  readonly to: string;
};

export type PortAugmentation = {
  readonly typeRefinement?: PortTypeRefinement;
  readonly validate?: TypeLiteralValidator;
  readonly required?: boolean;
  readonly enum?: readonly string[];
  readonly description?: string;
};

export type EffectivePortTypeSource = NodeModelSourceKind;

export type NodeAugmentation = {
  readonly ports?: Readonly<Record<string, PortAugmentation>>;
};

export type ScriptAugmentation = {
  readonly enums?: Readonly<Record<string, number>>;
};

export type ModelAugmentationFile = {
  readonly version: 1;
  readonly types?: Readonly<Record<string, TypeDefinition>>;
  readonly augment?: Readonly<Record<string, NodeAugmentation>>;
  readonly script?: ScriptAugmentation;
  readonly uri?: string;
  readonly path?: string;
};

export type NodeModelSource = {
  readonly sourceKind: NodeModelSourceKind;
  readonly file?: string;
  readonly range?: SourceRange;
};

export type PortDef = {
  readonly source: NodeModelSourceKind;
  readonly direction: PortDirection;
  readonly name: string;
  readonly type?: string;
  readonly originalType?: string;
  readonly effectiveType?: string;
  readonly typeSource?: EffectivePortTypeSource;
  readonly typeRefinement?: PortTypeRefinement;
  readonly validate?: TypeLiteralValidator;
  readonly defaultValue?: string;
  readonly description?: string;
  readonly required: boolean;
  readonly uri?: string;
  readonly range?: SourceRange;
  readonly nameRange?: SourceRange;
  readonly enum?: readonly string[];
};

export type TreeNodeModelDef = {
  readonly id: string;
  readonly kind: TreeNodeKind;
  readonly editable?: boolean;
  readonly ports: readonly PortDef[];
  readonly source?: NodeModelSourceKind;
  readonly sourceMeta?: NodeModelSource;
  readonly uri?: string;
  readonly range?: SourceRange;
  readonly elementRange?: SourceRange;
  readonly idRange?: SourceRange;
};

export type BuiltinNodeDef = {
  readonly id: string;
  readonly kind: TreeNodeKind;
  readonly ports?: readonly PortDef[];
};

export type SubTreeReference = {
  readonly id: string;
  readonly uri: string;
  readonly range?: SourceRange;
  readonly elementRange?: SourceRange;
  readonly idRange?: SourceRange;
  readonly parentBehaviorTreeId?: string;
};

export type NodeUsageDef = {
  readonly id: string;
  readonly uri: string;
  readonly kind: "node" | "SubTree";
  readonly range?: SourceRange;
  readonly elementRange?: SourceRange;
  readonly parentBehaviorTreeId?: string;
};

export type DocumentBlackboardReference = {
  readonly raw: string;
  readonly key: string;
  readonly scope: BlackboardScope;
  readonly identity: string;
  readonly syntax: BlackboardReferenceSyntax;
  readonly attributeName: string;
  readonly uri: string;
  readonly range?: SourceRange;
};

export type AttributeValueRef = {
  readonly uri: string;
  readonly range: SourceRange;
  readonly value: string;
};

export type BtDocumentModelKind = "bt-xml" | "model-xml" | "unknown";

export type BtDocumentModel = {
  readonly uri: string;
  readonly path?: string;
  readonly isBtXml: boolean;
  readonly kind: BtDocumentModelKind;
  readonly behaviorTrees: readonly BehaviorTreeDef[];
  readonly subtreeReferences: readonly SubTreeReference[];
  readonly nodeUsages: readonly NodeUsageDef[];
  readonly blackboardReferences: readonly DocumentBlackboardReference[];
  readonly treeNodesModel: readonly TreeNodeModelDef[];
  readonly genericSubTreePorts: readonly PortDef[];
  readonly rootMainTreeToExecute?: AttributeValueRef;
};
