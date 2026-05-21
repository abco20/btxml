export {
  applyBaseline,
  applySuppressions,
  buildCheckResult,
  buildProjectIndex,
  checkFiles,
  createCheckContext,
  summarizeResults,
  uniqueDocuments,
  uniqueFilesByPath,
} from "./check/index.js";
export { resolveIncludeGraph } from "./internal/includes.js";
export {
  getProjectDocument,
  getProjectDocuments,
  getProjectIncludeIssues,
  getProjectNodeDefinitionModels,
  getProjectNodeModelSources,
  getProjectReachableDocuments,
  getProjectSemanticIndex,
  getReachableProjectDocuments,
} from "./queries.js";
export { asInternalProject } from "./project-handle.js";
export type {
  BuildProjectIndexInput,
  IncludeGraph,
  IncludeGraphResult,
  ProjectFacts,
  ProjectIndex,
  ProjectIndexResult,
} from "./internal-types.js";
export type { CheckContext } from "./check/index.js";
