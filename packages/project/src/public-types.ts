export type { ProjectHost } from "./host.js";

export type ProjectFile = {
  /**
   * Absolute document URI used as the stable identity across packages.
   * Example: "file:///repo/trees/main.xml"
   */
  readonly uri: string;

  /**
   * Project-relative display path.
   * Example: "trees/main.xml"
   */
  readonly path: string;

  readonly kind?: "bt-xml" | "model-xml" | "model-augmentation" | "node-definition" | "unknown";
};

export type {
  BtxmlProject,
  CheckProjectInput,
  CheckProjectResult,
  DiscoverProjectInput,
  DiscoverProjectResult,
  Entrypoint,
  LoadProjectSemanticIndexInput,
  LoadProjectSemanticIndexResult,
  LoadProjectModelAugmentationsInput,
  ProjectIncludeGraphEdgeView,
  ProjectIncludeGraphNodeView,
  ProjectIncludeGraphView,
  ProjectIncludeIssueView,
  ProjectModelAugmentationsResult,
  SkippedFile,
  WorkspaceCheckInput,
  WorkspaceCheckResult,
} from "./types.js";
