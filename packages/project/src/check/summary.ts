import { type Diagnostic, DiagnosticSeverity } from "@btxml/foundation";
import type { ProjectCheckSummary } from "../types.js";
import type { CheckContext } from "./context.js";
import type { InternalFileCheckResult } from "./internal-types.js";
import { collectDiagnostics } from "./utils.js";

export function summarizeResults(
  _ctx: CheckContext,
  files: InternalFileCheckResult[],
  projectDiagnostics: Diagnostic[],
): ProjectCheckSummary {
  const checkedFiles = files.filter((file) => !file.skipped);
  const diagnostics = collectDiagnostics([
    projectDiagnostics,
    checkedFiles.flatMap((file) => file.diagnostics),
  ]);

  return {
    files: checkedFiles.length,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
      .length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Warning)
      .length,
    infos: diagnostics.filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Info)
      .length,
    suppressed: 0,
    baselineFiltered: 0,
    staleEntries: [],
  };
}
