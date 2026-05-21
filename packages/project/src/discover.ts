import { RuleCodes } from "@btxml/analyzer/rules";
import { normalizeBtxmlConfig } from "@btxml/config";
import { DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import { discoverBtxmlConfig } from "./config-discovery.js";
import { normalizeEntrypoints, validateEntrypoints } from "./internal/entrypoints.js";
import { discoverProjectFiles, projectRelative } from "./internal/files.js";
import { discoverModelFiles } from "./models.js";
import { toBtxmlProject } from "./project-handle.js";
import type { DiscoverProjectInput, DiscoverProjectResult } from "./types.js";
import { projectUriOps } from "./uri.js";

async function discoverProjectRootUri(input: {
  startUri: string;
  configUri?: string;
  host: DiscoverProjectInput["host"];
}) {
  if (input.configUri) return projectUriOps.dirname(input.configUri);

  let current = input.startUri;
  while (true) {
    if (await input.host.exists(projectUriOps.join(current, ".git"))) return current;
    if (await input.host.exists(projectUriOps.join(current, ".colcon"))) return current;
    const parent = projectUriOps.dirname(current);
    if (parent === current) return input.startUri;
    current = parent;
  }
}

export async function discoverProject(input: DiscoverProjectInput): Promise<DiscoverProjectResult> {
  const loaded = await discoverBtxmlConfig({
    startUri: input.rootUri,
    configUri: input.configUri,
    noConfig: input.noConfig,
    host: input.host,
  });
  if (!loaded.ok || !loaded.config) return { ok: false, diagnostics: loaded.diagnostics };

  const normalized = normalizeBtxmlConfig(loaded.config);
  if (!normalized.ok) {
    return { ok: false, diagnostics: [...loaded.diagnostics, ...normalized.diagnostics] };
  }

  const config = normalized.config;
  const rootUri = await discoverProjectRootUri({
    startUri: input.rootUri,
    configUri: loaded.configUri,
    host: input.host,
  });
  const { selectedFiles, skippedFiles } = await discoverProjectFiles(
    rootUri,
    config.files,
    input.cliFiles,
    input.rootUri,
    input.host,
  );

  const diagnostics = [...loaded.diagnostics, ...normalized.diagnostics];
  const configLocation = loaded.configUri ? projectRelative(rootUri, loaded.configUri) : "";
  const entrypoints = normalizeEntrypoints(config.resolver);

  for (const entry of entrypoints) {
    const entryUri = projectUriOps.join(rootUri, entry.file);
    if (
      (await input.host.exists(entryUri)) &&
      !selectedFiles.some((file) => file.uri === entryUri)
    ) {
      selectedFiles.push({ path: entry.file, uri: entryUri, kind: "bt-xml" });
    }
  }

  const {
    modelFiles,
    augmentationFiles,
    definitionFiles,
    unmatchedPatterns: modelUnmatched,
  } = await discoverModelFiles(rootUri, config.models, config.files, input.host);

  for (const pattern of modelUnmatched.models) {
    diagnostics.push(
      createDiagnostic(
        RuleCodes.ExternalModelFileNotFound,
        DiagnosticSeverity.Error,
        `external TreeNodesModel file not found \`${pattern}\``,
        undefined,
        configLocation,
        {
          help: "check `models.files` and make sure the file exists",
        },
      ),
    );
  }

  for (const pattern of modelUnmatched.definitions) {
    diagnostics.push(
      createDiagnostic(
        RuleCodes.NodeDefinitionFileNotFound,
        DiagnosticSeverity.Error,
        `node definition file not found \`${pattern}\``,
        undefined,
        configLocation,
        {
          help: "check `models.definitions` and make sure the file exists",
        },
      ),
    );
  }

  for (const pattern of modelUnmatched.augmentations) {
    diagnostics.push(
      createDiagnostic(
        RuleCodes.AugmentationFileNotFound,
        DiagnosticSeverity.Error,
        `model augmentation file not found \`${pattern}\``,
        undefined,
        configLocation,
        {
          help: "check `models.augmentations` and make sure the file exists",
        },
      ),
    );
  }

  const modelsBuiltins = config.models.builtins;

  diagnostics.push(
    ...(await validateEntrypoints(rootUri, entrypoints, configLocation, input.host)),
  );

  return {
    ok: true,
    diagnostics,
    project: toBtxmlProject({
      rootUri,
      configUri: loaded.configUri,
      host: input.host,
      config: loaded.config,
      resolvedConfig: config,
      selectedFiles,
      entrypoints,
      modelFiles,
      augmentationFiles,
      definitionFiles,
      skippedFiles,
      modelsBuiltins,
    }),
  };
}
