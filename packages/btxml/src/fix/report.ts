import type { FixRunSummary } from "./types.ts";

function plural(count: number, suffix = "s") {
  return count === 1 ? "" : suffix;
}

function unsafeSkippedLine(summary: FixRunSummary): string | undefined {
  if (summary.unsafe || summary.unsafeSkippedDiagnostics <= 0) return undefined;
  return `skipped ${summary.unsafeSkippedDiagnostics} unsafe fix${plural(summary.unsafeSkippedDiagnostics, "es")}; rerun with --fix --unsafe to apply them`;
}

function unsafeAppliedLine(summary: FixRunSummary): string | undefined {
  if (summary.unsafeAppliedDiagnostics <= 0) return undefined;
  return `applied ${summary.unsafeAppliedDiagnostics} unsafe fix${plural(summary.unsafeAppliedDiagnostics, "es")}`;
}

function circularLine(summary: FixRunSummary): string | undefined {
  return summary.circularFixesDetected
    ? "stopped autofix because a circular fix pattern was detected"
    : undefined;
}

function dryRunPreviewLine(summary: FixRunSummary): string | undefined {
  if (!summary.dryRun || !summary.fixedTextByPath) return undefined;
  const count = Object.keys(summary.fixedTextByPath).length;
  return `dry-run preview prepared for ${count} file${plural(count)}`;
}

export function createFixRunSummary(input: {
  enabled: boolean;
  unsafe: boolean;
  dryRun: boolean;
  maxPasses: number;
}): FixRunSummary {
  return {
    enabled: input.enabled,
    unsafe: input.unsafe,
    dryRun: input.dryRun,
    maxPasses: input.maxPasses,
    passes: 0,
    circularFixesDetected: false,
    appliedDiagnostics: 0,
    appliedEdits: 0,
    changedFiles: 0,
    unsafeAppliedDiagnostics: 0,
    unsafeSkippedDiagnostics: 0,
    skipped: [],
  };
}

export function formatFixSummaryLines(summary: FixRunSummary): string[] {
  if (!summary.enabled) return [];

  const verb = summary.dryRun ? "would fix" : "fixed";
  const baseLines = [
    `${verb} ${summary.appliedDiagnostics} problem${summary.appliedDiagnostics === 1 ? "" : "s"} with ${summary.appliedEdits} edit${summary.appliedEdits === 1 ? "" : "s"} in ${summary.changedFiles} file${summary.changedFiles === 1 ? "" : "s"}`,
    `autofix passes: ${summary.passes}/${summary.maxPasses}`,
  ];
  const detailLines = [
    unsafeSkippedLine(summary),
    unsafeAppliedLine(summary),
    circularLine(summary),
    dryRunPreviewLine(summary),
  ].filter((line): line is string => Boolean(line));

  return [...baseLines, ...detailLines];
}
