import type { WorkspaceEdit } from "@btxml/foundation";
import { type PortDef, type TreeNodeModelDef, areEquivalentNodeModels } from "@btxml/model";
import type { BtxmlProject } from "@btxml/project";
import {
  type SemanticIndex,
  getAllDocumentModels,
  getModelDefinitionFacts,
  groupModelDefinitionsById,
} from "@btxml/semantic";
import type { BtDocument } from "@btxml/syntax";
import {
  diffNodeModels,
  getDifferencePatternKey,
  getDifferencePatternLabel,
} from "./model-diff.ts";
import { getRepairPortSignatureKey, groupModelsBySignature } from "./signature-groups.ts";
import type {
  GroupRepairAction,
  ModelConflictCode,
  ModelConflictDefinition,
  ModelConflictGroup,
  NodeModelDifference,
  RepairEditSummary,
  SignatureDifference,
  SignatureVariant,
} from "./types.ts";
import { collectNodeModelUsageEvidence, computeUsageImpact } from "./usage-evidence.ts";

type RepairGroupingOptions = {
  includeConventionGroups?: boolean;
  convention?: "allow-unused" | "used-only" | "single-source";
  canonicalSource?: "model-files";
  canonicalMode?: "sync" | "dedupe";
};

function countPairwiseConflicts(models: TreeNodeModelDef[]): number {
  let count = 0;
  for (let index = 0; index < models.length; index++) {
    for (let next = index + 1; next < models.length; next++) {
      if (!areEquivalentNodeModels(models[index], models[next])) {
        count++;
      }
    }
  }
  return count;
}

function hasEditableRepresentative(signature: SignatureVariant, documents: BtDocument[]): boolean {
  return signature.definitions.some((definition) => {
    if (definition.model.editable === false) return false;
    if (definition.range == null) return false;
    return documents.some((document) => document.uri === definition.uri);
  });
}

function buildMatchSignatureEdits(params: {
  targetSignature: SignatureVariant;
  allDefinitions: ModelConflictDefinition[];
  documents: BtDocument[];
}): WorkspaceEdit[] {
  const targetDefinition = params.targetSignature.definitions[0];
  if (!targetDefinition) return [];

  const canonicalDocument = params.documents.find(
    (document) => document.uri === targetDefinition.uri,
  );
  if (!canonicalDocument || !targetDefinition.range) return [];
  const canonicalSnippet = canonicalDocument.originalText.slice(
    targetDefinition.range.start.offset,
    targetDefinition.range.end.offset,
  );

  const edits: WorkspaceEdit[] = [];
  for (const definition of params.allDefinitions) {
    if (definition.signatureId === params.targetSignature.id) continue;
    if (definition.model.editable === false) continue;
    if (definition.range == null) continue;

    const targetDocument = params.documents.find((document) => document.uri === definition.uri);
    if (!targetDocument) continue;

    edits.push({
      uri: definition.uri ?? "",
      edits: [{ range: definition.range, newText: canonicalSnippet }],
    });
  }
  return edits;
}

function buildDeleteDuplicateEdits(params: {
  keepDefinition: ModelConflictDefinition;
  allDefinitions: ModelConflictDefinition[];
}): WorkspaceEdit[] {
  const edits: WorkspaceEdit[] = [];
  for (const definition of params.allDefinitions) {
    if (definition.definitionId === params.keepDefinition.definitionId) continue;
    if (definition.model.editable === false) continue;
    if (definition.range == null) continue;
    edits.push({
      uri: definition.uri ?? "",
      edits: [{ range: definition.range, newText: "" }],
    });
  }
  return edits;
}

function buildKeepPortVariantEdits(params: {
  model: TreeNodeModelDef;
  portName: string;
  keepDefinition: ModelConflictDefinition;
}): WorkspaceEdit[] {
  if (params.model.editable === false) return [];

  const edits: WorkspaceEdit[] = [];
  const keepStart = params.keepDefinition.range?.start.offset;
  const duplicatePorts = params.model.ports.filter((port) => port.name === params.portName);

  for (const port of duplicatePorts) {
    const portRange = port.range ?? port.nameRange;
    if (!portRange) continue;
    if (keepStart != null && portRange.start.offset === keepStart) continue;

    edits.push({
      uri: params.model.uri ?? "",
      edits: [{ range: portRange, newText: "" }],
    });
  }

  return edits;
}

function buildEditSummary(edits: WorkspaceEdit[]): RepairEditSummary {
  const uriSet = new Set<string>();
  let editCount = 0;
  for (const edit of edits) {
    uriSet.add(edit.uri);
    editCount += edit.edits.length;
  }
  return {
    files: uriSet.size,
    definitions: editCount,
    edits: editCount,
    affectedUris: Array.from(uriSet).sort(),
  };
}

export function formatEditSummary(summary: RepairEditSummary): string {
  if (summary.definitions === 0) return "edits: none";
  if (summary.definitions === 1 && summary.files === 1) return "edits: 1 definition in 1 file";
  return `edits: ${summary.definitions} definition${summary.definitions === 1 ? "" : "s"} in ${summary.files} file${summary.files === 1 ? "" : "s"}`;
}

function buildGroupRepairActions(params: {
  group: Omit<ModelConflictGroup, "actions" | "usageImpacts">;
  documents: BtDocument[];
  options?: RepairGroupingOptions;
}): GroupRepairAction[] {
  const actions: GroupRepairAction[] = [];
  const { group, documents } = params;
  const hasAnyNonEditable = group.signatures.some(
    (signature) => signature.nonEditableDefinitions.length > 0,
  );

  if (group.kind === "model-signature-conflict") {
    for (const signature of group.signatures) {
      if (!hasEditableRepresentative(signature, documents)) continue;
      const otherEditableCount = group.definitions.filter(
        (definition) =>
          definition.signatureId !== signature.id &&
          definition.model.editable !== false &&
          definition.range != null,
      ).length;
      if (otherEditableCount === 0) continue;

      const targetEdits = buildMatchSignatureEdits({
        targetSignature: signature,
        allDefinitions: group.definitions,
        documents,
      });
      if (targetEdits.length === 0) continue;

      actions.push({
        id: `match-signature-${signature.id}`,
        title: hasAnyNonEditable
          ? `Make editable definitions match signature ${signature.id}`
          : `Make all definitions match signature ${signature.id}`,
        description: `Replace editable definitions that do not match signature ${signature.id}.`,
        kind: "match-signature",
        applicable: true,
        targetSignatureId: signature.id,
        workspaceEdits: targetEdits,
        editSummary: buildEditSummary(targetEdits),
        usageImpact: computeUsageImpact({ signature, usageEvidence: group.usageEvidence }),
      });
    }
  } else if (group.kind === "duplicate-model-id") {
    const seenSignatureKeys = new Set<string>();
    for (const definition of group.definitions) {
      if (seenSignatureKeys.has(definition.signatureKey)) continue;
      seenSignatureKeys.add(definition.signatureKey);

      const deleteEdits = buildDeleteDuplicateEdits({
        keepDefinition: definition,
        allDefinitions: group.definitions,
      });
      const sameSignatureCount = group.definitions.filter(
        (entry) => entry.signatureKey === definition.signatureKey,
      ).length;
      if (deleteEdits.length === 0) continue;

      actions.push({
        id: `keep-definition-${definition.signatureId}`,
        title:
          sameSignatureCount > 1
            ? "Keep the first definition and delete duplicate copies"
            : `Keep variant ${definition.signatureId} and delete duplicate \`${group.nodeId}\` definitions in this file`,
        description:
          sameSignatureCount > 1
            ? `Keep one definition and remove ${sameSignatureCount - 1} duplicate copies.`
            : `Keep ${definition.definitionId} and remove other duplicate definitions.`,
        kind: "keep-model-definition",
        applicable: true,
        workspaceEdits: deleteEdits,
        editSummary: buildEditSummary(deleteEdits),
      });
    }
  } else if (group.kind === "duplicate-port-name") {
    const seenSignatureKeys = new Set<string>();
    for (const definition of group.definitions) {
      if (seenSignatureKeys.has(definition.signatureKey)) continue;
      seenSignatureKeys.add(definition.signatureKey);

      const deleteEdits = buildKeepPortVariantEdits({
        model: definition.model,
        portName: group.portName ?? group.nodeId,
        keepDefinition: definition,
      });
      if (deleteEdits.length === 0) continue;

      const sameSignatureCount = group.definitions.filter(
        (entry) => entry.signatureKey === definition.signatureKey,
      ).length;

      actions.push({
        id: `keep-port-${definition.signatureId}`,
        title:
          sameSignatureCount > 1
            ? `Keep the first \`${group.portName ?? group.nodeId}\` port and delete duplicate copies`
            : `Keep port variant ${definition.signatureId} and delete other \`${group.portName ?? group.nodeId}\` ports`,
        description:
          sameSignatureCount > 1
            ? `Keep one \`${group.portName ?? group.nodeId}\` port and remove duplicate copies.`
            : `Keep \`${group.portName ?? group.nodeId}\` port variant ${definition.signatureId} and remove others.`,
        kind: "keep-port-definition",
        applicable: true,
        workspaceEdits: deleteEdits,
        editSummary: buildEditSummary(deleteEdits),
      });
    }
  }

  if (params.options?.canonicalSource === "model-files") {
    const kinds = new Set(group.definitions.map((definition) => definition.kind));
    if (kinds.size > 1) {
      // same ID with different kinds must remain manual (no deterministic canonical action)
      return [
        ...actions,
        {
          id: "manual",
          title: "Manual update required",
          description: "No editable definitions are available for automatic repair.",
          kind: "manual",
          applicable: false,
          workspaceEdits: [],
          editSummary: { files: 0, definitions: 0, edits: 0, affectedUris: [] },
        },
        {
          id: "skip",
          title: "Skip this model group",
          description: "Do not change any definitions for this node model.",
          kind: "skip",
          applicable: false,
          workspaceEdits: [],
          editSummary: { files: 0, definitions: 0, edits: 0, affectedUris: [] },
        },
      ];
    }

    const canonicalDefinitions = group.definitions.filter(
      (definition) => definition.sourceKind === "external-tree-nodes-model",
    );

    if (canonicalDefinitions.length === 1) {
      const canonicalDefinition = canonicalDefinitions[0];
      const canonicalSignature = group.signatures.find(
        (signature) => signature.id === canonicalDefinition.signatureId,
      );

      if (canonicalSignature) {
        if (params.options.canonicalMode === "sync") {
          const syncEdits = buildMatchSignatureEdits({
            targetSignature: canonicalSignature,
            allDefinitions: group.definitions,
            documents,
          });

          if (syncEdits.length > 0) {
            actions.push({
              id: "match-canonical-model-file",
              title: "Make definitions match canonical model file",
              description:
                "Replace editable non-canonical definitions with the canonical model-file definition.",
              kind: "match-canonical-model-file",
              applicable: true,
              targetSignatureId: canonicalSignature.id,
              workspaceEdits: syncEdits,
              editSummary: buildEditSummary(syncEdits),
              usageImpact: computeUsageImpact({
                signature: canonicalSignature,
                usageEvidence: group.usageEvidence,
              }),
            });
          }
        }

        if (params.options.canonicalMode === "dedupe") {
          const dedupeEdits = buildDeleteDuplicateEdits({
            keepDefinition: canonicalDefinition,
            allDefinitions: group.definitions,
          });

          if (dedupeEdits.length > 0) {
            actions.push({
              id: "keep-canonical-model-file-definition",
              title: "Keep canonical model file definition and delete duplicates",
              description:
                "Delete editable non-canonical duplicate definitions and keep the canonical model-file definition.",
              kind: "keep-canonical-model-file-definition",
              applicable: true,
              targetSignatureId: canonicalSignature.id,
              workspaceEdits: dedupeEdits,
              editSummary: buildEditSummary(dedupeEdits),
              usageImpact: computeUsageImpact({
                signature: canonicalSignature,
                usageEvidence: group.usageEvidence,
              }),
            });
          }
        }
      }
    }
  }

  if (actions.length === 0) {
    actions.push({
      id: "manual",
      title: "Manual update required",
      description: "No editable definitions are available for automatic repair.",
      kind: "manual",
      applicable: false,
      workspaceEdits: [],
      editSummary: { files: 0, definitions: 0, edits: 0, affectedUris: [] },
    });
  }

  actions.push({
    id: "skip",
    title: "Skip this model group",
    description: "Do not change any definitions for this node model.",
    kind: "skip",
    applicable: false,
    workspaceEdits: [],
    editSummary: { files: 0, definitions: 0, edits: 0, affectedUris: [] },
  });

  return actions;
}

function diffDuplicatePorts(left: PortDef, right: PortDef): NodeModelDifference[] {
  const differences: NodeModelDifference[] = [];
  if (left.direction !== right.direction) {
    differences.push({
      kind: "port-direction",
      portName: left.name,
      left: left.direction,
      right: right.direction,
    });
  }
  if (left.type !== right.type) {
    differences.push({
      kind: "port-type",
      portName: left.name,
      left: left.type,
      right: right.type,
    });
  }
  if (left.required !== right.required) {
    differences.push({
      kind: "port-required",
      portName: left.name,
      left: left.required,
      right: right.required,
    });
  }
  if (left.defaultValue !== right.defaultValue) {
    differences.push({
      kind: "port-default",
      portName: left.name,
      left: left.defaultValue,
      right: right.defaultValue,
    });
  }
  const leftEnum = left.enum ? JSON.stringify([...left.enum].sort()) : "";
  const rightEnum = right.enum ? JSON.stringify([...right.enum].sort()) : "";
  if (leftEnum !== rightEnum) {
    differences.push({
      kind: "port-enum",
      portName: left.name,
      left: left.enum ? [...left.enum].sort() : undefined,
      right: right.enum ? [...right.enum].sort() : undefined,
    });
  }
  return differences;
}

function buildSignatureDifferences(signatures: SignatureVariant[]): SignatureDifference[] {
  const differences: SignatureDifference[] = [];
  for (let index = 0; index < signatures.length; index++) {
    for (let next = index + 1; next < signatures.length; next++) {
      const left = signatures[index].definitions[0]?.model;
      const right = signatures[next].definitions[0]?.model;
      if (!left || !right) continue;
      const diff = diffNodeModels(left, right);
      if (diff.length > 0) {
        differences.push({
          leftSignatureId: signatures[index].id,
          rightSignatureId: signatures[next].id,
          differences: diff,
        });
      }
    }
  }
  return differences;
}

function determineCodesAndSeverity(differences: SignatureDifference[]): {
  codes: ModelConflictCode[];
  severity: "error" | "warning";
} {
  const allDiffs = differences.flatMap((difference) => difference.differences);
  const hasNonDefault = allDiffs.some((difference) => difference.kind !== "port-default");
  const hasDefault = allDiffs.some((difference) => difference.kind === "port-default");

  const codes: ModelConflictCode[] = [];
  if (hasNonDefault) codes.push("BT012_CONFLICTING_NODE_MODEL");
  if (hasDefault) codes.push("BT107_CONFLICTING_PORT_DEFAULT");

  return {
    codes,
    severity: hasNonDefault ? "error" : "warning",
  };
}

function createModelGroup(params: {
  nodeId: string;
  models: TreeNodeModelDef[];
  documents: BtDocument[];
  code: ModelConflictCode;
  kind?: "model-signature-conflict" | "duplicate-model-id";
  forceIncludeEquivalent?: boolean;
  options?: RepairGroupingOptions;
}): ModelConflictGroup | undefined {
  const { nodeId, models, documents, code } = params;
  if (models.length < 2) return undefined;

  const signatures = groupModelsBySignature(models);
  if (
    signatures.length < 2 &&
    code !== "BT006_DUPLICATE_NODE_MODEL_ID" &&
    !params.forceIncludeEquivalent
  ) {
    return undefined;
  }

  const definitions = signatures.flatMap((signature) => signature.definitions);
  const pairwiseConflictCount = countPairwiseConflicts(models);

  let codes: ModelConflictCode[];
  let severity: "error" | "warning";

  if (code === "BT006_DUPLICATE_NODE_MODEL_ID") {
    if (signatures.length === 1) {
      codes = ["BT006_DUPLICATE_NODE_MODEL_ID"];
      severity = "error";
    } else {
      const signatureDiffs = buildSignatureDifferences(signatures);
      const result = determineCodesAndSeverity(signatureDiffs);
      codes = ["BT006_DUPLICATE_NODE_MODEL_ID", ...result.codes];
      severity = result.severity;
    }
  } else {
    if (signatures.length < 2 && params.forceIncludeEquivalent) {
      codes = [code];
      severity = "error";
      const candidatePorts = [
        ...new Set(
          definitions.flatMap((definition) => definition.model.ports.map((port) => port.name)),
        ),
      ];
      const usageEvidence = collectNodeModelUsageEvidence({ nodeId, documents, candidatePorts });
      const groupBase: Omit<ModelConflictGroup, "actions" | "usageImpacts"> = {
        id: `model-group:${nodeId}:equivalent`,
        kind: params.kind ?? "model-signature-conflict",
        nodeId,
        displayName: nodeId,
        codes,
        severity,
        definitions,
        signatures,
        differences: [],
        usageEvidence,
        differencePattern: { key: "equivalent", label: "equivalent signatures" },
        pairwiseConflictCount,
      };

      return {
        ...groupBase,
        actions: buildGroupRepairActions({
          group: groupBase,
          documents,
          options: params.options,
        }),
        usageImpacts: signatures.map((signature) =>
          computeUsageImpact({ signature, usageEvidence: groupBase.usageEvidence }),
        ),
      };
    }

    const signatureDiffs = buildSignatureDifferences(signatures);
    const result = determineCodesAndSeverity(signatureDiffs);
    codes = result.codes;
    severity = result.severity;
    if (codes.length === 0) return undefined;
  }

  const candidatePorts = [
    ...new Set(
      definitions.flatMap((definition) => definition.model.ports.map((port) => port.name)),
    ),
  ];
  const usageEvidence = collectNodeModelUsageEvidence({ nodeId, documents, candidatePorts });
  const differences = buildSignatureDifferences(signatures);
  const allDiffs = differences.flatMap((difference) => difference.differences);
  const patternKey = getDifferencePatternKey(allDiffs);
  const patternLabel = getDifferencePatternLabel(allDiffs);

  const groupBase: Omit<ModelConflictGroup, "actions" | "usageImpacts"> = {
    id: `model-group:${nodeId}:${patternKey}`,
    kind:
      params.kind ??
      (code === "BT006_DUPLICATE_NODE_MODEL_ID"
        ? "duplicate-model-id"
        : "model-signature-conflict"),
    nodeId,
    displayName: nodeId,
    codes,
    severity,
    definitions,
    signatures,
    differences,
    usageEvidence,
    differencePattern: { key: patternKey, label: patternLabel },
    pairwiseConflictCount,
  };

  return {
    ...groupBase,
    actions: buildGroupRepairActions({ group: groupBase, documents, options: params.options }),
    usageImpacts: signatures.map((signature) => computeUsageImpact({ signature, usageEvidence })),
  };
}

function buildDuplicateModelGroups(
  workspace: SemanticIndex,
  documents: BtDocument[],
): ModelConflictGroup[] {
  const groups: ModelConflictGroup[] = [];
  for (const documentModel of getAllDocumentModels(workspace)) {
    const byId = new Map<string, TreeNodeModelDef[]>();
    for (const model of documentModel.treeNodesModel) {
      const list = byId.get(model.id) ?? [];
      list.push(model);
      byId.set(model.id, list);
    }
    for (const [nodeId, models] of byId) {
      if (models.length < 2) continue;
      const group = createModelGroup({
        nodeId,
        models,
        documents,
        code: "BT006_DUPLICATE_NODE_MODEL_ID",
        kind: "duplicate-model-id",
      });
      if (group) groups.push(group);
    }
  }
  return groups;
}

function createDuplicatePortGroup(params: {
  model: TreeNodeModelDef;
  portName: string;
  ports: PortDef[];
  documents: BtDocument[];
}): ModelConflictGroup | undefined {
  const { model, portName, ports, documents } = params;

  const clusters = new Map<string, PortDef[]>();
  for (const port of ports) {
    const key = getRepairPortSignatureKey(port);
    const list = clusters.get(key) ?? [];
    list.push(port);
    clusters.set(key, list);
  }

  const clusterEntries = Array.from(clusters.entries()).sort(
    (left, right) =>
      (left[1][0]?.range?.start.offset ?? 0) - (right[1][0]?.range?.start.offset ?? 0),
  );
  const signatureIds = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const signatures: SignatureVariant[] = [];

  for (let index = 0; index < clusterEntries.length; index++) {
    const [signatureKey, clusterPorts] = clusterEntries[index];
    const signatureId = signatureIds[index] ?? `S${index}`;
    const representativePort = clusterPorts[0];
    const signatureText = `${model.kind} ${model.id}(${representativePort.direction} ${representativePort.name}${representativePort.type ? `: ${representativePort.type}` : ""}${representativePort.defaultValue ? ` = \"${representativePort.defaultValue}\"` : ""})`;

    const definitions = clusterPorts.map((port, portIndex) => {
      const portRange = port.range ?? port.nameRange;
      return {
        definitionId: `${model.id}:${model.uri ?? ""}:${model.range?.start.offset ?? 0}:port:${portName}:${portRange?.start.offset ?? portIndex}`,
        uri: model.uri,
        sourceKind: model.source || "inline-tree-nodes-model",
        kind: model.kind,
        range: portRange,
        signatureKey,
        signatureId,
        signatureText,
        model,
      };
    });

    signatures.push({
      id: signatureId,
      signatureKey,
      signatureText,
      kind: model.kind,
      definitions,
      editableDefinitions: definitions.filter((definition) => definition.model.editable !== false),
      nonEditableDefinitions: definitions.filter(
        (definition) => definition.model.editable === false,
      ),
    });
  }

  const differences: SignatureDifference[] = [];
  for (let index = 0; index < signatures.length; index++) {
    for (let next = index + 1; next < signatures.length; next++) {
      const leftPort = signatures[index].definitions[0]?.model.ports.find((port) => {
        const portRange = port.range ?? port.nameRange;
        const definitionRange = signatures[index].definitions[0]?.range;
        return (
          portRange && definitionRange && portRange.start.offset === definitionRange.start.offset
        );
      });
      const rightPort = signatures[next].definitions[0]?.model.ports.find((port) => {
        const portRange = port.range ?? port.nameRange;
        const definitionRange = signatures[next].definitions[0]?.range;
        return (
          portRange && definitionRange && portRange.start.offset === definitionRange.start.offset
        );
      });
      if (!leftPort || !rightPort) continue;
      const portDifferences = diffDuplicatePorts(leftPort, rightPort);
      if (portDifferences.length > 0) {
        differences.push({
          leftSignatureId: signatures[index].id,
          rightSignatureId: signatures[next].id,
          differences: portDifferences,
        });
      }
    }
  }

  const allDiffs = differences.flatMap((difference) => difference.differences);
  const groupBase: Omit<ModelConflictGroup, "actions" | "usageImpacts"> = {
    id: `duplicate-port:${model.id}:${portName}:${model.uri ?? ""}:${ports[0]?.range?.start.offset ?? 0}`,
    kind: "duplicate-port-name",
    nodeId: model.id,
    portName,
    displayName: `${model.id}.${portName}`,
    codes: ["BT008_DUPLICATE_PORT_NAME"],
    severity: "error",
    definitions: signatures.flatMap((signature) => signature.definitions),
    signatures,
    differences,
    usageEvidence: collectNodeModelUsageEvidence({
      nodeId: model.id,
      documents,
      candidatePorts: [portName],
    }),
    differencePattern: {
      key: getDifferencePatternKey(allDiffs),
      label: getDifferencePatternLabel(allDiffs),
    },
    pairwiseConflictCount: Math.max(1, ports.length - 1),
  };

  return {
    ...groupBase,
    actions: buildGroupRepairActions({ group: groupBase, documents }),
    usageImpacts: signatures.map((signature) =>
      computeUsageImpact({ signature, usageEvidence: groupBase.usageEvidence }),
    ),
  };
}

function buildDuplicatePortGroups(
  workspace: SemanticIndex,
  documents: BtDocument[],
): ModelConflictGroup[] {
  const groups: ModelConflictGroup[] = [];
  for (const documentModel of getAllDocumentModels(workspace)) {
    for (const model of documentModel.treeNodesModel) {
      const portsByName = new Map<string, PortDef[]>();
      for (const port of model.ports) {
        const list = portsByName.get(port.name) ?? [];
        list.push(port);
        portsByName.set(port.name, list);
      }
      for (const [portName, ports] of portsByName) {
        if (ports.length < 2) continue;
        const group = createDuplicatePortGroup({ model, portName, ports, documents });
        if (group) groups.push(group);
      }
    }
  }
  return groups;
}

function collectNodeIdsWithDuplicateModels(workspace: SemanticIndex): Set<string> {
  const ids = new Set<string>();
  for (const documentModel of getAllDocumentModels(workspace)) {
    const byId = new Map<string, TreeNodeModelDef[]>();
    for (const model of documentModel.treeNodesModel) {
      const list = byId.get(model.id) ?? [];
      list.push(model);
      byId.set(model.id, list);
    }
    for (const [nodeId, models] of byId) {
      if (models.length >= 2) ids.add(nodeId);
    }
  }
  return ids;
}

function collectAllLayerModelsById(workspace: SemanticIndex): Map<string, TreeNodeModelDef[]> {
  const groupedFacts = groupModelDefinitionsById(getModelDefinitionFacts(workspace));
  const byId = new Map<string, TreeNodeModelDef[]>();

  for (const [id, facts] of groupedFacts) {
    byId.set(
      id,
      facts.map((fact) => fact.model),
    );
  }

  return byId;
}

export function buildModelConflictRepairGroups(input: {
  documents: BtDocument[];
  workspace: SemanticIndex;
  project?: BtxmlProject;
  options?: RepairGroupingOptions;
}): ModelConflictGroup[] {
  const groups: ModelConflictGroup[] = [];
  const nodeIdsWithLocalDuplicates = collectNodeIdsWithDuplicateModels(input.workspace);

  for (const [nodeId, models] of collectAllLayerModelsById(input.workspace)) {
    if (models.length < 2) continue;
    if (nodeIdsWithLocalDuplicates.has(nodeId)) continue;
    const group = createModelGroup({
      nodeId,
      models,
      documents: input.documents,
      code:
        input.options?.includeConventionGroups === true
          ? "BT122_DUPLICATE_MODEL_DEFINITION"
          : "BT012_CONFLICTING_NODE_MODEL",
      forceIncludeEquivalent: input.options?.includeConventionGroups === true,
      options: input.options,
    });
    if (group) groups.push(group);
  }

  groups.push(...buildDuplicateModelGroups(input.workspace, input.documents));
  groups.push(...buildDuplicatePortGroups(input.workspace, input.documents));

  return groups;
}
