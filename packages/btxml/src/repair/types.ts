import type { SourceRange, WorkspaceEdit } from "@btxml/foundation";
import type {
  ModelSourceRef,
  NodeModelSourceKind,
  PortDirection,
  TreeNodeKind,
  TreeNodeModelDef,
} from "@btxml/model";

export type NodeModelConflictDiagnosticData = {
  kind: "node-model-conflict";
  nodeId: string;
  sources: ModelSourceRef[];
  differences: NodeModelDifference[];
};

export type PortDefaultConflictDiagnosticData = {
  kind: "port-default-conflict";
  nodeId: string;
  portName: string;
  sources: Array<{
    source: ModelSourceRef;
    value: string | undefined;
  }>;
};

export type NodeModelDifference =
  | {
      kind: "node-kind";
      left: TreeNodeKind;
      right: TreeNodeKind;
    }
  | {
      kind: "port-added";
      portName: string;
      sourceIndex: number;
      port: SerializablePortSignature;
    }
  | {
      kind: "port-removed";
      portName: string;
      sourceIndex: number;
      port: SerializablePortSignature;
    }
  | {
      kind: "port-direction";
      portName: string;
      left: PortDirection;
      right: PortDirection;
    }
  | {
      kind: "port-type";
      portName: string;
      left?: string;
      right?: string;
    }
  | {
      kind: "port-required";
      portName: string;
      left: boolean;
      right: boolean;
    }
  | {
      kind: "port-default";
      portName: string;
      left?: string;
      right?: string;
    }
  | {
      kind: "port-enum";
      portName: string;
      left?: string[];
      right?: string[];
    }
  | {
      kind: "port-description";
      portName: string;
      left?: string;
      right?: string;
    };

export type SerializablePortSignature = {
  name: string;
  direction: PortDirection;
  type?: string;
  required: boolean;
  defaultValue?: string;
  enum?: string[];
  description?: string;
};

export type ModelConflictCode =
  | "BT012_CONFLICTING_NODE_MODEL"
  | "BT107_CONFLICTING_PORT_DEFAULT"
  | "BT122_DUPLICATE_MODEL_DEFINITION"
  | "BT006_DUPLICATE_NODE_MODEL_ID"
  | "BT008_DUPLICATE_PORT_NAME";

export type SignatureId = string;

export type ModelConflictDefinition = {
  definitionId: string;
  uri?: string;
  sourceKind: NodeModelSourceKind;
  kind: TreeNodeKind;
  range?: SourceRange;
  signatureKey: string;
  signatureId: SignatureId;
  signatureText: string;
  model: TreeNodeModelDef;
};

export type SignatureVariant = {
  id: SignatureId;
  signatureKey: string;
  signatureText: string;
  kind: TreeNodeKind;
  definitions: ModelConflictDefinition[];
  editableDefinitions: ModelConflictDefinition[];
  nonEditableDefinitions: ModelConflictDefinition[];
};

export type SignatureDifference = {
  leftSignatureId: SignatureId;
  rightSignatureId: SignatureId;
  differences: NodeModelDifference[];
};

export type UsageImpact = {
  signatureId: SignatureId;
  newMissingRequiredPorts: Array<{
    portName: string;
    omittedCount: number;
  }>;
  removedPortsUsedByUsages: Array<{
    portName: string;
    providedCount: number;
  }>;
  directionChanges: Array<{
    portName: string;
    from: string;
    to: string;
  }>;
};

export type RepairEditSummary = {
  files: number;
  definitions: number;
  edits: number;
  affectedUris: string[];
};

export type RepairGroupKind =
  | "model-signature-conflict"
  | "duplicate-model-id"
  | "duplicate-port-name";

export type GroupRepairActionKind =
  | "match-signature"
  | "keep-model-definition"
  | "keep-port-definition"
  | "match-canonical-model-file"
  | "keep-canonical-model-file-definition"
  | "manual"
  | "skip";

export type GroupRepairAction = {
  id: string;
  title: string;
  description: string;
  targetSignatureId?: SignatureId;
  kind: GroupRepairActionKind;
  applicable: boolean;
  workspaceEdits: WorkspaceEdit[];
  editSummary: RepairEditSummary;
  usageImpact?: UsageImpact;
  warnings?: string[];
};

export type DifferencePattern = {
  key: string;
  label: string;
};

export type ModelConflictGroup = {
  id: string;
  kind: RepairGroupKind;
  nodeId: string;
  portName?: string;
  displayName: string;
  codes: ModelConflictCode[];
  severity: "error" | "warning";
  definitions: ModelConflictDefinition[];
  signatures: SignatureVariant[];
  differences: SignatureDifference[];
  usageEvidence: NodeModelUsageEvidence;
  usageImpacts: UsageImpact[];
  actions: GroupRepairAction[];
  differencePattern: DifferencePattern;
  pairwiseConflictCount: number;
};

export type NodeModelUsageEvidence = {
  nodeId: string;
  totalUsages: number;
  byPort: Record<string, PortUsageEvidence>;
};

export type PortUsageEvidence = {
  providedCount: number;
  omittedCount: number;
  literalValues: Record<string, number>;
  blackboardReferenceCount: number;
  enumViolations?: Record<string, number>;
};

export type XmlDeclarationPolicy = boolean | "preserve";
