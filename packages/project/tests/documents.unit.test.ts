import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverNodeProject } from "@btxml/project/node";
import { loadProjectDocuments } from "../src/documents.js";
import { getProjectModelFiles, getProjectSelectedFiles } from "../src/project-handle.js";

test("loadProjectDocuments preserves ProjectFile uri and path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-documents-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { files: ["model.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="CustomAction"/></TreeNodesModel>`,
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const loaded = await loadProjectDocuments(discovered.project);
  const projectFile = getProjectSelectedFiles(discovered.project)[0];
  const modelFile = getProjectModelFiles(discovered.project)[0];

  assert.ok(projectFile);
  assert.ok(modelFile);
  assert.equal(loaded.documents[0]?.uri, projectFile.uri);
  assert.equal(loaded.documents[0]?.path, projectFile.path);
  assert.equal(loaded.externalModelDocuments[0]?.uri, modelFile.uri);
  assert.equal(loaded.externalModelDocuments[0]?.path, modelFile.path);
});

test("loadProjectDocuments tags rerooted external model files as model documents", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-documents-rerooted-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { files: ["model.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="sidecar"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="CustomAction"/></TreeNodesModel></root>`,
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const loaded = await loadProjectDocuments(discovered.project);
  const externalModelDocument = loaded.externalModelDocuments[0];

  assert.ok(externalModelDocument);
  assert.equal(externalModelDocument?.kind, "model-document");
  assert.equal(externalModelDocument?.root?.name, "TreeNodesModel");
});

test("loadProjectDocuments preserves wrapper comments around rerooted external model files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-documents-rerooted-comments-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { files: ["model.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><!-- btxml-disable-file BT006_DUPLICATE_NODE_MODEL_ID reason: test --><BehaviorTree ID="sidecar"><AlwaysSuccess/></BehaviorTree><!-- keep me --><TreeNodesModel><Action ID="CustomAction"/></TreeNodesModel><!-- keep me too --></root><!-- trailing btxml-disable-file BT006_DUPLICATE_NODE_MODEL_ID reason: after root -->`,
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const loaded = await loadProjectDocuments(discovered.project);
  const externalModelDocument = loaded.externalModelDocuments[0];

  assert.ok(externalModelDocument);
  assert.equal(externalModelDocument?.root?.name, "TreeNodesModel");
  assert.deepEqual(
    externalModelDocument?.nodes.map((node) =>
      node.kind === "element" ? node.name : node.text.trim(),
    ),
    [
      "btxml-disable-file BT006_DUPLICATE_NODE_MODEL_ID reason: test",
      "keep me",
      "TreeNodesModel",
      "keep me too",
      "trailing btxml-disable-file BT006_DUPLICATE_NODE_MODEL_ID reason: after root",
    ],
  );
});

test("loadProjectDocuments skips XML files that are not BTXML candidates", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-documents-skip-non-bt-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["**/*.xml"] } }),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "src", "demo", "behavior_trees"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "demo", "package.xml"),
    `<package format="3"><name>demo</name><version>0.0.0</version></package>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "src", "demo", "plugin.xml"),
    `<library path="demo"><class name="DemoPlugin" type="demo::Plugin"/></library>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "src", "demo", "behavior_trees", "tree.xml"),
    `<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  assert.equal(getProjectSelectedFiles(discovered.project).length, 3);

  const loaded = await loadProjectDocuments(discovered.project);

  assert.deepEqual(
    loaded.documents.map((document) => document.path),
    ["src/demo/behavior_trees/tree.xml"],
  );
});
