import type { RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import type { BtxmlProject as InternalBtxmlProject } from "./internal-types.js";
import type { BtxmlProject, Entrypoint, ProjectFile, SkippedFile } from "./types.js";

export function toBtxmlProject(project: InternalBtxmlProject): BtxmlProject {
  return project as unknown as BtxmlProject;
}

export function asInternalProject(project: BtxmlProject): InternalBtxmlProject {
  return project as unknown as InternalBtxmlProject;
}

export function getProjectRootUri(project: BtxmlProject): string {
  return asInternalProject(project).rootUri;
}

export function getProjectConfigUri(project: BtxmlProject): string | undefined {
  return asInternalProject(project).configUri;
}

export function getProjectConfig(project: BtxmlProject): RawBtxmlConfig {
  return asInternalProject(project).config;
}

export function getProjectResolvedConfig(project: BtxmlProject): ResolvedBtxmlConfig | undefined {
  return asInternalProject(project).resolvedConfig;
}

export function getProjectSelectedFiles(project: BtxmlProject): ProjectFile[] {
  return asInternalProject(project).selectedFiles.map((file) => ({ ...file }));
}

export function getProjectEntrypoints(project: BtxmlProject): Entrypoint[] {
  return asInternalProject(project).entrypoints.map((entrypoint) => ({ ...entrypoint }));
}

export function getProjectModelFiles(project: BtxmlProject): ProjectFile[] {
  return asInternalProject(project).modelFiles.map((file) => ({ ...file }));
}

export function getProjectAugmentationFiles(project: BtxmlProject): ProjectFile[] {
  return asInternalProject(project).augmentationFiles.map((file) => ({ ...file }));
}

export function getProjectDefinitionFiles(project: BtxmlProject): ProjectFile[] {
  return asInternalProject(project).definitionFiles.map((file) => ({ ...file }));
}

export function getProjectSkippedFiles(project: BtxmlProject): SkippedFile[] {
  return asInternalProject(project).skippedFiles.map((file) => ({ ...file }));
}
