import type { EffectiveFileConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import { type SemanticIndex, getDocumentModel } from "@btxml/semantic";
import type { BtDocumentView } from "@btxml/semantic/ast-view";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import type { RuleName } from "../rules/registry.js";
import { createRuleContext } from "./context.js";
import { type AnalysisFacts, emptyAnalysisFacts } from "./facts.js";
import { ANALYSIS_RULES } from "./registry.js";
import { getConfiguredRuleOptions, getEffectiveRuleSeverity } from "./severity.js";

export function runAnalysis(input: {
  document: BtDocument;
  view: BtDocumentView;
  semantic: SemanticIndex;
  config: EffectiveFileConfig;
  facts?: AnalysisFacts;
  rules?: RuleName[];
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const facts = input.facts ?? emptyAnalysisFacts();
  const requested = input.rules ? new Set(input.rules) : undefined;
  const visitors = [];

  for (const rule of ANALYSIS_RULES) {
    if (requested && !requested.has(rule.name)) continue;
    const severity = getEffectiveRuleSeverity({
      config: input.config,
      rule: rule.name,
      defaultSeverity: rule.defaultSeverity,
    });
    if (!severity) continue;

    const rawOptions = getConfiguredRuleOptions(input.config, rule.name);
    const parsed = rule.optionsSchema?.safeParse(rawOptions);
    const options = parsed?.success ? parsed.data : rawOptions;
    const context = createRuleContext({
      document: input.document,
      view: input.view,
      semantic: input.semantic,
      config: input.config,
      options,
      diagnostics,
      rule: rule.name,
      code: rule.code,
      severity,
      facts,
    });
    visitors.push(rule.create(context));
  }

  for (const visitor of visitors) visitor.Document?.();
  if (input.document.root) walkElement(input.document.root, visitors);
  const model = getDocumentModel(input.semantic, input.document.uri);
  for (const nodeModel of model?.treeNodesModel ?? []) {
    for (const visitor of visitors) visitor.TreeNodeModel?.(nodeModel);
  }
  for (const visitor of visitors) visitor.ProgramExit?.();

  return diagnostics
    .map((diag, index) => ({ diag, index }))
    .sort((a, b) => compareDiagnostics(a.diag, b.diag) || a.index - b.index)
    .map((entry) => entry.diag);
}

function walkElement(
  element: BtXmlElement,
  visitors: ReturnType<(typeof ANALYSIS_RULES)[number]["create"]>[],
) {
  for (const visitor of visitors) visitor.Element?.(element);
  for (const child of element.children) {
    if (child.kind === "element") walkElement(child, visitors);
  }
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic) {
  const aRange = a.range;
  const bRange = b.range;
  if (!aRange && !bRange) return 0;
  if (!aRange) return 1;
  if (!bRange) return -1;
  return (
    aRange.start.line - bRange.start.line ||
    aRange.start.character - bRange.start.character ||
    aRange.end.line - bRange.end.line ||
    aRange.end.character - bRange.end.character
  );
}
