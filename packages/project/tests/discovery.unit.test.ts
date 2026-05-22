import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  ResolvedFilesConfig,
  ResolvedModelsConfig,
  ResolvedResolverConfig,
} from "@btxml/config";
import { normalizeEntrypoints, validateEntrypoints } from "../src/internal/entrypoints.js";
import { discoverProjectFiles } from "../src/internal/files.js";
import { discoverModelFiles } from "../src/models.js";
import { createNodeProjectHost, pathToFileUri } from "../src/node.js";

function resolvedFiles(partial: Partial<ResolvedFilesConfig> = {}): ResolvedFilesConfig {
  return {
    include: ["**/*.xml"],
    ignore: [],
    useGitignore: true,
    followSymlinks: false,
    maxSize: Number.POSITIVE_INFINITY,
    ...partial,
  };
}

function resolvedModels(partial: Partial<ResolvedModelsConfig> = {}): ResolvedModelsConfig {
  return {
    builtins: ["btcpp-v4"],
    files: [],
    augmentations: [],
    definitions: [],
    inline: {},
    convention: "allow-unused",
    ...partial,
  };
}

function resolvedResolver(partial: Partial<ResolvedResolverConfig> = {}): ResolvedResolverConfig {
  return {
    entrypoints: [],
    includes: {
      elements: [{ name: "include", attribute: "path", base: "file" }],
      variables: {},
      allowOutsideRoot: false,
      maxDepth: 32,
      maxFiles: 1000,
    },
    behaviorTreeIds: "workspace-unique",
    ...partial,
  };
}

test("include glob discovery returns expected files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-"));
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "a.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "b.txt"), "text", "utf8");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "c.xml"), "<root/>", "utf8");
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    resolvedFiles({ include: ["**/*.xml"] }),
    undefined,
    undefined,
    host,
  );
  assert.deepEqual(
    result.selectedFiles.map((f) => f.path).sort((a, b) => a.localeCompare(b)),
    ["a.xml", "sub/c.xml"],
  );
});

test("ignore glob discovery excludes expected files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-ignore-"));
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "a.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "b.xml"), "<root/>", "utf8");
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    resolvedFiles({ include: ["*.xml"], ignore: ["b.xml"] }),
    undefined,
    undefined,
    host,
  );
  assert.deepEqual(
    result.selectedFiles.map((f) => f.path),
    ["a.xml"],
  );
});

test("gitignore behavior is respected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-gitignore-"));
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "a.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "b.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, ".gitignore"), "b.xml\n", "utf8");
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    resolvedFiles({ include: ["*.xml"] }),
    undefined,
    undefined,
    host,
  );
  assert.deepEqual(
    result.selectedFiles.map((f) => f.path),
    ["a.xml"],
  );
});

test("follow symlinks behavior", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-symlink-"));
  const host = createNodeProjectHost(dir);
  fs.mkdirSync(path.join(dir, "real"));
  fs.writeFileSync(path.join(dir, "real", "a.xml"), "<root/>", "utf8");
  fs.symlinkSync(path.join(dir, "real", "a.xml"), path.join(dir, "link.xml"));

  const noFollow = await discoverProjectFiles(
    pathToFileUri(dir),
    resolvedFiles({ include: ["**/*.xml"], followSymlinks: false }),
    undefined,
    undefined,
    host,
  );
  assert.deepEqual(
    noFollow.selectedFiles.map((f) => f.path),
    ["real/a.xml"],
  );

  const follow = await discoverProjectFiles(
    pathToFileUri(dir),
    resolvedFiles({ include: ["**/*.xml"], followSymlinks: true }),
    undefined,
    undefined,
    host,
  );
  assert.deepEqual(
    follow.selectedFiles.map((f) => f.path).sort((a, b) => a.localeCompare(b)),
    ["link.xml", "real/a.xml"],
  );
});

test("max size behavior skips large files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-size-"));
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "small.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "large.xml"), "x".repeat(100), "utf8");
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    resolvedFiles({ include: ["*.xml"], maxSize: 50 }),
    undefined,
    undefined,
    host,
  );
  assert.deepEqual(
    result.selectedFiles.map((f) => f.path),
    ["small.xml"],
  );
  assert.deepEqual(
    result.skippedFiles.map((f) => f.path),
    ["large.xml"],
  );
});

test("model file discovery finds model and definition files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-models-disc-"));
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "model.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(path.join(dir, "augment.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(path.join(dir, "nodes.json"), "{}", "utf8");
  const result = await discoverModelFiles(
    pathToFileUri(dir),
    resolvedModels({
      files: ["model.xml"],
      augmentations: ["augment.xml"],
      definitions: ["nodes.json"],
    }),
    resolvedFiles(),
    host,
  );
  assert.equal(result.modelFiles.length, 1);
  assert.equal(result.augmentationFiles.length, 1);
  assert.equal(result.definitionFiles.length, 1);
  assert.equal(result.modelFiles[0].path, "model.xml");
  assert.equal(result.augmentationFiles[0].path, "augment.xml");
  assert.equal(result.definitionFiles[0].path, "nodes.json");
  assert.deepEqual(result.unmatchedPatterns, { models: [], augmentations: [], definitions: [] });
});

test("model file discovery reports unmatched augmentation patterns", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-models-unmatched-"));
  const host = createNodeProjectHost(dir);

  const result = await discoverModelFiles(
    pathToFileUri(dir),
    resolvedModels({ augmentations: ["missing-augment.xml"] }),
    resolvedFiles(),
    host,
  );

  assert.deepEqual(result.unmatchedPatterns, {
    models: [],
    augmentations: ["missing-augment.xml"],
    definitions: [],
  });
});

test("model file discovery ignores files.ignore for explicit models paths", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-models-ignore-"));
  const host = createNodeProjectHost(dir);
  fs.mkdirSync(path.join(dir, "models"), { recursive: true });
  fs.writeFileSync(path.join(dir, "models", "nodes.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(path.join(dir, "models", "nodes.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "models", "augment.xml"), "<TreeNodesModel/>", "utf8");

  const result = await discoverModelFiles(
    pathToFileUri(dir),
    resolvedModels({
      files: ["models/nodes.xml"],
      definitions: ["models/nodes.json"],
      augmentations: ["models/augment.xml"],
    }),
    resolvedFiles({ ignore: ["models/**"] }),
    host,
  );

  assert.deepEqual(
    result.modelFiles.map((file) => file.path),
    ["models/nodes.xml"],
  );
  assert.deepEqual(
    result.definitionFiles.map((file) => file.path),
    ["models/nodes.json"],
  );
  assert.deepEqual(
    result.augmentationFiles.map((file) => file.path),
    ["models/augment.xml"],
  );
});

test("model file discovery ignores gitignore for explicit models paths", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-models-gitignore-"));
  const host = createNodeProjectHost(dir);
  fs.mkdirSync(path.join(dir, "models"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gitignore"), "models/\n", "utf8");
  fs.writeFileSync(path.join(dir, "models", "nodes.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(path.join(dir, "models", "nodes.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "models", "augment.xml"), "<TreeNodesModel/>", "utf8");

  const result = await discoverModelFiles(
    pathToFileUri(dir),
    resolvedModels({
      files: ["models/nodes.xml"],
      definitions: ["models/nodes.json"],
      augmentations: ["models/augment.xml"],
    }),
    resolvedFiles(),
    host,
  );

  assert.deepEqual(
    result.modelFiles.map((file) => file.path),
    ["models/nodes.xml"],
  );
  assert.deepEqual(
    result.definitionFiles.map((file) => file.path),
    ["models/nodes.json"],
  );
  assert.deepEqual(
    result.augmentationFiles.map((file) => file.path),
    ["models/augment.xml"],
  );
});

test("entrypoint validation reports missing files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-entry-"));
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "exists.xml"), "<root/>", "utf8");
  const entrypoints = normalizeEntrypoints(
    resolvedResolver({ entrypoints: ["exists.xml", "missing.xml"] }),
  );
  assert.equal(entrypoints.length, 2);
  const diags = await validateEntrypoints(pathToFileUri(dir), entrypoints, "config.json", host);
  assert.equal(diags.length, 1);
  assert.ok(diags[0].message.includes("missing.xml"));
});
