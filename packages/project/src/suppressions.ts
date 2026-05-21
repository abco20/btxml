import type { ResolvedBtxmlConfig } from "@btxml/config";
import { type Diagnostic, DiagnosticSeverity, type SourceRange } from "@btxml/foundation";
import type { BtDocument } from "@btxml/syntax";
import type { SuppressionIssue } from "./analyzer-facts.js";
import type { SuppressionContext } from "./internal-types.js";

type Suppression = {
  uri: string;
  code?: string;
  line?: number;
  file?: boolean;
  range?: SourceRange;
  used: boolean;
  reason?: string;
};

function collectComments(nodes: BtDocument["nodes"]) {
  const comments: Extract<BtDocument["nodes"][number], { kind: "comment" }>[] = [];
  for (const node of nodes) {
    if (node.kind === "comment") comments.push(node);
    if (node.kind === "element") comments.push(...collectComments(node.children));
  }
  return comments;
}

function parseSuppressions(documents: BtDocument[], requireReason: boolean, allowInline: boolean) {
  const suppressions: Suppression[] = [];
  const issues: SuppressionIssue[] = [];
  for (const document of documents) {
    const comments = collectComments(document.nodes);
    for (const comment of comments) {
      const text = comment.text.trim();
      if (!text.includes("btxml-disable")) continue;
      const code = text.match(
        /\b(BT\d+|BT\d+_[A-Z0-9_]+|CFG\d+_[A-Z0-9_]+|XML\d+_[A-Z0-9_]+)\b/,
      )?.[1];
      const reason = text.match(/reason:\s*(.+)$/)?.[1];
      if (requireReason && !reason)
        issues.push({
          kind: "missing-reason",
          uri: document.uri,
          code,
          range: comment.range,
          message: "missing suppression reason",
        });
      if (text.startsWith("btxml-disable-file")) {
        suppressions.push({
          uri: document.uri,
          code,
          file: true,
          range: comment.range,
          used: false,
          reason,
        });
      } else if (text.startsWith("btxml-disable-next-line")) {
        if (allowInline) {
          suppressions.push({
            uri: document.uri,
            code,
            line: comment.range.end.line + 1,
            range: comment.range,
            used: false,
            reason,
          });
        }
      } else if (text.startsWith("btxml-disable")) {
        if (allowInline) {
          suppressions.push({
            uri: document.uri,
            code,
            line: comment.range.end.line + 1,
            range: comment.range,
            used: false,
            reason,
          });
        }
      }
    }
  }
  return { suppressions, issues };
}

export function applyDiagnosticSuppressions(
  diagnostics: Diagnostic[],
  context: SuppressionContext,
): { diagnostics: Diagnostic[]; suppressedDiagnostics: Diagnostic[]; issues: SuppressionIssue[] } {
  const parsed = parseSuppressions(
    context.documents ?? [],
    Boolean(context.requireReason),
    context.allowInline !== false,
  );
  const kept: Diagnostic[] = [];
  const suppressed: Diagnostic[] = [];
  for (const diag of diagnostics) {
    const suppression = parsed.suppressions.find(
      (candidate) =>
        candidate.uri === diag.uri &&
        (!candidate.code || candidate.code === diag.code || diag.code.startsWith(candidate.code)) &&
        (candidate.file ||
          candidate.line === diag.range?.start.line ||
          candidate.line === (diag.range?.start.line ?? 0) + 1),
    );
    if (suppression) {
      suppression.used = true;
      suppressed.push(diag);
      continue;
    }
    kept.push(diag);
  }
  for (const suppression of parsed.suppressions) {
    if (!suppression.used) {
      parsed.issues.push({
        kind: "unused",
        uri: suppression.uri,
        code: suppression.code,
        range: suppression.range,
        message: suppression.code
          ? `unused suppression for \`${suppression.code}\``
          : "unused suppression",
      });
    }
  }
  if (context.showSuppressed) {
    const markedSuppressed = suppressed.map((diag) => ({
      ...diag,
      severity: DiagnosticSeverity.Info,
      suppressed: true,
    }));
    return {
      diagnostics: [...kept, ...markedSuppressed],
      suppressedDiagnostics: suppressed,
      issues: parsed.issues,
    };
  }
  return { diagnostics: kept, suppressedDiagnostics: suppressed, issues: parsed.issues };
}

export function getSuppressionsConfig(config: ResolvedBtxmlConfig) {
  return config.linter.suppressions;
}
