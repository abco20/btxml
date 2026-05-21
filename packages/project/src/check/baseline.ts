import type { Diagnostic } from "@btxml/foundation";
import { stableDiagnosticHash } from "../internal/hash.js";
import type { DiagnosticBaselineEntry } from "../types.js";
import type { CheckContext } from "./context.js";

export function applyBaseline(
  ctx: CheckContext,
  diagnostics: Diagnostic[],
): {
  diagnostics: Diagnostic[];
  baselineDiagnostics: Diagnostic[];
  staleEntries: DiagnosticBaselineEntry[];
} {
  if (!ctx.input.baseline) {
    return { diagnostics, baselineDiagnostics: [], staleEntries: [] };
  }

  const matched = new Set<number>();
  const kept: Diagnostic[] = [];
  const baselineDiagnostics: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const index = ctx.input.baseline.diagnostics.findIndex(
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

  return {
    diagnostics: kept,
    baselineDiagnostics,
    staleEntries: ctx.input.baseline.diagnostics.filter((_entry, index) => !matched.has(index)),
  };
}
