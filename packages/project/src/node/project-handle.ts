import {
  getProjectAugmentationFiles,
  getProjectConfigUri,
  getProjectDefinitionFiles,
  getProjectModelFiles,
  getProjectRootUri,
  getProjectSelectedFiles,
} from "../index.js";
import type { BtxmlProject } from "../types.js";
import { fileUriToPath } from "./uri.js";

function withAbsolutePath<T extends { uri: string }>(files: T[]) {
  return files.map((file) => ({ ...file, absolutePath: fileUriToPath(file.uri) }));
}

export function getNodeProjectRootDir(project: BtxmlProject): string {
  return fileUriToPath(getProjectRootUri(project));
}

export function getNodeProjectConfigPath(project: BtxmlProject): string | undefined {
  const configUri = getProjectConfigUri(project);
  return configUri ? fileUriToPath(configUri) : undefined;
}

export function getNodeProjectSelectedFiles(project: BtxmlProject) {
  return withAbsolutePath(getProjectSelectedFiles(project));
}

export function getNodeProjectModelFiles(project: BtxmlProject) {
  return withAbsolutePath(getProjectModelFiles(project));
}

export function getNodeProjectAugmentationFiles(project: BtxmlProject) {
  return withAbsolutePath(getProjectAugmentationFiles(project));
}

export function getNodeProjectDefinitionFiles(project: BtxmlProject) {
  return withAbsolutePath(getProjectDefinitionFiles(project));
}
