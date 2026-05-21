export { checkProject } from "./check/index.js";
export {
  baselineEntriesFromDiagnostics,
  diagnosticBaselineEntry,
  diagnosticBaselineSchema,
  getBaselinePath,
} from "./baseline.js";
export { loadProjectDocuments } from "./documents.js";
export { loadProjectModelAugmentations } from "./model-augmentations.js";
export { checkBtWorkspace } from "./check-workspace.js";
export { discoverProject } from "./discover.js";
export {
  getProjectAugmentationFiles,
  getProjectConfig,
  getProjectConfigUri,
  getProjectDefinitionFiles,
  getProjectEntrypoints,
  getProjectModelFiles,
  getProjectResolvedConfig,
  getProjectRootUri,
  getProjectSelectedFiles,
  getProjectSkippedFiles,
} from "./project-handle.js";
export { loadProjectSemanticIndex } from "./project-semantic.js";

export type * from "./host.js";
export type * from "./public-types.js";
export type { DiagnosticBaseline, DiagnosticBaselineEntry } from "./baseline.js";
