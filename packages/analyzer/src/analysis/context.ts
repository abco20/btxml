import type { EffectiveFileConfig, ResolvedBtxmlConfig } from "@btxml/config";
import {
  type Diagnostic,
  type DiagnosticSeverity,
  createDiagnostic as diagnostic,
} from "@btxml/foundation";
import type { BehaviorTreeDef, TreeNodeModelDef } from "@btxml/model";
import {
  type NodeUsageResolution,
  type PortUsageResolution,
  type SemanticIndex,
  type SubTreeResolution,
  getBehaviorTrees,
  getNodeModel,
  resolveNodeUsage,
  resolvePortUsage,
  resolveSubTreeTarget,
} from "@btxml/semantic";
import type { BtDocumentView, SubTreeCallView, TreeNodeView } from "@btxml/semantic/ast-view";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import { getNodeUsagePolicyForRules } from "../rules/options.js";
import type { RuleName } from "../rules/registry.js";
import type { RuleReportInput } from "./diagnostics.js";
import {
  type AnalysisFacts,
  type IncludeIssue,
  type SuppressionIssue,
  getIncludeIssuesForUri,
  getSuppressionIssuesForUri,
} from "./facts.js";

export type RuleContext<TOptions = unknown> = {
  document: BtDocument;
  view: BtDocumentView;
  semantic: SemanticIndex;
  config: EffectiveFileConfig;
  options: TOptions;
  facts: AnalysisFacts;

  report(input: RuleReportInput): void;

  getIncludeIssues(kind?: IncludeIssue["kind"]): IncludeIssue[];
  getSuppressionIssues(kind?: SuppressionIssue["kind"]): SuppressionIssue[];
  getNodeUsage(element: BtXmlElement): NodeUsageResolution;
  getPortUsage(element: BtXmlElement, attributeName: string): PortUsageResolution | undefined;
  resolveSubTree(id: string, fromUri: string): SubTreeResolution;
  getNodeModel(id: string): TreeNodeModelDef | undefined;
  getBehaviorTrees(id: string): BehaviorTreeDef[];
  getTreeNodeView(element: BtXmlElement): TreeNodeView | undefined;
  getSubTreeCallView(element: BtXmlElement): SubTreeCallView | undefined;
};

export function createRuleContext<TOptions>(input: {
  document: BtDocument;
  view: BtDocumentView;
  semantic: SemanticIndex;
  config: EffectiveFileConfig;
  options: TOptions;
  diagnostics: Diagnostic[];
  rule: RuleName;
  code: string;
  severity: DiagnosticSeverity;
  facts: AnalysisFacts;
}): RuleContext<TOptions> {
  const { document, semantic, config, view } = input;
  const treeNodeViews = new Map(view.nodes.map((node) => [node.element, node] as const));
  const subTreeCallViews = new Map(
    view.subtreeCalls.map((call) => [call.node.element, call] as const),
  );
  const nodeUsagePolicy = getNodeUsagePolicyForRules(config);
  const modelDefinitionElements = collectModelDefinitionElements(document.root);

  return {
    document,
    view,
    semantic,
    config,
    options: input.options,
    facts: input.facts,
    report(report) {
      const diag = diagnostic(
        report.code ?? input.code,
        input.severity,
        report.message,
        report.range,
        document.uri,
        report.details,
        report.data,
      );
      input.diagnostics.push({
        ...diag,
        rule: input.rule,
        ...(report.relatedInformation ? { relatedInformation: report.relatedInformation } : {}),
      });
    },
    getIncludeIssues(kind) {
      const issues = getIncludeIssuesForUri(input.facts, document.uri);
      return kind ? issues.filter((issue) => issue.kind === kind) : issues;
    },
    getSuppressionIssues(kind) {
      const issues = getSuppressionIssuesForUri(input.facts, document.uri);
      return kind ? issues.filter((issue) => issue.kind === kind) : issues;
    },
    getNodeUsage(element) {
      return resolveNodeUsage(semantic, {
        element,
        documentRoot: document.root,
        uri: document.uri,
        config,
        policy: nodeUsagePolicy,
        isModelDefinition: modelDefinitionElements.has(element),
      });
    },
    getPortUsage(element, attributeName) {
      return resolvePortUsage(semantic, {
        element,
        documentRoot: document.root,
        attributeName,
        uri: document.uri,
        config,
        policy: nodeUsagePolicy,
        isModelDefinition: modelDefinitionElements.has(element),
      });
    },
    resolveSubTree(id, fromUri) {
      return resolveSubTreeTarget(semantic, {
        id,
        fileLocalUri: fromUri,
        config: config as ResolvedBtxmlConfig,
      });
    },
    getNodeModel(id) {
      return getNodeModel(semantic, id);
    },
    getBehaviorTrees(id) {
      return getBehaviorTrees(semantic, id);
    },
    getTreeNodeView(element) {
      return treeNodeViews.get(element);
    },
    getSubTreeCallView(element) {
      return subTreeCallViews.get(element);
    },
  };
}

function collectModelDefinitionElements(root: BtXmlElement | undefined) {
  const elements = new Set<BtXmlElement>();
  if (!root) return elements;
  if (root.name === "TreeNodesModel") {
    collectDescendants(root, elements);
    return elements;
  }
  for (const child of root.children) {
    if (child.kind !== "element" || child.name !== "TreeNodesModel") continue;
    collectDescendants(child, elements);
  }
  return elements;
}

function collectDescendants(element: BtXmlElement, elements: Set<BtXmlElement>) {
  elements.add(element);
  for (const child of element.children) {
    if (child.kind === "element") collectDescendants(child, elements);
  }
}
