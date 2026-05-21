import type { EffectiveFileConfig, RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic, SourceRange } from "@btxml/foundation";
import type {
  BehaviorTreeDef,
  ConfigNodeModel,
  ConfigPortDef,
  ModelAugmentationFile,
  NodeDefinitionsFile,
  PortDef,
  TreeNodeModelDef,
} from "@btxml/model";
import type { SemanticIndex } from "@btxml/semantic";
import type { BtDocumentView } from "@btxml/semantic/ast-view";
import type { BtDocument, BtDocumentKind } from "@btxml/syntax";
import type {
  IncludeIssue,
  IncludeIssueKind,
  ProjectFacts,
  SuppressionIssue,
  SuppressionIssueKind,
} from "./analyzer-facts.js";
import type { ProjectHost } from "./host.js";
import type { BtxmlProject as PublicBtxmlProject } from "./types.js";

export type ProjectFile = {
  path: string;
  uri: string;
  kind?: "bt-xml" | "model-xml" | "model-augmentation" | "node-definition" | "unknown";
};

export type SkippedFile = {
  path: string;
  reason: "excluded" | "gitignored" | "not-bt-xml" | "too-large" | "unreadable" | "symlink-skipped";
};

export type BtxmlProject = {
  rootUri: string;
  configUri?: string;
  host: ProjectHost;
  config: RawBtxmlConfig;
  resolvedConfig?: ResolvedBtxmlConfig;
  selectedFiles: ProjectFile[];
  entrypoints: Entrypoint[];
  modelFiles: ProjectFile[];
  augmentationFiles: ProjectFile[];
  definitionFiles: ProjectFile[];
  skippedFiles: SkippedFile[];
  modelsBuiltins?: string[];
};

export type EntrypointConfig = string | { file: string; tree?: string; name?: string };

export type Entrypoint = { file: string; tree?: string; name?: string };

export type { ConfigNodeModel, ConfigPortDef, NodeDefinitionsFile };

export type LoadConfigInput = {
  startUri: string;
  configUri?: string;
  noConfig?: boolean;
  host: ProjectHost;
};

export type LoadConfigResult = {
  ok: boolean;
  config?: RawBtxmlConfig;
  configUri?: string;
  diagnostics: Diagnostic[];
};

export type NormalizeConfigOptions = {
  rootUri?: string;
  configUri?: string;
};

export type NormalizeConfigResult = {
  ok: boolean;
  config: RawBtxmlConfig;
  diagnostics: Diagnostic[];
};

export type DiscoverProjectInput = {
  rootUri: string;
  host: ProjectHost;
  cliFiles?: readonly string[];
  configUri?: string;
  noConfig?: boolean;
  command?: "format" | "lint" | "check" | "repair" | "dump-model" | "list-files" | "graph";
};

export type DiscoverProjectResult = {
  ok: boolean;
  project?: BtxmlProject;
  diagnostics: Diagnostic[];
};

export type IncludeGraphNode = {
  path: string;
  document?: BtDocument;
  exists: boolean;
};

export type IncludeGraphEdge = {
  from: string;
  to: string;
  includeElementRange: SourceRange;
  includePathRange: SourceRange;
};

export type IncludeCycle = { files: string[] };

export type IncludeGraph = {
  nodes: Map<string, IncludeGraphNode>;
  edges: IncludeGraphEdge[];
  entrypointFiles: string[];
  reachableFiles: Set<string>;
  cycles: IncludeCycle[];
};

export type ResolveIncludeGraphInput = {
  project: PublicBtxmlProject;
  documents: BtDocument[];
  resolvedConfig: ResolvedBtxmlConfig;
  host?: ProjectHost;
};

export type IncludeGraphResult = {
  graph: IncludeGraph;
  reachableUris: Set<string>;
  reachableDocuments: Map<string, BtDocument>;
  issues: IncludeIssue[];
};

export type ProjectIndex = {
  mode: "single-file" | "workspace" | "entrypoints";
  files: Map<string, BtDocument>;
  documentViews: Map<string, BtDocumentView>;
  includeGraph?: IncludeGraph;
  reachableDocuments: Map<string, BtDocument>;
  behaviorTreesById: Map<string, BehaviorTreeDef[]>;
  reachableBehaviorTreesById: Map<string, BehaviorTreeDef[]>;
  nodeModelsById: Map<string, TreeNodeModelDef>;
  nodeModelSources: Map<string, Array<{ sourceKind: string; file?: string; range?: SourceRange }>>;
  nodeDefinitionModels: readonly TreeNodeModelDef[];
  entrypoints: Entrypoint[];
  workspace: SemanticIndex;
  facts: ProjectFacts;
};

export type BuildProjectIndexInput = {
  project: PublicBtxmlProject;
  documents: BtDocument[];
  activeDocumentUris: Set<string>;
  externalModelDocuments: BtDocument[];
  augmentations: ModelAugmentationFile[];
  resolutionMode?: ProjectIndex["mode"];
  resolveGraph?: boolean;
  resolvedConfig: ResolvedBtxmlConfig;
  host?: ProjectHost;
};

export type ProjectIndexResult = {
  ok: boolean;
  index: ProjectIndex;
  diagnostics: Diagnostic[];
};

export type ProjectNodeModelsResult = {
  ok: boolean;
  nodeModels: readonly TreeNodeModelDef[];
  diagnostics: Diagnostic[];
};

export type LoadProjectNodeModelsInput = { project: BtxmlProject; host?: ProjectHost };

export type FileCheckResult = {
  path: string;
  uri: string;
  kind?: BtDocumentKind;
  documentView?: BtDocumentView;
  diagnostics: Diagnostic[];
  skipped?: boolean;
  skipReason?: string;
  needsFormat?: boolean;
  formatted?: string;
  originalText?: string;
  rawDiagnostics?: Diagnostic[];
};

export type CheckRuntimeOptions = {
  reporter: "human" | "json";
  maxWarnings?: number;
  updateBaseline?: boolean | string;
  showSkipped?: boolean;
  showSuppressed?: boolean;
};

export type DiagnosticBaselineEntry = {
  path: string;
  code: string;
  messageHash: string;
  range?: SourceRange;
};

export type DiagnosticBaseline = {
  version: 1;
  diagnostics: DiagnosticBaselineEntry[];
};

export type ProjectCheckSummary = {
  files: number;
  errors: number;
  warnings: number;
  infos: number;
  suppressed?: number;
  baselineFiltered?: number;
  staleEntries?: DiagnosticBaselineEntry[];
};

export type BaselineFilterResult = {
  diagnostics: Diagnostic[];
  baselineDiagnostics: Diagnostic[];
  staleEntries: DiagnosticBaselineEntry[];
};

export type CheckProjectInput = {
  project: BtxmlProject;
  documents: BtDocument[];
  externalModelDocuments?: BtDocument[];
  augmentations?: ModelAugmentationFile[];
  mode?: "format" | "lint" | "check";
  showSuppressed?: boolean;
  baseline?: DiagnosticBaseline;
  projectDiagnostics?: Diagnostic[];
  runtime?: CheckRuntimeOptions;
  resolvedConfig?: ResolvedBtxmlConfig;
  host?: ProjectHost;
};

export type CheckProjectResult = {
  ok: boolean;
  files: FileCheckResult[];
  projectDiagnostics: Diagnostic[];
  summary: ProjectCheckSummary;
  suppressedDiagnostics?: Diagnostic[];
  baselineDiagnostics?: Diagnostic[];
  rawFiles?: FileCheckResult[];
};

export type SuppressionContext = {
  documents?: BtDocument[];
  requireReason?: boolean;
  allowInline?: boolean;
  showSuppressed?: boolean;
};

export type LoadProjectOptions = {
  rootUri?: string;
  configUri?: string;
  host: ProjectHost;
};

export type ProjectLoadResult = {
  ok: boolean;
  project?: BtxmlProject;
  projectIndex?: ProjectIndex;
  diagnostics: Diagnostic[];
};

export type {
  EffectiveFileConfig,
  IncludeIssue,
  IncludeIssueKind,
  ProjectFacts,
  PortDef,
  SuppressionIssue,
  SuppressionIssueKind,
};
