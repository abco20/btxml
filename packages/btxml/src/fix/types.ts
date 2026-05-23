import type { TextEdit } from "@btxml/foundation";

export type FixSafety = "safe" | "unsafe";

export type FixCandidate = {
  id: string;
  uri: string;

  diagnosticCode: string;
  diagnosticRule?: string;
  diagnosticSeverity: "error" | "warning" | "info";
  diagnosticMessage: string;

  safety: FixSafety;
  title: string;
  description?: string;

  edits: TextEdit[];

  source: {
    kind: "diagnostic";
    diagnosticFingerprint: string;
  };

  metadata?: Record<string, unknown>;
};

export type SkippedFixReason =
  | "unsafe-not-enabled"
  | "invalid-range"
  | "overlap"
  | "stale-document"
  | "parse-failed"
  | "formatter-failed"
  | "empty-edit"
  | "baseline-filtered"
  | "suppressed";

export type SkippedFix = {
  candidate: FixCandidate;
  reason: SkippedFixReason;
  conflictsWith?: string[];
  detail?: string;
};

export type FixPlan = {
  pass: number;
  applied: FixCandidate[];
  skipped: SkippedFix[];
  editsByUri: Map<string, TextEdit[]>;
  touchedUris: Set<string>;
};

export type FixRunSummary = {
  enabled: boolean;
  unsafe: boolean;
  dryRun: boolean;
  maxPasses: number;
  passes: number;
  circularFixesDetected: boolean;

  appliedDiagnostics: number;
  appliedEdits: number;
  changedFiles: number;

  unsafeAppliedDiagnostics: number;
  unsafeSkippedDiagnostics: number;

  skipped: Array<{
    code: string;
    uri: string;
    reason: SkippedFixReason;
    title: string;
  }>;

  fixedTextByPath?: Record<string, string>;
};
