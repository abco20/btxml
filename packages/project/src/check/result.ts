import type { CheckProjectResult, ProjectCheckSummary } from "../types.js";
import type { CheckContext } from "./context.js";
import { collectDiagnostics, hasFailingDiagnostics } from "./utils.js";

function toPublicFiles(
  files: NonNullable<CheckContext["files"]>,
  includeRawDiagnostics: boolean | undefined,
): CheckProjectResult["files"] {
  return files.map(({ path, uri, kind, diagnostics, rawDiagnostics, skipped, skipReason }) => ({
    path,
    uri,
    kind,
    diagnostics,
    rawDiagnostics: includeRawDiagnostics ? rawDiagnostics : undefined,
    skipped,
    skipReason,
  }));
}

export function buildCheckResult(
  ctx: CheckContext,
  summary: ProjectCheckSummary,
): CheckProjectResult {
  const diagnostics = collectDiagnostics([
    ctx.finalProjectDiagnostics ?? ctx.projectDiagnostics,
    ctx.files?.flatMap((file) => file.diagnostics) ?? [],
  ]);

  return {
    ok: !hasFailingDiagnostics(diagnostics, ctx.input.maxWarnings),
    files: ctx.files ? toPublicFiles(ctx.files, ctx.input.includeRawDiagnostics) : [],
    projectDiagnostics: ctx.finalProjectDiagnostics ?? ctx.projectDiagnostics,
    summary,
  };
}
