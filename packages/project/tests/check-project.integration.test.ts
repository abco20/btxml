import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RuleCodes } from "@btxml/analyzer/rules";
import { DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import { checkProject, loadProjectSemanticIndex } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";
import { getNodeModel, getNodeModelDefinitions } from "@btxml/semantic";
import { loadProjectDocuments } from "../src/documents.js";
import { applyDiagnosticSuppressions } from "../src/suppressions.js";

test("v0.3 entrypoint include graph resolves included subtree", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-v03-"));
  fs.mkdirSync(path.join(dir, "behavior_trees"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      resolver: { entrypoints: ["behavior_trees/main.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "behavior_trees/main.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="common.xml"/><BehaviorTree ID="main"><SubTree ID="common"/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "behavior_trees/common.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="common"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files
      .flatMap((file) => file.diagnostics)
      .some((diag) => diag.code === "BT005_UNKNOWN_SUBTREE"),
    false,
  );
});

test("v0.3 JSON node definition supplies custom node", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-v03-nodes-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { definitions: ["nodes.json"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({
      nodes: {
        SetFlag: {
          kind: "Action",
          ports: { enabled: { direction: "input", type: "bool", required: true } },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SetFlag enabled="true"/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["tree.xml"] });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files[0].diagnostics.some((diag) => diag.code === "BT105_UNKNOWN_NODE"),
    false,
  );
});

test("entrypoint mode isolates cross-file subtree resolution", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-file-mode-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ resolver: { entrypoints: ["main.xml"] }, files: { include: ["*.xml"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "child.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  const mainDiagnostics = result.files.find((file) => file.path === "main.xml")?.diagnostics || [];
  assert.equal(
    mainDiagnostics.some((diag) => diag.code === "BT005_UNKNOWN_SUBTREE"),
    true,
  );
  assert.equal(
    result.files.some((file) =>
      file.diagnostics.some(
        (diag) => diag.code === "BT013_DUPLICATE_BEHAVIOR_TREE_ID_IN_WORKSPACE",
      ),
    ),
    false,
  );
});

test("dump-model metadata keeps node-definition source kind", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-source-meta-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["tree.xml"] }, models: { definitions: ["nodes.json"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({ nodes: { CustomAction: { kind: "Action", ports: {} } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><CustomAction/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["tree.xml"] });
  assert.ok(project.project);
  const index = await checkProject({ project: project.project });
  assert.equal(
    index.projectDiagnostics.some((diag) => diag.code === "BT105_UNKNOWN_NODE"),
    false,
  );
});

test("higher precedence config model overrides lower precedence without conflict", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-precedence-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: {
        files: ["model.xml"],
        inline: {
          Move: {
            kind: "Action",
            ports: {
              goal: { direction: "input", type: "Pose2D" },
            },
          },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal=""/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.ok(
    !result.projectDiagnostics.some((diag) => diag.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("same precedence conflict across external files reports BT012", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-same-prec-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { files: ["a.xml", "b.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal=""/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.ok(
    result.files.some((file) =>
      file.diagnostics.some((diag) => diag.code === "BT012_CONFLICTING_NODE_MODEL"),
    ),
  );
});

test("external model root TreeNodesModel passes and stays model-only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-external-root-"));
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
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SetFlag enabled="true"/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool"/></Action></TreeNodesModel>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files
      .flatMap((file) => file.diagnostics)
      .some((diag) => diag.code === "BT322_MISSING_TREENODESMODEL"),
    false,
  );
});

test("external model with BehaviorTree content still uses external model precedence", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-external-rerooted-precedence-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: {
        files: ["model.xml"],
        inline: {
          Move: {
            kind: "Action",
            ports: {
              goal: { direction: "input", type: "Pose2D" },
            },
          },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal=""/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="unused"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const semantic = await loadProjectSemanticIndex({ project: discovered.project });
  const move = getNodeModel(semantic.semanticIndex, "Move");
  const sources = getNodeModelDefinitions(semantic.semanticIndex, "Move");

  assert.equal(move?.ports[0]?.type, "Pose2D");
  assert.deepEqual(
    sources.flatMap((source) => (source.sourceMeta ? [source.sourceMeta.sourceKind] : [])).sort(),
    ["config", "external-tree-nodes-model"],
  );

  const result = await checkProject({ project: discovered.project });
  assert.ok(
    !result.projectDiagnostics.some((diag) => diag.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("wrapped external model file-level suppressions remain visible after rerooting", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-external-rerooted-suppression-"));
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
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><!-- btxml-disable-file BT006_DUPLICATE_NODE_MODEL_ID reason: test --><BehaviorTree ID="unused"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/><Action ID="Move"/></TreeNodesModel></root>`,
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const loaded = await loadProjectDocuments(discovered.project);
  const modelDocument = loaded.externalModelDocuments.find(
    (document) => document.path === "model.xml",
  );

  assert.ok(modelDocument);

  const duplicateModelDiagnostic = createDiagnostic(
    RuleCodes.DuplicateNodeModelId,
    DiagnosticSeverity.Error,
    "duplicate node model ID",
    modelDocument?.root?.range,
    modelDocument?.uri,
  );
  const suppressed = applyDiagnosticSuppressions([duplicateModelDiagnostic], {
    documents: modelDocument ? [modelDocument] : [],
    requireReason: true,
    allowInline: true,
  });

  assert.equal(suppressed.diagnostics.length, 0);
  assert.equal(suppressed.suppressedDiagnostics.length, 1);
  assert.equal(
    suppressed.issues.some((issue) => issue.kind === "unused"),
    false,
  );
});

test("external model without TreeNodesModel fails", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-external-missing-model-"));
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
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="x"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.projectDiagnostics.some((diag) => diag.code === "BT322_MISSING_TREENODESMODEL"),
    true,
  );
});

test("malformed external model fails", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-external-malformed-"));
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
    `<?xml version="1.0" encoding="UTF-8"?><root><TreeNodesModel><Action ID="X">`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.projectDiagnostics.some((diag) => diag.code === "BT323_EXTERNAL_MODEL_XML_PARSE_ERROR"),
    true,
  );
});

test("loadProjectSemanticIndex exposes read-only include graph view", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-graph-view-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ resolver: { entrypoints: ["main.xml"] }, files: { include: ["*.xml"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="child.xml"/><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "child.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);

  const semantic = await loadProjectSemanticIndex({
    project: discovered.project,
    resolveGraph: true,
  });

  assert.ok(semantic.includeGraph);
  assert.ok(semantic.includeGraph?.nodes.some((node) => node.path === "main.xml"));
  assert.ok(semantic.includeGraph?.nodes.some((node) => node.path === "child.xml"));
  assert.ok(
    semantic.includeGraph?.edges.some(
      (edge) => edge.from === "main.xml" && edge.to === "child.xml",
    ),
  );
});
