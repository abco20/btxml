import type { ResolvedFilesConfig, ResolvedModelsConfig } from "@btxml/config";
import type { ProjectHost } from "./host.js";
import { expandPatterns, projectRelative } from "./internal/files.js";
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
  const modelFilesPatternResult = await expandPatterns(
    modelsConfig.files,
    rootUri,
    [],
    filesConfig.followSymlinks,
    undefined,
    undefined,
    host,
  );
  const definitionFilesPatternResult = await expandPatterns(
    modelsConfig.definitions,
    rootUri,
    [],
    filesConfig.followSymlinks,
    undefined,
    undefined,
    host,
  );
  const augmentationFilesPatternResult = await expandPatterns(
    modelsConfig.augmentations,
    rootUri,
    [],
    filesConfig.followSymlinks,
    undefined,
    undefined,
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
