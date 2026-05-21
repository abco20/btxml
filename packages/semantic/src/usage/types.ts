import type { PortDef, TreeNodeModelDef } from "@btxml/model";
import type { BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import type { SubTreeResolution } from "../subtree-resolution.js";

export type NodeTagForm =
  | "root"
  | "behavior-tree"
  | "tree-nodes-model"
  | "model-definition"
  | "include"
  | "concrete-node"
  | "generic-node"
  | "subtree"
  | "unknown-xml";

export type UnknownSubTreePortMode = "allow" | "reject";

export type NodeUsagePolicy = {
  readonly unknownSubTreePorts: UnknownSubTreePortMode;
};

export type NodeUsageModelResolution =
  | {
      readonly status: "resolved";
      readonly model: TreeNodeModelDef;
    }
  | {
      readonly status: "ambiguous";
      readonly nodeType: string;
      readonly candidates: readonly TreeNodeModelDef[];
    }
  | {
      readonly status: "unresolved";
      readonly nodeType: string | undefined;
    }
  | {
      readonly status: "not-a-node";
    };

export type PortUsageResolution =
  | {
      readonly status: "resolved";
      readonly attribute: BtXmlAttribute;
      readonly name: string;
      readonly value: string;
      readonly port: PortDef;
    }
  | {
      readonly status: "undeclared";
      readonly attribute: BtXmlAttribute;
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly status: "allowed-arbitrary";
      readonly attribute: BtXmlAttribute;
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly status: "reserved-attribute";
      readonly attribute: BtXmlAttribute;
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly status: "unknown-node-model";
      readonly attribute: BtXmlAttribute;
      readonly name: string;
      readonly value: string;
    };

export type NodeUsageResolution = {
  readonly element: BtXmlElement;
  readonly tagName: string;
  readonly tagForm: NodeTagForm;
  readonly nodeType?: string;
  readonly model: NodeUsageModelResolution;
  readonly subtree?: {
    readonly id?: string;
    readonly target: SubTreeResolution;
  };
  readonly ports: readonly PortDef[];
  readonly allowsArbitraryAttributes: boolean;
  readonly portUsages: readonly PortUsageResolution[];
};

export type UsageResolverBehaviorTreeIdPolicy =
  | "workspace-unique"
  | "file-local-first"
  | "allow-ambiguous";

export type UsageResolverConfig = {
  readonly resolver?: {
    readonly behaviorTreeIds?: UsageResolverBehaviorTreeIdPolicy;
  };
};

export type ResolveNodeUsageInput = {
  readonly element: BtXmlElement;

  /**
   * Root element of the parsed document that owns `element`.
   *
   * Required for distinguishing runtime node usages from TreeNodesModel
   * declarations such as <Action>, <Condition>, <SubTree>, and port
   * definition tags.
   *
   * Pass undefined only for intentionally detached elements.
   */
  readonly documentRoot: BtXmlElement | undefined;
  readonly uri?: string;
  readonly config?: UsageResolverConfig;
  readonly policy?: Partial<NodeUsagePolicy>;
  readonly isModelDefinition?: boolean;
};

export type ResolvePortUsageInput = ResolveNodeUsageInput & {
  readonly attributeName: string;
};
