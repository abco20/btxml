import { formatEditSummary } from "./repair/model-conflicts.ts";
import type { GroupRepairAction, ModelConflictGroup, UsageImpact } from "./repair/types.ts";

export type RepairResult = {
  ok: boolean;
  groups: ModelConflictGroup[];
};

export function isWritableRepairAction(action: GroupRepairAction): boolean {
  return action.applicable === true;
}

export function getWritableActions(group: ModelConflictGroup): GroupRepairAction[] {
  return group.actions.filter(isWritableRepairAction);
}

export function getManualActions(group: ModelConflictGroup): GroupRepairAction[] {
  return group.actions.filter((a) => a.kind === "manual");
}

function summarizeGroupKinds(groups: ModelConflictGroup[]): {
  signatureConflictGroups: number;
  duplicateModelGroups: number;
  duplicatePortGroups: number;
  pairwiseSignatureConflicts: number;
} {
  return {
    signatureConflictGroups: groups.filter((g) => g.kind === "model-signature-conflict").length,
    duplicateModelGroups: groups.filter((g) => g.kind === "duplicate-model-id").length,
    duplicatePortGroups: groups.filter((g) => g.kind === "duplicate-port-name").length,
    pairwiseSignatureConflicts: groups
      .filter((g) => g.kind === "model-signature-conflict")
      .reduce((sum, g) => sum + g.pairwiseConflictCount, 0),
  };
}

function formatGroupListSummary(group: ModelConflictGroup): string {
  switch (group.kind) {
    case "duplicate-port-name":
      return `1 model definition, ${group.definitions.length} duplicate ports, ${group.signatures.length} variants`;
    case "duplicate-model-id":
      return `1 file, ${group.definitions.length} duplicate model definitions, ${group.signatures.length} variants`;
    case "model-signature-conflict":
      return `${group.definitions.length} definitions, ${group.signatures.length} signatures`;
  }
}

function formatUsageEvidence(group: ModelConflictGroup): string[] {
  const total = group.usageEvidence.totalUsages;
  const lines: string[] = [];
  lines.push(`${group.displayName} usages: ${total}`);

  if (total === 0) {
    lines.push("  no usage evidence available");
    return lines;
  }

  for (const [portName, evidence] of Object.entries(group.usageEvidence.byPort)) {
    const parts: string[] = [];
    parts.push(`provided ${evidence.providedCount}/${total}`);
    if (evidence.blackboardReferenceCount > 0) {
      parts.push(`blackboard refs ${evidence.blackboardReferenceCount}`);
    }
    lines.push(`  ${portName}: ${parts.join(", ")}`);
  }
  return lines;
}

function formatUsageCheck(impact: UsageImpact): string {
  const parts: string[] = [];
  if (impact.newMissingRequiredPorts.length > 0) {
    for (const p of impact.newMissingRequiredPorts) {
      parts.push(
        `would produce ${p.omittedCount} missing required-port report${p.omittedCount === 1 ? "" : "s"} for \`${p.portName}\``,
      );
    }
  }
  if (impact.removedPortsUsedByUsages.length > 0) {
    for (const p of impact.removedPortsUsedByUsages) {
      parts.push(
        `\`${p.portName}\` is used in ${p.providedCount} usage${p.providedCount === 1 ? "" : "s"} but is not defined by this signature`,
      );
    }
  }
  if (impact.directionChanges.length > 0) {
    for (const c of impact.directionChanges) {
      parts.push(`changes \`${c.portName}\` direction from ${c.from} to ${c.to}`);
    }
  }
  if (parts.length === 0) {
    return "no existing usage omits required ports in this signature";
  }
  return parts.join("; ");
}

function formatSignatureDifferences(group: ModelConflictGroup): string[] {
  const lines: string[] = [];
  for (const sigDiff of group.differences) {
    lines.push(`  ${sigDiff.leftSignatureId} vs ${sigDiff.rightSignatureId}:`);
    for (const diff of sigDiff.differences) {
      switch (diff.kind) {
        case "node-kind":
          lines.push(
            `    node kind: ${sigDiff.leftSignatureId}: ${diff.left}, ${sigDiff.rightSignatureId}: ${diff.right}`,
          );
          break;
        case "port-added":
          lines.push(
            `    ${diff.portName}: ${sigDiff.rightSignatureId}: exists, ${sigDiff.leftSignatureId}: not defined`,
          );
          break;
        case "port-removed":
          lines.push(
            `    ${diff.portName}: ${sigDiff.leftSignatureId}: exists, ${sigDiff.rightSignatureId}: not defined`,
          );
          break;
        case "port-direction":
          lines.push(
            `    ${diff.portName}: ${sigDiff.leftSignatureId}: ${diff.left}, ${sigDiff.rightSignatureId}: ${diff.right}`,
          );
          break;
        case "port-type":
          lines.push(
            `    ${diff.portName}: ${sigDiff.leftSignatureId}: type ${diff.left ?? "not specified"}, ${sigDiff.rightSignatureId}: type ${diff.right ?? "not specified"}`,
          );
          break;
        case "port-required":
          lines.push(
            `    ${diff.portName}: ${sigDiff.leftSignatureId}: ${diff.left ? "required" : "optional"}, ${sigDiff.rightSignatureId}: ${diff.right ? "required" : "optional"}`,
          );
          break;
        case "port-default":
          lines.push(
            `    ${diff.portName}: ${sigDiff.leftSignatureId}: default ${diff.left ?? "not set"}, ${sigDiff.rightSignatureId}: default ${diff.right ?? "not set"}`,
          );
          break;
        case "port-enum":
          lines.push(
            `    ${diff.portName}: ${sigDiff.leftSignatureId}: enum ${diff.left?.join(";") ?? "not set"}, ${sigDiff.rightSignatureId}: enum ${diff.right?.join(";") ?? "not set"}`,
          );
          break;
        case "port-description": {
          const truncate = (s?: string) => {
            if (!s) return "not set";
            if (s.length > 120) return `${s.slice(0, 120)}...`;
            return s;
          };
          lines.push(
            `    - port \`${diff.portName}\` description differs`,
            `      ${sigDiff.leftSignatureId}: "${truncate(diff.left)}"`,
            `      ${sigDiff.rightSignatureId}: "${truncate(diff.right)}"`,
          );
          break;
        }
      }
    }
  }
  return lines;
}

export function printRepairGroupDetail(
  group: ModelConflictGroup,
  params?: { index?: number; total?: number },
): string {
  const lines: string[] = [];
  const prefix =
    params?.index !== undefined
      ? `[${params.index}${params.total ? `/${params.total}` : ""}] `
      : "";
  lines.push(`${prefix}${group.displayName}`);
  lines.push("");

  if (group.kind === "duplicate-port-name") {
    lines.push(
      `1 model definition contains ${group.definitions.length} ports named \`${group.portName ?? group.nodeId}\`.`,
    );
  } else if (group.kind === "duplicate-model-id") {
    lines.push(
      `1 file contains ${group.definitions.length} definitions with ID \`${group.nodeId}\`.`,
    );
  } else {
    lines.push(
      `${group.definitions.length} definitions have ${group.signatures.length} signatures.`,
    );
  }
  lines.push(`codes: ${group.codes.join(", ")}`);
  lines.push("");

  for (const sig of group.signatures) {
    const label =
      group.kind === "duplicate-port-name"
        ? "port variant"
        : group.kind === "model-signature-conflict"
          ? "signature"
          : "variant";
    lines.push(`${label} ${sig.id}`);
    lines.push(`  ${sig.signatureText}`);
    lines.push("  locations:");
    for (const def of sig.definitions) {
      const loc = def.range
        ? `${def.uri ?? ""}:${def.range.start.line + 1}:${def.range.start.character + 1}`
        : (def.uri ?? "unknown");
      lines.push(`    ${loc}`);
    }
    lines.push("");
  }

  if (group.differences.length > 0) {
    lines.push("differences:");
    lines.push(...formatSignatureDifferences(group));
    lines.push("");
  }

  lines.push("usage:");
  lines.push(...formatUsageEvidence(group).map((l) => `  ${l}`));
  lines.push("");

  if (group.usageImpacts.length > 0) {
    lines.push("usage check:");
    for (const impact of group.usageImpacts) {
      lines.push(`  choose ${impact.signatureId}: ${formatUsageCheck(impact)}`);
    }
    lines.push("");
  }

  const writableActions = getWritableActions(group);
  if (writableActions.length > 0) {
    lines.push("actions:");
    for (let a = 0; a < writableActions.length; a++) {
      const action = writableActions[a];
      lines.push(`  ${a + 1}. ${action.title}`);
      const desc = formatEditSummary(action.editSummary);
      if (desc !== "edits: none") {
        lines.push(`     ${desc}`);
      }
      if (action.warnings) {
        for (const warning of action.warnings) {
          lines.push(`     warning: ${warning}`);
        }
      }
    }
    lines.push("");
  }

  const manualActions = getManualActions(group);
  if (manualActions.length > 0) {
    lines.push("manual:");
    for (const action of manualActions) {
      lines.push(`  ${action.description}`);
      if (action.warnings) {
        for (const warning of action.warnings) {
          lines.push(`  warning: ${warning}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function printRepairHuman(result: RepairResult): string {
  if (result.groups.length === 0) {
    return "ok: no model conflicts found";
  }

  const summary = summarizeGroupKinds(result.groups);
  const lines: string[] = [];
  lines.push(
    `model repair: ${result.groups.length} group${result.groups.length === 1 ? "" : "s"} need${result.groups.length === 1 ? "s" : ""} attention`,
  );

  if (summary.signatureConflictGroups > 0) {
    lines.push(
      `  ${summary.signatureConflictGroups} signature conflict group${summary.signatureConflictGroups === 1 ? "" : "s"}`,
    );
  }
  if (summary.duplicateModelGroups > 0) {
    lines.push(
      `  ${summary.duplicateModelGroups} duplicate model group${summary.duplicateModelGroups === 1 ? "" : "s"}`,
    );
  }
  if (summary.duplicatePortGroups > 0) {
    lines.push(
      `  ${summary.duplicatePortGroups} duplicate port group${summary.duplicatePortGroups === 1 ? "" : "s"}`,
    );
  }
  if (summary.pairwiseSignatureConflicts > 0) {
    lines.push(
      `${summary.pairwiseSignatureConflicts} pairwise signature conflict${summary.pairwiseSignatureConflicts === 1 ? "" : "s"} collapsed into ${summary.signatureConflictGroups} group${summary.signatureConflictGroups === 1 ? "" : "s"}`,
    );
  }
  lines.push("");

  const showDetailLimit = 10;

  if (result.groups.length <= showDetailLimit) {
    for (let i = 0; i < result.groups.length; i++) {
      const group = result.groups[i];
      lines.push(`[${i + 1}] ${group.displayName}`);
      lines.push(`    ${formatGroupListSummary(group)}`);
      lines.push(`    codes: ${group.codes.join(", ")}`);
      lines.push("");

      lines.push("    signatures:");
      for (const sig of group.signatures) {
        lines.push(
          `      ${sig.id}  ${sig.definitions.length} definition${sig.definitions.length === 1 ? "" : "s"}`,
        );
        lines.push(`         ${sig.signatureText}`);
      }
      lines.push("");

      if (group.differences.length > 0) {
        lines.push("    differences:");
        lines.push(...formatSignatureDifferences(group).map((l) => `      ${l}`));
        lines.push("");
      }

      lines.push("    usage:");
      lines.push(...formatUsageEvidence(group).map((l) => `      ${l}`));
      lines.push("");

      if (group.usageImpacts.length > 0) {
        lines.push("    usage check:");
        for (const impact of group.usageImpacts) {
          lines.push(`      choose ${impact.signatureId}: ${formatUsageCheck(impact)}`);
        }
        lines.push("");
      }

      const writableActions = getWritableActions(group);
      if (writableActions.length > 0) {
        lines.push("    actions:");
        for (let a = 0; a < writableActions.length; a++) {
          const action = writableActions[a];
          lines.push(`      ${a + 1}. ${action.title}`);
          const desc = formatEditSummary(action.editSummary);
          if (desc !== "edits: none") {
            lines.push(`         ${desc}`);
          }
          if (action.warnings) {
            for (const warning of action.warnings) {
              lines.push(`         warning: ${warning}`);
            }
          }
        }
        lines.push("");
      }

      const manualActions = getManualActions(group);
      if (manualActions.length > 0) {
        lines.push("    manual:");
        for (const action of manualActions) {
          lines.push(`      ${action.description}`);
          if (action.warnings) {
            for (const warning of action.warnings) {
              lines.push(`      warning: ${warning}`);
            }
          }
        }
        lines.push("");
      }
    }
  } else {
    lines.push(
      `showing first ${showDetailLimit} groups. Use \`btxmlc repair --show <nodeId|index>\` for full details.`,
    );
    lines.push("");

    for (let i = 0; i < showDetailLimit; i++) {
      const group = result.groups[i];
      const differingPorts = group.differences.flatMap((d) => d.differences).length;
      lines.push(
        `[${i + 1}] ${group.displayName.padEnd(20)} ${group.definitions.length} definitions, ${group.signatures.length} signatures, ${differingPorts} differing port${differingPorts === 1 ? "" : "s"}`,
      );
    }
    lines.push("");
    lines.push("remaining groups:");
    for (let i = showDetailLimit; i < result.groups.length; i++) {
      lines.push(`  [${i + 1}] ${result.groups[i].nodeId}`);
    }
    lines.push("");
  }

  lines.push("run `btxmlc repair --write` to resolve model groups interactively");
  lines.push("run `btxmlc repair --show <model|model.port|index>` to inspect one model group");

  return lines.join("\n");
}

export function printRepairJson(result: RepairResult): string {
  const errors = result.groups.filter((g) => g.severity === "error").length;
  const warnings = result.groups.filter((g) => g.severity === "warning").length;
  const summary = summarizeGroupKinds(result.groups);
  return JSON.stringify(
    {
      ok: result.ok,
      version: 2,
      schemaVersion: "2",
      toolVersion: "0.1.0",
      groups: result.groups.map((group) => ({
        id: group.id,
        kind: group.kind,
        nodeId: group.nodeId,
        portName: group.portName,
        displayName: group.displayName,
        codes: group.codes,
        severity: group.severity,
        pairwiseConflictCount: group.pairwiseConflictCount,
        definitions: group.definitions.map((def) => ({
          definitionId: def.definitionId,
          uri: def.uri,
          sourceKind: def.sourceKind,
          kind: def.kind,
          range: def.range,
          signatureId: def.signatureId,
          signatureText: def.signatureText,
        })),
        signatures: group.signatures.map((sig) => ({
          id: sig.id,
          signatureKey: sig.signatureKey,
          signatureText: sig.signatureText,
          definitions: sig.definitions.map((d) => ({
            definitionId: d.definitionId,
            uri: d.uri,
            range: d.range,
          })),
          editableDefinitions: sig.editableDefinitions.map((d) => ({
            definitionId: d.definitionId,
            uri: d.uri,
            range: d.range,
          })),
          nonEditableDefinitions: sig.nonEditableDefinitions.map((d) => ({
            definitionId: d.definitionId,
            uri: d.uri,
            range: d.range,
          })),
        })),
        differences: group.differences,
        usageEvidence: group.usageEvidence,
        usageImpacts: group.usageImpacts,
        differencePattern: group.differencePattern,
        actions: group.actions.map((action) => ({
          id: action.id,
          title: action.title,
          description: action.description,
          kind: action.kind,
          applicable: action.applicable,
          targetSignatureId: action.targetSignatureId,
          editSummary: action.editSummary,
          workspaceEdits: action.workspaceEdits,
          usageImpact: action.usageImpact,
          warnings: action.warnings,
        })),
      })),
      summary: {
        groups: result.groups.length,
        signatureConflictGroups: summary.signatureConflictGroups,
        duplicateModelGroups: summary.duplicateModelGroups,
        duplicatePortGroups: summary.duplicatePortGroups,
        pairwiseSignatureConflicts: summary.pairwiseSignatureConflicts,
        errors,
        warnings,
      },
    },
    null,
    2,
  );
}
