import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBtxmlConfig } from "@btxml/config";
import type { BtxmlProject } from "@btxml/project";
import { getProjectResolvedConfig } from "@btxml/project";
import { buildProjectIndex } from "../src/check/context.js";

function makeProject(config: unknown): BtxmlProject {
  const resolvedConfig = normalizeBtxmlConfig(config as Record<string, unknown>).config;
  return {
    rootUri: "file:///tmp",
    config: config as Record<string, unknown>,
    resolvedConfig,
    host: {} as never,
    selectedFiles: [],
    entrypoints: [],
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
    modelsBuiltins: ["btcpp-v4"],
  } as unknown as BtxmlProject;
}

test("project-check.ts uses entrypoints mode when resolver.entrypoints is set", async () => {
  const project = makeProject({
    resolver: {
      entrypoints: ["main.xml"],
    },
  });
  const resolvedConfig = getProjectResolvedConfig(project);
  if (!resolvedConfig) throw new Error("expected resolvedConfig");
  const result = await buildProjectIndex({
    project,
    documents: [],
    activeDocumentUris: new Set(),
    externalModelDocuments: [],
    augmentations: [],
    resolvedConfig,
  });
  assert.equal(result.index.mode, "entrypoints");
});

test("project-check.ts uses workspace mode when resolver.entrypoints is empty", async () => {
  const project = makeProject({});
  const resolvedConfig = getProjectResolvedConfig(project);
  if (!resolvedConfig) throw new Error("expected resolvedConfig");
  const result = await buildProjectIndex({
    project,
    documents: [],
    activeDocumentUris: new Set(),
    externalModelDocuments: [],
    augmentations: [],
    resolvedConfig,
  });
  assert.equal(result.index.mode, "workspace");
});

test("workspace mode is used when no resolver.entrypoints are configured", async () => {
  const project = makeProject({});
  const resolvedConfig = getProjectResolvedConfig(project);
  if (!resolvedConfig) throw new Error("expected resolvedConfig");
  const result = await buildProjectIndex({
    project,
    documents: [],
    activeDocumentUris: new Set(),
    externalModelDocuments: [],
    augmentations: [],
    resolvedConfig,
  });
  assert.equal(result.index.mode, "workspace");
});
