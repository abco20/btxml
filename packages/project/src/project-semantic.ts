import type { Diagnostic } from "@btxml/foundation";
import type { BtDocument } from "@btxml/syntax";
import { buildProjectIndex } from "./check/context.js";
import { loadProjectDocuments } from "./documents.js";
import { asInternalProject } from "./project-handle.js";
import {
  getProjectDocuments,
  getProjectIncludeGraph,
  getProjectNodeDefinitionModels,
  getProjectSemanticIndex,
  getReachableProjectDocuments,
} from "./queries.js";
import type { LoadProjectSemanticIndexInput, LoadProjectSemanticIndexResult } from "./types.js";

export async function loadProjectSemanticIndex(
  input: LoadProjectSemanticIndexInput,
): Promise<LoadProjectSemanticIndexResult> {
  const project = asInternalProject(input.project);
  const resolvedConfig = project.resolvedConfig;
  if (!resolvedConfig) {
    throw new Error("Invariant: resolvedConfig is required");
  }

  const host = input.host ?? project.host;
  let documents = input.documents;
  let externalModelDocuments = input.externalModelDocuments;
  let augmentations = input.augmentations;
  const diagnostics: Diagnostic[] = [];

  if (!documents || !externalModelDocuments || !augmentations) {
    const loaded = await loadProjectDocuments(input.project, host);
    diagnostics.push(...loaded.diagnostics);
    documents ??= loaded.documents;
    externalModelDocuments ??= loaded.externalModelDocuments;
    augmentations ??= loaded.augmentations;
  }

  const projectIndex = await buildProjectIndex({
    project: input.project,
    documents,
    activeDocumentUris: new Set(documents.map((document) => document.uri)),
    externalModelDocuments,
    augmentations,
    resolveGraph: input.resolveGraph,
    resolvedConfig,
    host,
  });

  diagnostics.push(...projectIndex.diagnostics);

  return {
    ok: projectIndex.ok,
    diagnostics,
    semanticIndex: getProjectSemanticIndex(projectIndex.index),
    documents: getProjectDocuments(projectIndex.index),
    reachableDocuments: getReachableProjectDocuments(projectIndex.index),
    nodeDefinitionModels: getProjectNodeDefinitionModels(projectIndex.index),
    includeGraph: getProjectIncludeGraph(projectIndex.index),
  };
}
