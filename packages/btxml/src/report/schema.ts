import { z } from "zod";

const sourcePositionLikeSchema = z
  .object({
    line: z.number(),
    character: z.number(),
    offset: z.number(),
  })
  .strict();

const sourceRangeLikeSchema = z
  .object({
    start: sourcePositionLikeSchema,
    end: sourcePositionLikeSchema,
  })
  .strict();

const diagnosticDetailsSchema = z
  .object({
    primaryLabel: z.string().optional(),
    help: z.string().optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

const relatedInformationSchema = z
  .object({
    uri: z.string(),
    range: sourceRangeLikeSchema,
    message: z.string(),
  })
  .strict();

export const diagnosticSchema = z
  .object({
    code: z.string(),
    rule: z.string().optional(),
    severity: z.enum(["error", "warning", "info"]),
    message: z.string(),
    uri: z.string(),
    range: sourceRangeLikeSchema.optional(),
    relatedInformation: z.array(relatedInformationSchema).optional(),
    suppressed: z.boolean().optional(),
    details: diagnosticDetailsSchema.optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const fileReportSchema = z
  .object({
    path: z.string(),
    diagnostics: z.array(diagnosticSchema),
    needsFormat: z.boolean().optional(),
    skipped: z.boolean().optional(),
    skipReason: z.string().optional(),
  })
  .strict();

const fixSummarySchema = z
  .object({
    enabled: z.boolean(),
    unsafe: z.boolean(),
    dryRun: z.boolean(),
    maxPasses: z.number(),
    passes: z.number(),
    circularFixesDetected: z.boolean(),
    appliedDiagnostics: z.number(),
    appliedEdits: z.number(),
    changedFiles: z.number(),
    unsafeAppliedDiagnostics: z.number(),
    unsafeSkippedDiagnostics: z.number(),
    skipped: z.array(
      z
        .object({
          code: z.string(),
          uri: z.string(),
          reason: z.enum([
            "unsafe-not-enabled",
            "invalid-range",
            "overlap",
            "stale-document",
            "parse-failed",
            "formatter-failed",
            "empty-edit",
            "baseline-filtered",
            "suppressed",
          ]),
          title: z.string(),
        })
        .strict(),
    ),
    fixedTextByPath: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const jsonCheckReportSchema = z
  .object({
    ok: z.boolean(),
    version: z.literal(2),
    schemaVersion: z.literal("2"),
    toolVersion: z.string(),
    project: z.record(z.string(), z.unknown()),
    projectDiagnostics: z.array(diagnosticSchema),
    files: z.array(fileReportSchema),
    summary: z
      .object({
        files: z.number(),
        errors: z.number(),
        warnings: z.number(),
        infos: z.number(),
        suppressed: z.number(),
        baselineFiltered: z.number(),
      })
      .strict(),
    fixes: fixSummarySchema.optional(),
  })
  .strict();

const repairDefinitionRefSchema = z
  .object({
    definitionId: z.string(),
    uri: z.string().optional(),
    range: sourceRangeLikeSchema.optional(),
  })
  .strict();

const repairDefinitionSchema = repairDefinitionRefSchema
  .extend({
    sourceKind: z.string(),
    kind: z.string(),
    signatureId: z.string(),
    signatureText: z.string(),
  })
  .strict();

const repairSignatureSchema = z
  .object({
    id: z.string(),
    signatureKey: z.string(),
    signatureText: z.string(),
    definitions: z.array(repairDefinitionRefSchema),
    editableDefinitions: z.array(repairDefinitionRefSchema),
    nonEditableDefinitions: z.array(repairDefinitionRefSchema),
  })
  .strict();

const repairEditSummarySchema = z
  .object({
    files: z.number(),
    definitions: z.number(),
    edits: z.number(),
    affectedUris: z.array(z.string()),
  })
  .strict();

const repairActionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    kind: z.enum([
      "match-signature",
      "keep-model-definition",
      "keep-port-definition",
      "manual",
      "skip",
    ]),
    applicable: z.boolean(),
    targetSignatureId: z.string().optional(),
    editSummary: repairEditSummarySchema,
    workspaceEdits: z.array(z.unknown()).optional(),
    usageImpact: z.unknown().optional(),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

const usageEvidenceSchema = z
  .object({
    nodeId: z.string(),
    totalUsages: z.number(),
    byPort: z.record(z.string(), z.unknown()),
  })
  .strict();

const differencePatternSchema = z
  .object({
    key: z.string(),
    label: z.string(),
  })
  .strict();

const repairGroupSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["model-signature-conflict", "duplicate-model-id", "duplicate-port-name"]),
    nodeId: z.string(),
    portName: z.string().optional(),
    displayName: z.string(),
    codes: z.array(z.string()),
    severity: z.enum(["error", "warning"]),
    pairwiseConflictCount: z.number(),
    definitions: z.array(repairDefinitionSchema),
    signatures: z.array(repairSignatureSchema),
    differences: z.array(z.unknown()),
    usageEvidence: usageEvidenceSchema,
    usageImpacts: z.array(z.unknown()),
    differencePattern: differencePatternSchema,
    actions: z.array(repairActionSchema),
  })
  .strict();

export const jsonRepairReportSchema = z
  .object({
    ok: z.boolean(),
    version: z.literal(2),
    schemaVersion: z.literal("2"),
    toolVersion: z.string(),
    groups: z.array(repairGroupSchema),
    summary: z
      .object({
        groups: z.number(),
        signatureConflictGroups: z.number(),
        duplicateModelGroups: z.number(),
        duplicatePortGroups: z.number(),
        pairwiseSignatureConflicts: z.number(),
        errors: z.number(),
        warnings: z.number(),
      })
      .strict(),
  })
  .strict();
