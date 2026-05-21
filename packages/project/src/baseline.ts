import type { ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import type { BaselineFilterResult } from "./internal-types.js";
import { stableDiagnosticHash } from "./internal/hash.js";
import type { DiagnosticBaseline } from "./types.js";

export { diagnosticBaselineSchema } from "./baseline-schema.js";
export type { DiagnosticBaseline, DiagnosticBaselineEntry } from "./types.js";

export function applyDiagnosticBaseline(
  diagnostics: Diagnostic[],
  baseline: DiagnosticBaseline,
  mode: "filter" | "fail-on-new" = "filter",
): BaselineFilterResult {
  const matched = new Set<number>();
  const kept: Diagnostic[] = [];
  const baselineDiagnostics: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const index = baseline.diagnostics.findIndex(
      (entry) =>
        entry.path === diagnostic.uri &&
        entry.code === diagnostic.code &&
        entry.messageHash === stableDiagnosticHash(diagnostic.message) &&
        entry.range?.start?.line === diagnostic.range?.start?.line &&
        entry.range?.start?.character === diagnostic.range?.start?.character,
    );

    if (index >= 0) {
      matched.add(index);
      baselineDiagnostics.push(diagnostic);
      continue;
    }

    kept.push(diagnostic);
  }

  if (mode === "fail-on-new" && kept.length > 0) {
    // New diagnostics are intentionally kept in fail-on-new mode.
  }

  return {
    diagnostics: kept,
    baselineDiagnostics,
    staleEntries: baseline.diagnostics.filter((_entry, index) => !matched.has(index)),
  };
}

export function diagnosticBaselineEntry(diagnostic: Diagnostic) {
  return {
    path: diagnostic.uri,
    code: diagnostic.code,
    messageHash: stableDiagnosticHash(diagnostic.message),
    range: diagnostic.range,
  };
}

export function baselineEntriesFromDiagnostics(diagnostics: Diagnostic[]) {
  return diagnostics.map((diagnostic) => diagnosticBaselineEntry(diagnostic));
}

export function getBaselinePath(config: ResolvedBtxmlConfig): string | undefined {
  return config.linter.baseline;
}
