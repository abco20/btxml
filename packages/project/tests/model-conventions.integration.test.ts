import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkProject } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";

function allDiagnostics(result: Awaited<ReturnType<typeof checkProject>>) {
  return [...result.projectDiagnostics, ...result.files.flatMap((file) => file.diagnostics)];
}

test("reports BT120 when same model ID uses different kinds", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-bt120-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "allow-unused" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((diagnostic) => diagnostic.code === "BT120_CONFLICTING_MODEL_KIND"),
    true,
  );
});

test("used-only reports unused inline normal models and ignores SubTree", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-used-only-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><UsedAction/></BehaviorTree><TreeNodesModel><Action ID="UsedAction"/><Action ID="UnusedAction"/><SubTree ID="ReusableSubTree"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const diagnostics = allDiagnostics(result).filter(
    (diagnostic) => diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION",
  );

  assert.equal(diagnostics.length, 1);
  assert.equal((diagnostics[0]?.data as { nodeId?: string })?.nodeId, "UnusedAction");
});

test("used-only requires usage in the same file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-used-same-file-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "models.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="SharedAction"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "use.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Use"><SharedAction/></BehaviorTree></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some(
      (diagnostic) => diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION",
    ),
    true,
  );
});

test("used-only does not count top-level include element as node usage", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-used-only-include-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="subtree.xml"/><BehaviorTree ID="Main"><Used/></BehaviorTree><TreeNodesModel><Action ID="include"/><Action ID="Used"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  const unused = allDiagnostics(result).filter(
    (diagnostic) => diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION",
  );
  assert.equal(unused.length, 1);
  assert.equal((unused[0]?.data as { nodeId?: string })?.nodeId, "include");
});

test("used-only does not count arbitrary top-level element as node usage", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-top-level-arbitrary-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><custom_node/><BehaviorTree ID="Main"><Used/></BehaviorTree><TreeNodesModel><Action ID="custom_node"/><Action ID="Used"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  const unused = allDiagnostics(result).filter(
    (diagnostic) => diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION",
  );
  assert.equal(unused.length, 1);
  assert.equal((unused[0]?.data as { nodeId?: string })?.nodeId, "custom_node");
});

test("used-only does not treat TreeNodesModel definition tags as usage", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-used-only-model-tag-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Action"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  const unused = allDiagnostics(result).filter(
    (diagnostic) => diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION",
  );
  assert.equal(unused.length, 1);
  assert.equal((unused[0]?.data as { nodeId?: string })?.nodeId, "Action");
});

test("used-only accepts usage in another BehaviorTree within the same file", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-same-file-two-trees-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><BehaviorTree ID="B"><SharedAction/></BehaviorTree><TreeNodesModel><Action ID="SharedAction"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT121_UNUSED_MODEL_DEFINITION"),
    false,
  );
});

test("used-only ignores external, node-definition-file, and config-inline sources", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-used-only-source-scope-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: {
        convention: "used-only",
        files: ["models.xml"],
        definitions: ["nodes.json"],
        inline: {
          InlineCfgAction: { kind: "Action", ports: {} },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="UnusedInlineTreeModel"/><SubTree ID="UnusedSubTree"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "models.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="UnusedExternalModel"/></TreeNodesModel>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({
      nodes: {
        UnusedNodeDefinitionFile: { kind: "Action", ports: {} },
      },
    }),
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const unused = allDiagnostics(result).filter(
    (diagnostic) => diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION",
  );

  assert.deepEqual(
    unused
      .map((entry) => (entry.data as { nodeId?: string })?.nodeId)
      .filter((entry): entry is string => typeof entry === "string")
      .sort((a, b) => a.localeCompare(b)),
    ["UnusedInlineTreeModel"],
  );
});

test("used-only reports BT123 for missing local builtin Sequence definition", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-missing-builtin-sequence-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const missing = allDiagnostics(result).find(
    (entry) => entry.code === "BT123_MISSING_LOCAL_MODEL_DEFINITION",
  );

  assert.ok(missing);
  assert.equal((missing?.data as { nodeId?: string })?.nodeId, "Sequence");
});

test("used-only reports BT123 for missing local builtin decorator definition", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-missing-builtin-decorator-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><ForceSuccess><AlwaysFailure/></ForceSuccess></BehaviorTree></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const missing = allDiagnostics(result).find(
    (entry) => entry.code === "BT123_MISSING_LOCAL_MODEL_DEFINITION",
  );

  assert.ok(missing);
  assert.equal((missing?.data as { nodeId?: string })?.nodeId, "ForceSuccess");
});

test("used-only reports BT123 for missing local external Action definition", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-missing-external-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only", files: ["models.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "models.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move goal="{goal}"/></BehaviorTree></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const missing = allDiagnostics(result).find(
    (entry) => entry.code === "BT123_MISSING_LOCAL_MODEL_DEFINITION",
  );

  assert.ok(missing);
  assert.equal((missing?.data as { nodeId?: string })?.nodeId, "Move");
});

test("used-only reports BT123 for missing local node-definition-file Action", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-missing-definitions-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only", definitions: ["nodes.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({
      nodes: {
        JsonDefined: {
          kind: "Action",
          ports: {
            goal: { direction: "input", type: "Pose2D" },
          },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><JsonDefined goal="{goal}"/></BehaviorTree></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const missing = allDiagnostics(result).find(
    (entry) => entry.code === "BT123_MISSING_LOCAL_MODEL_DEFINITION",
  );

  assert.ok(missing);
  assert.equal((missing?.data as { nodeId?: string })?.nodeId, "JsonDefined");
});

test("used-only reports BT123 for missing local config-inline Action", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-missing-config-inline-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: {
        convention: "used-only",
        inline: {
          ConfigMove: {
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
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><ConfigMove goal="{goal}"/></BehaviorTree></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const missing = allDiagnostics(result).find(
    (entry) => entry.code === "BT123_MISSING_LOCAL_MODEL_DEFINITION",
  );

  assert.ok(missing);
  assert.equal((missing?.data as { nodeId?: string })?.nodeId, "ConfigMove");
});

test("used-only does not report BT123 for SubTree usage", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-used-only-no-subtree-bt123-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="ChildTree"/></BehaviorTree><BehaviorTree ID="ChildTree"/></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT123_MISSING_LOCAL_MODEL_DEFINITION"),
    false,
  );
});

test("single-source reports duplicate user definitions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-single-source-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some(
      (diagnostic) => diagnostic.code === "BT122_DUPLICATE_MODEL_DEFINITION",
    ),
    true,
  );
});

test("single-source allows one user-defined builtin override but rejects multiple", async () => {
  const oneOverrideDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-override-one-"));
  fs.writeFileSync(
    path.join(oneOverrideDir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(oneOverrideDir, "one.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence/></BehaviorTree><TreeNodesModel><Control ID="Sequence"/></TreeNodesModel></root>',
    "utf8",
  );

  const discoveredOne = await discoverNodeProject({ cwd: oneOverrideDir });
  assert.ok(discoveredOne.project);
  const oneResult = await checkProject({ project: discoveredOne.project });
  assert.equal(
    allDiagnostics(oneResult).some(
      (diagnostic) => diagnostic.code === "BT122_DUPLICATE_MODEL_DEFINITION",
    ),
    false,
  );

  const twoOverrideDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-override-two-"));
  fs.writeFileSync(
    path.join(twoOverrideDir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(twoOverrideDir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Control ID="Sequence"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(twoOverrideDir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Control ID="Sequence"/></TreeNodesModel></root>',
    "utf8",
  );

  const discoveredTwo = await discoverNodeProject({ cwd: twoOverrideDir });
  assert.ok(discoveredTwo.project);
  const twoResult = await checkProject({ project: discoveredTwo.project });
  assert.equal(
    allDiagnostics(twoResult).some(
      (diagnostic) => diagnostic.code === "BT122_DUPLICATE_MODEL_DEFINITION",
    ),
    true,
  );
});

test("single-source prefers BT120 for kind conflict and does not emit BT122", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-kind-vs-duplicate-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const diagnostics = allDiagnostics(result);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "BT120_CONFLICTING_MODEL_KIND"),
    true,
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "BT122_DUPLICATE_MODEL_DEFINITION"),
    false,
  );
});

test("allow-unused reports BT120 for same ID with different kinds", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-convention-allow-unused-kind-conflict-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "allow-unused" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT120_CONFLICTING_MODEL_KIND"),
    true,
  );
});

test("used-only reports BT120 for same ID with different kinds", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-used-only-kind-conflict-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT120_CONFLICTING_MODEL_KIND"),
    true,
  );
});

test("builtin and user-defined same ID with different kinds do not emit BT120", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-builtin-vs-user-kind-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "allow-unused" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Sequence"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT120_CONFLICTING_MODEL_KIND"),
    false,
  );
});

test("model convention diagnostics follow linter rule severity overrides", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-severity-override-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
      linter: {
        rules: {
          "model/no-unused-definition": "warn",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Unused"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });
  const diagnostic = allDiagnostics(result).find(
    (entry) => entry.code === "BT121_UNUSED_MODEL_DEFINITION",
  );

  assert.ok(diagnostic);
  assert.equal(diagnostic?.severity, "warning");
});

test("model convention diagnostics can be disabled via linter rule override", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-disable-override-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
      linter: {
        rules: {
          "model/no-unused-definition": "off",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Unused"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT121_UNUSED_MODEL_DEFINITION"),
    false,
  );
});

test("BT120 convention diagnostic follows linter rule warn/off overrides", async () => {
  const warnDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-bt120-warn-"));
  fs.writeFileSync(
    path.join(warnDir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "allow-unused" },
      linter: {
        rules: {
          "model/no-conflicting-kind-for-id": "warn",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(warnDir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discoveredWarn = await discoverNodeProject({ cwd: warnDir });
  assert.ok(discoveredWarn.project);
  const warnResult = await checkProject({ project: discoveredWarn.project });
  const warnDiagnostic = allDiagnostics(warnResult).find(
    (entry) => entry.code === "BT120_CONFLICTING_MODEL_KIND",
  );

  assert.ok(warnDiagnostic);
  assert.equal(warnDiagnostic?.severity, "warning");

  const offDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-bt120-off-"));
  fs.writeFileSync(
    path.join(offDir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "allow-unused" },
      linter: {
        rules: {
          "model/no-conflicting-kind-for-id": "off",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(offDir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discoveredOff = await discoverNodeProject({ cwd: offDir });
  assert.ok(discoveredOff.project);
  const offResult = await checkProject({ project: discoveredOff.project });

  assert.equal(
    allDiagnostics(offResult).some((entry) => entry.code === "BT120_CONFLICTING_MODEL_KIND"),
    false,
  );
});

test("BT122 convention diagnostic follows linter rule warn/off overrides", async () => {
  const warnDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-bt122-warn-"));
  fs.writeFileSync(
    path.join(warnDir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
      linter: {
        rules: {
          "model/no-duplicate-definition": "warn",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(warnDir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(warnDir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );

  const discoveredWarn = await discoverNodeProject({ cwd: warnDir });
  assert.ok(discoveredWarn.project);
  const warnResult = await checkProject({ project: discoveredWarn.project });
  const warnDiagnostic = allDiagnostics(warnResult).find(
    (entry) => entry.code === "BT122_DUPLICATE_MODEL_DEFINITION",
  );

  assert.ok(warnDiagnostic);
  assert.equal(warnDiagnostic?.severity, "warning");

  const offDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-bt122-off-"));
  fs.writeFileSync(
    path.join(offDir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
      linter: {
        rules: {
          "model/no-duplicate-definition": "off",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(offDir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(offDir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );

  const discoveredOff = await discoverNodeProject({ cwd: offDir });
  assert.ok(discoveredOff.project);
  const offResult = await checkProject({ project: discoveredOff.project });

  assert.equal(
    allDiagnostics(offResult).some((entry) => entry.code === "BT122_DUPLICATE_MODEL_DEFINITION"),
    false,
  );
});

test("linter.enabled false disables BT120 convention diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-disable-bt120-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "allow-unused" },
      linter: { enabled: false },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT120_CONFLICTING_MODEL_KIND"),
    false,
  );
});

test("linter.enabled false disables BT121 convention diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-disable-bt121-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "used-only" },
      linter: { enabled: false },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Unused"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT121_UNUSED_MODEL_DEFINITION"),
    false,
  );
});

test("linter.enabled false disables BT122 convention diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-convention-disable-bt122-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      models: { convention: "single-source" },
      linter: { enabled: false },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );

  const discovered = await discoverNodeProject({ cwd: dir });
  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  assert.equal(
    allDiagnostics(result).some((entry) => entry.code === "BT122_DUPLICATE_MODEL_DEFINITION"),
    false,
  );
});
