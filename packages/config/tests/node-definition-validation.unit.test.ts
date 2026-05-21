import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RuleCodes } from "@btxml/analyzer/rules";
import { checkProject } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";

async function setupProject(dir: string, nodesJson: unknown) {
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { definitions: ["nodes.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "nodes.json"), JSON.stringify(nodesJson), "utf8");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  return await checkProject({ project: project.project });
}

test("node definitions: valid file loads successfully", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-node-def-valid-"));
  const result = await setupProject(dir, {
    nodes: {
      MyAction: {
        kind: "Action",
        ports: { goal: { direction: "input", type: "string" } },
      },
    },
  });
  assert.equal(result.projectDiagnostics.length, 0);
});

test("node definitions: invalid node kind is rejected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-node-def-kind-"));
  const result = await setupProject(dir, {
    nodes: {
      MyAction: {
        kind: "InvalidKind",
      },
    },
  });
  const diag = result.projectDiagnostics.find(
    (d) => d.code === RuleCodes.InvalidNodeDefinitionSchema,
  );
  assert.ok(diag, "Expected InvalidNodeDefinitionSchema diagnostic");
  assert.ok(
    diag.details?.notes?.some((n) => n.includes("nodes.MyAction.kind")),
    "Expected dot path in notes",
  );
});

test("node definitions: invalid port direction is rejected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-node-def-direction-"));
  const result = await setupProject(dir, {
    nodes: {
      MyAction: {
        kind: "Action",
        ports: { goal: { direction: "sideways" } },
      },
    },
  });
  const diag = result.projectDiagnostics.find(
    (d) => d.code === RuleCodes.InvalidNodeDefinitionSchema,
  );
  assert.ok(diag, "Expected InvalidNodeDefinitionSchema diagnostic");
  assert.ok(
    diag.details?.notes?.some((n) => n.includes("nodes.MyAction.ports.goal.direction")),
    "Expected dot path in notes",
  );
});

test("node definitions: unknown port field is rejected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-node-def-unknown-field-"));
  const result = await setupProject(dir, {
    nodes: {
      MyAction: {
        kind: "Action",
        ports: { goal: { direction: "input", unknown: true } },
      },
    },
  });
  const diag = result.projectDiagnostics.find(
    (d) => d.code === RuleCodes.InvalidNodeDefinitionSchema,
  );
  assert.ok(diag, "Expected InvalidNodeDefinitionSchema diagnostic");
  assert.ok(
    diag.details?.notes?.some((n) => n.includes("nodes.MyAction.ports.goal.unknown")),
    "Expected dot path in notes",
  );
});

test("node definitions: invalid root shape is rejected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-node-def-root-shape-"));
  const result = await setupProject(dir, []); // array instead of object
  const diag = result.projectDiagnostics.find(
    (d) => d.code === RuleCodes.InvalidNodeDefinitionSchema,
  );
  assert.ok(diag, "Expected InvalidNodeDefinitionSchema diagnostic");
  assert.ok(
    diag.details?.help && !diag.details.help.includes("at ``"),
    "Help should not contain empty backtick path",
  );
  assert.ok(
    diag.details?.notes && diag.details.notes.length === 0,
    "Notes should be empty for root-level failure",
  );
});

test("node definitions: duplicate node definition ID across files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-node-def-duplicate-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { definitions: ["a.json", "b.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.json"),
    JSON.stringify({ nodes: { MyAction: { kind: "Action" } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.json"),
    JSON.stringify({ nodes: { MyAction: { kind: "Condition" } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.ok(result.projectDiagnostics.some((d) => d.code === RuleCodes.DuplicateNodeDefinitionId));
});
