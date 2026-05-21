import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RuleCodes } from "@btxml/analyzer/rules";
import {
  getProjectAugmentationFiles,
  getProjectEntrypoints,
  getProjectModelFiles,
  getProjectResolvedConfig,
  getProjectSelectedFiles,
} from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";

test("invalid config stops discovery early", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-bad-config-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ extends: ["btxml:does-not-exist"] }),
    "utf8",
  );
  const result = await discoverNodeProject({ cwd: dir });
  assert.equal(result.ok, false);
  assert.equal(result.project, undefined);
  assert.ok(result.diagnostics.some((d) => d.code === "CFG002_UNKNOWN_CONFIG_FIELD"));
});

test("project.resolvedConfig exists after discovery", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-resolved-"));
  fs.writeFileSync(path.join(dir, "a.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "btxml.config.json"), JSON.stringify({ strict: true }), "utf8");
  const result = await discoverNodeProject({ cwd: dir });
  assert.equal(result.ok, true);
  assert.ok(result.project);
  const project = result.project;
  if (!project) throw new Error("expected project");
  const resolvedConfig = getProjectResolvedConfig(project);
  assert.ok(resolvedConfig);
  assert.deepEqual(resolvedConfig.files.include, ["**/*.xml"]);
  assert.equal(resolvedConfig.linter.rules["model/no-unknown-node"], "error");
});

test("config file include settings affect file discovery", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-config-files-"));
  fs.writeFileSync(path.join(dir, "a.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "a.bt.xml"), "<root/>", "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["**/*.bt.xml"] } }),
    "utf8",
  );
  const result = await discoverNodeProject({ cwd: dir });
  assert.equal(result.ok, true);
  const project = result.project;
  if (!project) throw new Error("expected project");
  const paths = getProjectSelectedFiles(project)
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(paths, ["a.bt.xml"]);
});

test("config model settings affect model discovery", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-config-models-"));
  fs.writeFileSync(path.join(dir, "custom.model.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(path.join(dir, "custom.augment.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(path.join(dir, "other.model.xml"), "<TreeNodesModel/>", "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: { files: ["custom.model.xml"], augmentations: ["custom.augment.xml"] },
    }),
    "utf8",
  );
  const result = await discoverNodeProject({ cwd: dir });
  assert.equal(result.ok, true);
  const project = result.project;
  if (!project) throw new Error("expected project");
  const modelPaths = getProjectModelFiles(project)
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));
  const augmentationPaths = getProjectAugmentationFiles(project)
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(modelPaths, ["custom.model.xml"]);
  assert.deepEqual(augmentationPaths, ["custom.augment.xml"]);
});

test("missing configured augmentation file reports discovery diagnostic", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-config-augment-missing-"));
  fs.writeFileSync(path.join(dir, "tree.xml"), "<root/>", "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { augmentations: ["missing.augment.xml"] },
    }),
    "utf8",
  );

  const result = await discoverNodeProject({ cwd: dir });

  assert.equal(result.ok, true);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === RuleCodes.AugmentationFileNotFound &&
        diagnostic.message.includes("missing.augment.xml"),
    ),
  );
});

test("config resolver.entrypoints affects entrypoints", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-config-entry-"));
  fs.writeFileSync(path.join(dir, "entry.xml"), "<root/>", "utf8");
  fs.writeFileSync(path.join(dir, "other.xml"), "<root/>", "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      resolver: { entrypoints: ["entry.xml"] },
    }),
    "utf8",
  );
  const result = await discoverNodeProject({ cwd: dir });
  assert.equal(result.ok, true);
  const project = result.project;
  if (!project) throw new Error("expected project");
  assert.deepEqual(getProjectEntrypoints(project), [{ file: "entry.xml" }]);
  const selectedPaths = getProjectSelectedFiles(project)
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));
  assert.ok(selectedPaths.includes("entry.xml"));
});
