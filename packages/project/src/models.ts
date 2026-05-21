import type { ResolvedFilesConfig, ResolvedModelsConfig } from "@btxml/config";
import type { ProjectHost } from "./host.js";
import {
  createIgnoreInstance,
  expandPatterns,
  loadGitignore,
  projectRelative,
} from "./internal/files.js";
import type { ProjectFile } from "./types.js";

export async function discoverModelFiles(
  rootUri: string,
  modelsConfig: ResolvedModelsConfig,
  filesConfig: ResolvedFilesConfig,
  host: ProjectHost,
): Promise<{
  modelFiles: ProjectFile[];
  augmentationFiles: ProjectFile[];
  definitionFiles: ProjectFile[];
  unmatchedPatterns: { models: string[]; augmentations: string[]; definitions: string[] };
}> {
  const ignore = [...filesConfig.ignore];
  const gitignoreLines = filesConfig.useGitignore ? await loadGitignore(rootUri, host) : [];
  const ig = createIgnoreInstance(gitignoreLines);

  const modelFilesPatternResult = await expandPatterns(
    modelsConfig.files,
    rootUri,
    ignore,
    filesConfig.followSymlinks,
    undefined,
    ig,
    host,
  );
  const definitionFilesPatternResult = await expandPatterns(
    modelsConfig.definitions,
    rootUri,
    ignore,
    filesConfig.followSymlinks,
    undefined,
    ig,
    host,
  );
  const augmentationFilesPatternResult = await expandPatterns(
    modelsConfig.augmentations,
    rootUri,
    ignore,
    filesConfig.followSymlinks,
    undefined,
    ig,
    host,
  );

  const modelFiles = modelFilesPatternResult.files.map((uri: string) => ({
    path: projectRelative(rootUri, uri),
    uri,
    kind: "model-xml" as const,
  }));
  const definitionFiles = definitionFilesPatternResult.files.map((uri: string) => ({
    path: projectRelative(rootUri, uri),
    uri,
    kind: "node-definition" as const,
  }));
  const augmentationFiles = augmentationFilesPatternResult.files.map((uri: string) => ({
    path: projectRelative(rootUri, uri),
    uri,
    kind: "model-augmentation" as const,
  }));

  return {
    modelFiles,
    augmentationFiles,
    definitionFiles,
    unmatchedPatterns: {
      models: modelFilesPatternResult.unmatchedPatterns,
      augmentations: augmentationFilesPatternResult.unmatchedPatterns,
      definitions: definitionFilesPatternResult.unmatchedPatterns,
    },
  };
}
