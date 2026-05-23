import type { TextEdit } from "@btxml/foundation";
import type { FixCandidate, FixPlan } from "./types.ts";

function validateTextEdit(text: string, edit: TextEdit): boolean {
  const start = edit.range.start.offset;
  const end = edit.range.end.offset;
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end >= start &&
    end <= text.length
  );
}

function overlaps(left: TextEdit, right: TextEdit): boolean {
  if (
    left.range.start.offset === left.range.end.offset &&
    right.range.start.offset === right.range.end.offset &&
    left.range.start.offset === right.range.start.offset
  ) {
    return true;
  }
  return (
    left.range.start.offset < right.range.end.offset &&
    right.range.start.offset < left.range.end.offset
  );
}

function severityRank(severity: FixCandidate["diagnosticSeverity"]): number {
  if (severity === "error") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function safetyRank(safety: FixCandidate["safety"]): number {
  return safety === "safe" ? 0 : 1;
}

function editRangeSize(candidate: FixCandidate): number {
  return candidate.edits.reduce(
    (sum, edit) => sum + (edit.range.end.offset - edit.range.start.offset),
    0,
  );
}

function firstStartOffset(candidate: FixCandidate): number {
  if (candidate.edits.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...candidate.edits.map((edit) => edit.range.start.offset));
}

function compareCandidates(left: FixCandidate, right: FixCandidate): number {
  const bySafety = safetyRank(left.safety) - safetyRank(right.safety);
  if (bySafety !== 0) return bySafety;

  const bySeverity = severityRank(left.diagnosticSeverity) - severityRank(right.diagnosticSeverity);
  if (bySeverity !== 0) return bySeverity;

  const byRange = editRangeSize(left) - editRangeSize(right);
  if (byRange !== 0) return byRange;

  const byUri = left.uri.localeCompare(right.uri);
  if (byUri !== 0) return byUri;

  const byOffset = firstStartOffset(left) - firstStartOffset(right);
  if (byOffset !== 0) return byOffset;

  const byCode = left.diagnosticCode.localeCompare(right.diagnosticCode);
  if (byCode !== 0) return byCode;

  return left.id.localeCompare(right.id);
}

export function planFixes(input: {
  pass: number;
  candidates: FixCandidate[];
  textByUri: Map<string, string>;
  unsafe: boolean;
}): FixPlan {
  const skipped: FixPlan["skipped"] = [];
  const sortable: FixCandidate[] = [];

  for (const candidate of input.candidates) {
    if (candidate.edits.length === 0) {
      skipped.push({ candidate, reason: "empty-edit" });
      continue;
    }

    if (candidate.safety === "unsafe" && !input.unsafe) {
      skipped.push({ candidate, reason: "unsafe-not-enabled" });
      continue;
    }

    const text = input.textByUri.get(candidate.uri);
    if (text === undefined) {
      skipped.push({ candidate, reason: "stale-document" });
      continue;
    }

    if (!candidate.edits.every((edit) => validateTextEdit(text, edit))) {
      skipped.push({ candidate, reason: "invalid-range" });
      continue;
    }

    sortable.push(candidate);
  }

  const sorted = [...sortable].sort(compareCandidates);
  const applied: FixCandidate[] = [];
  const editsByUri = new Map<string, TextEdit[]>();

  for (const candidate of sorted) {
    const existing = editsByUri.get(candidate.uri) ?? [];
    const conflictsWith = new Set<string>();

    for (const edit of candidate.edits) {
      for (const occupied of existing) {
        if (overlaps(edit, occupied)) {
          const owner = applied.find((entry) =>
            entry.edits.some(
              (entryEdit) =>
                entry.uri === candidate.uri &&
                entryEdit.range.start.offset === occupied.range.start.offset &&
                entryEdit.range.end.offset === occupied.range.end.offset &&
                entryEdit.newText === occupied.newText,
            ),
          );
          if (owner) conflictsWith.add(owner.id);
        }
      }
    }

    if (conflictsWith.size > 0) {
      skipped.push({
        candidate,
        reason: "overlap",
        conflictsWith: [...conflictsWith].sort((a, b) => a.localeCompare(b)),
      });
      continue;
    }

    applied.push(candidate);
    editsByUri.set(candidate.uri, [...existing, ...candidate.edits]);
  }

  for (const [uri, edits] of editsByUri) {
    editsByUri.set(uri, [...edits].sort((a, b) => b.range.start.offset - a.range.start.offset));
  }

  return {
    pass: input.pass,
    applied,
    skipped,
    editsByUri,
    touchedUris: new Set([...editsByUri.keys()]),
  };
}
