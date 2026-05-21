import { getRuleSeverity } from "@btxml/analyzer/rules";
import type { EffectiveFileConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import type { BtDocument } from "@btxml/syntax";
import type { SuppressionIssue } from "../analyzer-facts.js";
import { applyDiagnosticSuppressions } from "../suppressions.js";
import type { CheckContext } from "./context.js";

export function applySuppressions(
  ctx: CheckContext,
  diagnostics: Diagnostic[],
  documents?: BtDocument[],
  config: EffectiveFileConfig = ctx.resolvedConfig,
): {
  diagnostics: Diagnostic[];
  suppressedDiagnostics: Diagnostic[];
  issues: SuppressionIssue[];
} {
  const requireReasonEnabled =
    getRuleSeverity(config.linter.rules, "suppression/require-reason") !== "off";

  return applyDiagnosticSuppressions(diagnostics, {
    documents: documents ?? ctx.fileDocuments,
    requireReason: requireReasonEnabled,
    allowInline: config.linter.suppressions.inline !== "deny",
    showSuppressed: ctx.showSuppressed,
  });
}
