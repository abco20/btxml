export type { CheckContext } from "./context.js";
export type {
  InternalCheckProjectInput,
  InternalCheckProjectResult,
  InternalFileCheckResult,
} from "./internal-types.js";
export {
  buildProjectIndex,
  createCheckContext,
  uniqueDocuments,
  uniqueFilesByPath,
} from "./context.js";
export { checkFiles } from "./files.js";
export { applySuppressions } from "./suppressions.js";
export { applyBaseline } from "./baseline.js";
export { summarizeResults } from "./summary.js";
export { buildCheckResult } from "./result.js";

import { getEffectiveConfigForFile } from "@btxml/config";
import { loadProjectDocuments } from "../documents.js";
import { asInternalProject } from "../project-handle.js";
import { runSuppressionIssueRules } from "../suppression-diagnostics.js";
import type { CheckProjectInput, CheckProjectResult, DiagnosticBaselineEntry } from "../types.js";
import { applyBaseline } from "./baseline.js";
import { createCheckContext, uniqueFilesByPath } from "./context.js";
import { checkFiles } from "./files.js";
import type { InternalCheckProjectInput, InternalCheckProjectResult } from "./internal-types.js";
import { buildCheckResult } from "./result.js";
import { summarizeResults } from "./summary.js";
import { applySuppressions } from "./suppressions.js";

export async function runProjectCheck(
  input: InternalCheckProjectInput,
): Promise<InternalCheckProjectResult> {
  const ctx = await createCheckContext(input);

  let projectDiagnostics = [...ctx.projectDiagnostics, ...ctx.indexResult.diagnostics];

  ctx.files = checkFiles(ctx);

  const projectSuppression = applySuppressions(ctx, projectDiagnostics);
  projectDiagnostics = [
    ...projectSuppression.diagnostics,
    ...runSuppressionIssueRules({ issues: projectSuppression.issues, config: ctx.resolvedConfig }),
  ];
  let suppressedCount = projectSuppression.suppressedDiagnostics.length;

  for (let i = 0; i < ctx.files.length; i++) {
    const file = ctx.files[i];
    const document = ctx.fileDocuments[i];
    if (file.skipped) continue;

    const effectiveConfig = getEffectiveConfigForFile(ctx.resolvedConfig, file.path);
    const result = applySuppressions(ctx, file.diagnostics, [document], effectiveConfig);
    file.diagnostics = [
      ...result.diagnostics,
      ...runSuppressionIssueRules({ issues: result.issues, config: effectiveConfig }),
    ];
    file.rawDiagnostics = [...file.diagnostics];
    suppressedCount += result.suppressedDiagnostics.length;
  }

  let baselineCount = 0;
  let staleEntries: DiagnosticBaselineEntry[] = [];
  for (const file of ctx.files) {
    if (file.skipped || file.diagnostics.length === 0) continue;

    const result = applyBaseline(ctx, file.diagnostics);
    file.diagnostics = result.diagnostics;
    baselineCount += result.baselineDiagnostics.length;
    if (result.staleEntries.length > 0) {
      staleEntries = staleEntries.concat(result.staleEntries);
    }
  }

  ctx.files = uniqueFilesByPath(ctx.files);
  ctx.finalProjectDiagnostics = projectDiagnostics;

  const summary = summarizeResults(ctx, ctx.files, projectDiagnostics);
  summary.suppressed = suppressedCount;
  summary.baselineFiltered = baselineCount;
  summary.staleEntries = staleEntries;

  return {
    ...buildCheckResult(ctx, summary),
    files: ctx.files ?? [],
  };
}

export async function checkProject(input: CheckProjectInput): Promise<CheckProjectResult> {
  const internalProject = asInternalProject(input.project);
  const host = input.host ?? internalProject.host;
  let documents = input.documents;
  let externalModelDocuments = input.externalModelDocuments;
  let augmentations = input.augmentations;
  let projectDiagnostics = [...(input.projectDiagnostics ?? [])];

  if (!documents || !externalModelDocuments || !augmentations) {
    const loaded = await loadProjectDocuments(input.project, host);
    documents ??= loaded.documents;
    externalModelDocuments ??= loaded.externalModelDocuments;
    augmentations ??= loaded.augmentations;
    projectDiagnostics = [...projectDiagnostics, ...loaded.diagnostics];
  }

  return runProjectCheck({
    ...input,
    host,
    documents,
    externalModelDocuments,
    augmentations,
    projectDiagnostics,
    resolvedConfig: internalProject.resolvedConfig,
  });
}
