import { createNodeWorkspaceHost, createNodeWorkspaceService } from "@btxml/language-service/node";
import type {
  BtProjectEditorService,
  LoadProjectOptions,
  NodeWorkspaceServiceOptions,
  ProjectLoadResult,
} from "@btxml/language-service/node";

export function createBtProjectEditorService(
  options: BtProjectEditorServiceOptions = {},
): BtProjectEditorService {
  return createNodeWorkspaceService(options);
}

export {
  createNodeWorkspaceHost,
  fileUriToPath,
  pathToFileUri,
} from "@btxml/language-service/node";

export type BtProjectEditorServiceOptions = NodeWorkspaceServiceOptions;

export type { BtProjectEditorService, LoadProjectOptions, ProjectLoadResult };
