import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RuleCodes } from "@btxml/analyzer/rules";
import { checkProject, loadProjectDocuments } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";

test("malformed augmentation JSON is preserved as project diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-bad-augment-"));
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { augmentations: ["btxml.model-augment.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "btxml.model-augment.json"), '{"version": 1,', "utf8");

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const loaded = await loadProjectDocuments(discovered.project);
  assert.equal(loaded.augmentations.length, 0);
  assert.ok(
    loaded.diagnostics.some((diagnostic) => diagnostic.code === RuleCodes.InvalidAugmentationJson),
  );

  const result = await checkProject({
    project: discovered.project,
    documents: loaded.documents,
    externalModelDocuments: loaded.externalModelDocuments,
    augmentations: loaded.augmentations,
    projectDiagnostics: [...discovered.diagnostics, ...loaded.diagnostics],
  });

  assert.ok(
    result.projectDiagnostics.some(
      (diagnostic) => diagnostic.code === RuleCodes.InvalidAugmentationJson,
    ),
  );
});

test("invalid augmentation schema uses registered central diagnostic code", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-bad-augment-schema-"));
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { augmentations: ["btxml.model-augment.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.model-augment.json"),
    JSON.stringify({ version: 1, augment: { MoveTo: { ports: { target: { enum: "bad" } } } } }),
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const loaded = await loadProjectDocuments(discovered.project);
  assert.equal(loaded.augmentations.length, 0);
  assert.ok(
    loaded.diagnostics.some(
      (diagnostic) => diagnostic.code === RuleCodes.InvalidAugmentationSchema,
    ),
  );
});
