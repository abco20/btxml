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
