import type { BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import type {
  BehaviorTreeDef,
  BtDocumentModel,
  DocumentBlackboardReference,
  PortDef,
  SubTreeReference,
  TreeNodeModelDef,
} from "./public-types.js";

export type ExtractedBehaviorTreeDef = BehaviorTreeDef & {
  readonly element: BtXmlElement;
};

export type ExtractedPortDef = PortDef & {
  readonly element: BtXmlElement;
};

export type ExtractedTreeNodeModelDef = Omit<TreeNodeModelDef, "ports"> & {
  readonly element: BtXmlElement;
  readonly ports: readonly ExtractedPortDef[];
};

export type ExtractedSubTreeReference = SubTreeReference & {
  readonly element: BtXmlElement;
  readonly attributes?: readonly BtXmlAttribute[];
};

export type ExtractedBlackboardReference = DocumentBlackboardReference & {
  readonly element: BtXmlElement;
};

export type ExtractedDocumentModel = {
  readonly publicModel: BtDocumentModel;
  readonly extractedBehaviorTrees: readonly ExtractedBehaviorTreeDef[];
  readonly extractedTreeNodesModel: readonly ExtractedTreeNodeModelDef[];
  readonly extractedSubTreeReferences: readonly ExtractedSubTreeReference[];
  readonly extractedBlackboardReferences: readonly ExtractedBlackboardReference[];
};
