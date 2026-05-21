import { getNodeUsagePolicyForRules } from "@btxml/analyzer/rules";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import { DiagnosticSeverity } from "@btxml/foundation";
import { type SemanticIndex, buildSemanticIndex } from "@btxml/semantic";
import { buildBtDocumentView } from "@btxml/semantic/ast-view";
import { type BtDocument, parseBtXml } from "@btxml/syntax";
import { runAnalysis } from "./analysis/runner.js";
import type { DiagnosticOptions, ValidateOptions, ValidateResult } from "./analysis/types.js";

export function getDocumentDiagnostics(
  document: BtDocument,
  semantic: SemanticIndex,
  options: DiagnosticOptions,
) {
  if (document.kind === "invalid-xml" || document.kind === "generic-xml") {
    return [...document.diagnostics];
  }

  const diagnostics = [...document.diagnostics];
  const view =
    options.documentView ??
    buildBtDocumentView(document, {
      semantic,
      config: options.config as ResolvedBtxmlConfig,
      policy: getNodeUsagePolicyForRules(options.config),
    });
  diagnostics.push(
    ...runAnalysis({
      document,
      view,
      semantic,
      config: options.config,
    }),
  );
  return diagnostics;
}

export function validateBtXml(text: string, options: ValidateOptions): ValidateResult {
  const parsed = parseBtXml(text, { uri: options.uri, path: options.path });
  if (!parsed.ok || !parsed.document) {
    return { ok: false, diagnostics: [...parsed.diagnostics] };
  }

  const document = parsed.document;
  const semantic = buildSemanticIndex([document], {
    config: options.config as ResolvedBtxmlConfig,
    augmentations: options.augmentations,
  });
  const view = buildBtDocumentView(document, {
    semantic: semantic.index,
    config: options.config as ResolvedBtxmlConfig,
    policy: getNodeUsagePolicyForRules(options.config),
  });
  const analysisDiagnostics = runAnalysis({
    document,
    view,
    semantic: semantic.index,
    config: options.config,
  });
  const diagnostics = [...parsed.diagnostics, ...semantic.diagnostics, ...analysisDiagnostics];

  return {
    ok: !diagnostics.some((diag) => diag.severity === DiagnosticSeverity.Error),
    diagnostics,
  };
}
