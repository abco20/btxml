import { getNodeUsagePolicyForRules } from "@btxml/analyzer/rules";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import { getEffectiveConfigForFile } from "@btxml/config";
import { type Diagnostic, DiagnosticSeverity } from "@btxml/foundation";
import type { ModelAugmentationFile, TreeNodeModelDef } from "@btxml/model";
import {
  buildSemanticIndex,
  getBehaviorTreeIds,
  getBehaviorTrees,
  getEffectiveNodeModels,
  getNodeModelDefinitions,
  getNodeModelIds,
} from "@btxml/semantic";
import { buildBtDocumentView } from "@btxml/semantic/ast-view";
import type { BtDocument } from "@btxml/syntax";
import type { IncludeIssue, SuppressionIssue } from "../analyzer-facts.js";
import { loadExternalTreeNodesModelFile } from "../documents.js";
import type {
  BuildProjectIndexInput,
  ProjectIndex,
  ProjectIndexResult,
} from "../internal-types.js";
import { getProjectResolutionMode } from "../internal/entrypoints.js";
import { resolveIncludeGraph } from "../internal/includes.js";
import { loadProjectModelAugmentations } from "../model-augmentations.js";
import { loadProjectNodeModels } from "../node-definitions.js";
import { validateModelConventions } from "../model-conventions.js";
import { asInternalProject } from "../project-handle.js";
import { relativeUri } from "../uri.js";
import type { InternalCheckProjectInput, InternalFileCheckResult } from "./internal-types.js";

function projectRelative(rootUri: string, fileUri: string) {
  return relativeUri(rootUri, fileUri).replace(/\\/g, "/");
}

function getProjectReachableDocuments(index: ProjectIndex): BtDocument[] {
  return [...index.reachableDocuments.values()];
}

export function uniqueDocuments(documents: BtDocument[]) {
  const map = new Map<string, BtDocument>();
  for (const document of documents) map.set(document.uri, document);
  return [...map.values()];
}

export function uniqueFilesByPath<T extends { path: string }>(files: T[]) {
  const map = new Map<string, T>();
  for (const file of files) map.set(file.path, file);
  return [...map.values()];
}

function groupIncludeIssues(issues: IncludeIssue[]) {
  const map = new Map<string, IncludeIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.uri) ?? [];
    list.push(issue);
    map.set(issue.uri, list);
  }
  return map;
}

export async function buildProjectIndex(
  input: BuildProjectIndexInput,
): Promise<ProjectIndexResult> {
  const diagnostics: ProjectIndexResult["diagnostics"] = [];
  const project = asInternalProject(input.project);
  const resolvedConfig = input.resolvedConfig;
  const mode = input.resolutionMode ?? getProjectResolutionMode(resolvedConfig);
  const graphResult =
    mode === "entrypoints" || input.resolveGraph
      ? await resolveIncludeGraph({
          project: input.project,
          documents: input.documents,
          resolvedConfig,
          host: input.host,
        })
      : undefined;
  const externalDocs = input.externalModelDocuments;
  const augmentations = input.augmentations;

  const nodeDefinitions = await loadProjectNodeModels({
    project: input.project,
    host: input.host,
  });
  diagnostics.push(...nodeDefinitions.diagnostics);
  const nodeDefinitionModels = nodeDefinitions.nodeModels;

  const activeDocs =
    graphResult && (mode === "entrypoints" || input.resolveGraph)
      ? uniqueDocuments([
          ...input.documents.filter(
            (document) =>
              input.activeDocumentUris.has(document.uri) &&
              graphResult.reachableUris.has(document.uri),
          ),
          ...[...graphResult.reachableDocuments.values()],
          ...externalDocs,
        ])
      : uniqueDocuments([
          ...input.documents.filter((document) => input.activeDocumentUris.has(document.uri)),
          ...externalDocs,
        ]);
  const semanticResult = buildSemanticIndex(activeDocs, {
    config: resolvedConfig,
    models: nodeDefinitionModels,
    augmentations,
  });
  const facts = {
    includeIssuesByUri: groupIncludeIssues(graphResult?.issues ?? []),
    suppressionIssuesByUri: new Map<string, SuppressionIssue[]>(),
  };
  diagnostics.push(
    ...semanticResult.diagnostics,
    ...validateModelConventions({
      config: resolvedConfig,
      index: semanticResult.index,
    }),
  );
  const reachableBehaviorTreesById = new Map(
    getBehaviorTreeIds(semanticResult.index).map((id) => [
      id,
      getBehaviorTrees(semanticResult.index, id),
    ]),
  );
  const index: ProjectIndex = {
    mode,
    files: new Map(
      activeDocs.map(
        (document) =>
          [projectRelative(project.rootUri, document.path || document.uri), document] as const,
      ),
    ),
    documentViews: new Map(
      activeDocs.map((document) => [
        document.uri,
        (() => {
          const effectiveConfig = getEffectiveConfigForFile(
            resolvedConfig,
            projectRelative(project.rootUri, document.path || document.uri),
          );
          return buildBtDocumentView(document, {
            semantic: semanticResult.index,
            config: effectiveConfig,
            policy: getNodeUsagePolicyForRules(effectiveConfig),
          });
        })(),
      ]),
    ),
    includeGraph: graphResult?.graph,
    reachableDocuments: graphResult?.reachableDocuments ?? new Map(),
    behaviorTreesById: new Map(
      getBehaviorTreeIds(semanticResult.index).map((id) => [
        id,
        getBehaviorTrees(semanticResult.index, id),
      ]),
    ),
    reachableBehaviorTreesById,
    nodeModelsById: new Map(
      getEffectiveNodeModels(semanticResult.index).map((model) => [model.id, model]),
    ),
    nodeModelSources: new Map(
      getNodeModelIds(semanticResult.index).map((id) => [
        id,
        getNodeModelDefinitions(semanticResult.index, id).flatMap((model) =>
          model.sourceMeta ? [model.sourceMeta] : [],
        ),
      ]),
    ),
    nodeDefinitionModels: [...nodeDefinitionModels],
    entrypoints: project.entrypoints,
    workspace: semanticResult.index,
    facts,
  };

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== DiagnosticSeverity.Error),
    index,
    diagnostics,
  };
}

export interface CheckContext {
  input: InternalCheckProjectInput;
  project: InternalCheckProjectInput["project"];
  documents: BtDocument[];
  externalModelDocuments: BtDocument[];
  augmentations: ModelAugmentationFile[];
  projectDiagnostics: Diagnostic[];
  indexResult: ProjectIndexResult;
  nodeDefinitionModels: TreeNodeModelDef[];
  fileDocuments: BtDocument[];
  lintEnabled: boolean;
  showSuppressed: boolean | undefined;
  resolvedConfig: ResolvedBtxmlConfig;
  files?: InternalFileCheckResult[];
  finalProjectDiagnostics?: Diagnostic[];
  includeIssuesByUri?: Map<string, IncludeIssue[]>;
  suppressionIssuesByUri?: Map<string, SuppressionIssue[]>;
}

export async function createCheckContext(input: InternalCheckProjectInput): Promise<CheckContext> {
  const project = asInternalProject(input.project);
  const resolvedConfig = input.resolvedConfig ?? project.resolvedConfig;
  if (!resolvedConfig) {
    throw new Error("Invariant: resolvedConfig is required");
  }

  const projectDiagnostics = [...(input.projectDiagnostics ?? [])];
  const host = input.host ?? project.host;
  const externalModelDocuments =
    input.externalModelDocuments !== undefined
      ? [...input.externalModelDocuments]
      : (
          await Promise.all(
            project.modelFiles.map(async (file) => {
              const result = await loadExternalTreeNodesModelFile(file, host);
              projectDiagnostics.push(...result.diagnostics);
              return result.document ? [result.document] : [];
            }),
          )
        ).flat();
  let finalAugmentations = input.augmentations !== undefined ? [...input.augmentations] : undefined;
  if (!finalAugmentations) {
    const loadedAugmentations = await loadProjectModelAugmentations({
      project: input.project,
      host,
    });
    projectDiagnostics.push(...loadedAugmentations.diagnostics);
    finalAugmentations = [...loadedAugmentations.augmentations];
  }
  const mode = input.resolutionMode ?? getProjectResolutionMode(resolvedConfig);
  const activeDocumentUris =
    mode === "entrypoints"
      ? new Set(
          input.documents
            .filter((document) => document.kind === "bt-document")
            .map((document) => document.uri),
        )
      : new Set(input.documents.map((document) => document.uri));
  const indexResult = await buildProjectIndex({
    project: input.project,
    documents: input.documents,
    activeDocumentUris,
    externalModelDocuments,
    augmentations: finalAugmentations,
    resolutionMode: mode,
    resolveGraph: input.mode === "check",
    resolvedConfig,
    host,
  });
  const fileDocuments = uniqueDocuments([
    ...input.documents,
    ...getProjectReachableDocuments(indexResult.index),
    ...externalModelDocuments,
  ]);
  const lintEnabled = resolvedConfig.linter.enabled !== false;
  const showSuppressed = input.showSuppressed;
  const nodeDefinitionModels = [...indexResult.index.nodeDefinitionModels];

  return {
    input,
    project: input.project,
    documents: input.documents,
    externalModelDocuments,
    augmentations: finalAugmentations,
    projectDiagnostics,
    indexResult,
    nodeDefinitionModels,
    fileDocuments,
    lintEnabled,
    showSuppressed,
    resolvedConfig,
    suppressionIssuesByUri: undefined,
  };
}
