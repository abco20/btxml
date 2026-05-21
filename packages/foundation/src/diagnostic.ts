import type { SourceRange } from "./range.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export const DiagnosticSeverity = {
  Error: "error" as const,
  Warning: "warning" as const,
  Info: "info" as const,
};

export type DiagnosticDetails = {
  readonly primaryLabel?: string;
  readonly help?: string;
  readonly notes?: readonly string[];
};

export type RelatedInformation = {
  readonly uri: string;
  readonly range: SourceRange;
  readonly message: string;
};

export type DiagnosticData = Record<string, unknown>;

export type Diagnostic = {
  readonly code: string;
  readonly rule?: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly uri: string;
  readonly range?: SourceRange;
  readonly relatedInformation?: readonly RelatedInformation[];
  readonly suppressed?: boolean;
  readonly details?: DiagnosticDetails;
  readonly data?: DiagnosticData;
};

export function isErrorDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === DiagnosticSeverity.Error;
}

export function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(isErrorDiagnostic);
}

export function countDiagnosticsBySeverity(
  diagnostics: readonly Diagnostic[],
): Record<DiagnosticSeverity, number> {
  const counts: Record<DiagnosticSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };

  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
  }

  return counts;
}

export function createDiagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  range?: SourceRange,
  uri = "",
  details?: DiagnosticDetails,
  data?: DiagnosticData,
): Diagnostic {
  return {
    code,
    severity,
    message,
    uri,
    ...(range ? { range } : {}),
    ...(details ? { details } : {}),
    ...(data ? { data } : {}),
  };
}
