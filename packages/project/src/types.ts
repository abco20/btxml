import type { EffectiveFileConfig, RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import type { SourceRange } from "@btxml/foundation";
import type { ModelAugmentationFile, TreeNodeModelDef } from "@btxml/model";
import type { SemanticIndex, WorkspaceInput } from "@btxml/semantic";
import type { BtDocument, BtDocumentKind } from "@btxml/syntax";
import type { ProjectHost } from "./host.js";

declare const btxmlProjectBrand: unique symbol;

export type BtxmlProject = {
  readonly [btxmlProjectBrand]: typeof btxmlProjectBrand;
};

export type ProjectFile = {
  path: string;
  uri: string;
  kind?: "bt-xml" | "model-xml" | "model-augmentation" | "node-definition" | "unknown";
};

export type SkippedFile = {
  path: string;
  reason: "excluded" | "gitignored" | "not-bt-xml" | "too-large" | "unreadable" | "symlink-skipped";
};

export type Entrypoint = { file: string; tree?: string; name?: string };

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

export type ProjectCommand =
  | "format"
  | "lint"
  | "check"
  | "repair"
  | "dump-model"
  | "list-files"
  | "graph";

export type DiscoverProjectInput = {
  rootUri: string;
  host: ProjectHost;
  cliFiles?: readonly string[];
  configUri?: string;
  noConfig?: boolean;
  command?: ProjectCommand;
};

export type DiscoverProjectResult = {
  ok: boolean;
  project?: BtxmlProject;
  diagnostics: Diagnostic[];
};

export type ProjectNodeModelsResult = {
  ok: boolean;
  nodeModels: readonly TreeNodeModelDef[];
  diagnostics: Diagnostic[];
};

export type LoadProjectNodeModelsInput = { project: BtxmlProject; host?: ProjectHost };

export type ProjectModelAugmentationsResult = {
  ok: boolean;
  augmentations: readonly ModelAugmentationFile[];
  diagnostics: Diagnostic[];
};

export type LoadProjectModelAugmentationsInput = { project: BtxmlProject; host?: ProjectHost };

export type FileCheckResult = {
  path: string;
  uri: string;
  kind?: BtDocumentKind;
  diagnostics: Diagnostic[];
  rawDiagnostics?: Diagnostic[];
  skipped?: boolean;
  skipReason?: string;
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

export type CheckProjectInput = {
  project: BtxmlProject;
  mode?: "format" | "lint" | "check";
  documents?: BtDocument[];
  externalModelDocuments?: BtDocument[];
  augmentations?: ModelAugmentationFile[];
  projectDiagnostics?: Diagnostic[];
  baseline?: DiagnosticBaseline;
  showSuppressed?: boolean;
  maxWarnings?: number;
  includeRawDiagnostics?: boolean;
  host?: ProjectHost;
};

export type CheckProjectResult = {
  ok: boolean;
  files: FileCheckResult[];
  projectDiagnostics: Diagnostic[];
  summary: ProjectCheckSummary;
};

export type LoadProjectSemanticIndexInput = {
  project: BtxmlProject;
  documents?: BtDocument[];
  externalModelDocuments?: BtDocument[];
  augmentations?: ModelAugmentationFile[];
  resolveGraph?: boolean;
  host?: ProjectHost;
};

export type ProjectIncludeGraphNodeView = {
  readonly uri: string;
  readonly path: string;
  readonly exists: boolean;
};

export type ProjectIncludeGraphEdgeView = {
  readonly from: string;
  readonly to: string;
  readonly includeElementRange?: SourceRange;
  readonly includePathRange?: SourceRange;
};

export type ProjectIncludeIssueView = {
  readonly kind: string;
  readonly uri: string;
  readonly path?: string;
  readonly message: string;
  readonly range?: SourceRange;
};

export type ProjectIncludeGraphView = {
  readonly nodes: readonly ProjectIncludeGraphNodeView[];
  readonly edges: readonly ProjectIncludeGraphEdgeView[];
  readonly issues: readonly ProjectIncludeIssueView[];
};

export type LoadProjectSemanticIndexResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  semanticIndex: SemanticIndex;
  documents: BtDocument[];
  reachableDocuments: BtDocument[];
  nodeDefinitionModels: readonly TreeNodeModelDef[];
  includeGraph?: ProjectIncludeGraphView;
};

export type LoadProjectOptions = {
  rootUri?: string;
  configUri?: string;
  host: ProjectHost;
};

export type CheckOptions = {
  config: EffectiveFileConfig;
  uri?: string;
  path?: string;
};

export type CheckResult = {
  ok: boolean;
  formatted?: string;
  needsFormat: boolean;
  skipped?: boolean;
  diagnostics: Diagnostic[];
};

export type WorkspaceCheckInput = {
  inputs: WorkspaceInput[];
  config: ResolvedBtxmlConfig;
};

export type WorkspaceCheckResult = {
  ok: boolean;
  files: Array<{
    uri: string;
    path?: string;
    diagnostics: Diagnostic[];
    skipped?: boolean;
    skipReason?: string;
    formatted?: boolean;
  }>;
  projectDiagnostics: Diagnostic[];
  summary: {
    files: number;
    errors: number;
    warnings: number;
    infos: number;
    formatErrors?: number;
  };
};
