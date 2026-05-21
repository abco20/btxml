import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkProject, diagnosticBaselineEntry } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";

test("T-OVERRIDE-001 override downgrades rule in legacy folder", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-override-001-"));
  fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
  fs.mkdirSync(path.join(dir, "strict"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["**/*.xml"] },
      linter: {
        rules: {
          "model/no-unknown-node": "error",
        },
      },
      overrides: [
        {
          files: ["legacy/**/*.xml"],
          linter: {
            rules: {
              "model/no-unknown-node": "warn",
            },
          },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "legacy", "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "strict", "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  const legacyDiagnostics =
    result.files.find((f) => f.path === "legacy/tree.xml")?.diagnostics || [];
  const strictDiagnostics =
    result.files.find((f) => f.path === "strict/tree.xml")?.diagnostics || [];
  assert.ok(
    legacyDiagnostics.some((d) => d.code === "BT105_UNKNOWN_NODE" && d.severity === "warning"),
  );
  assert.ok(
    strictDiagnostics.some((d) => d.code === "BT105_UNKNOWN_NODE" && d.severity === "error"),
  );
  assert.equal(result.ok, false);
});

test("T-OVERRIDE-002 runtime maxWarnings=0 turns override warning into failure", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-override-002-"));
  fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["legacy/*.xml"] },
      linter: {
        rules: {
          "model/no-unknown-node": "error",
        },
      },
      overrides: [
        {
          files: ["legacy/**/*.xml"],
          linter: {
            rules: {
              "model/no-unknown-node": "warn",
            },
          },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "legacy", "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project, maxWarnings: 0 });
  assert.equal(result.ok, false);
});

test("T-BASELINE-001 filter hides known diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-baseline-001-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["tree.xml"] } }),
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const firstResult = await checkProject({
    project: project.project,
    includeRawDiagnostics: true,
  });
  const targetDiag = firstResult.files
    .flatMap((f) => f.diagnostics)
    .find((d) => d.code === "BT005_UNKNOWN_SUBTREE");
  assert.ok(targetDiag);
  const baseline = {
    version: 1 as const,
    diagnostics: [diagnosticBaselineEntry(targetDiag)],
  };
  const result = await checkProject({ project: project.project, baseline });
  assert.equal(result.ok, true);
  assert.equal(result.summary.baselineFiltered, 1);
});

test("T-BASELINE-003 update-baseline writes current diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-baseline-003-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    "utf8",
  );
  const baselinePath = path.join(dir, "btxml-baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify({ version: 1, diagnostics: [] }), "utf8");
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["tree.xml"] });
  assert.ok(project.project);
  const result = await checkProject({
    project: project.project,
  });
  const allDiagnostics = [
    ...result.projectDiagnostics,
    ...result.files.flatMap((file) => file.diagnostics),
  ];
  const newBaseline = {
    version: 1,
    diagnostics: allDiagnostics.map((d) => diagnosticBaselineEntry(d)),
  };
  fs.writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2), "utf8");
  const written = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  assert.equal(written.version, 1);
  assert.ok(written.diagnostics.length > 0);
});

test("T-RESOLVE-001 duplicate IDs fail by default", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-resolve-001-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"/></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"/></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["a.xml", "b.xml"] });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.ok(
    result.files.some((file) =>
      file.diagnostics.some(
        (d) =>
          d.code === "BT004_DUPLICATE_BEHAVIOR_TREE_ID" ||
          d.code === "BT013_DUPLICATE_BEHAVIOR_TREE_ID_IN_WORKSPACE",
      ),
    ),
  );
  assert.equal(result.ok, false);
});

test("T-RESOLVE-002 behaviorTreeIds allow-ambiguous suppresses duplicate diagnostic", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-resolve-002-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"/></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"/></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      resolver: { behaviorTreeIds: "allow-ambiguous" },
    }),
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["a.xml", "b.xml"] });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files.some((file) =>
      file.diagnostics.some(
        (d) =>
          d.code === "BT004_DUPLICATE_BEHAVIOR_TREE_ID" ||
          d.code === "BT013_DUPLICATE_BEHAVIOR_TREE_ID_IN_WORKSPACE",
      ),
    ),
    false,
  );
});

test("T-RESOLVE-003 local BehaviorTree is preferred", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-resolve-003-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"><AlwaysSuccess/></BehaviorTree><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"><AlwaysFailure/></BehaviorTree></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["*.xml"] },
      resolver: {
        behaviorTreeIds: "allow-ambiguous",
      },
    }),
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["a.xml", "b.xml"] });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files.some((file) => file.diagnostics.some((d) => d.code === "BT011_AMBIGUOUS_SUBTREE")),
    false,
  );
});

test("T-INCLUDE-001: outside workspace include is blocked", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-001-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["main.xml"] }, resolver: { entrypoints: ["main.xml"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="../../outside.xml"/><BehaviorTree ID="main"/></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["main.xml"] });
  assert.ok(project.project);
  const result = await checkProject({
    project: project.project,
    mode: "check",
  });
  assert.ok(result.files[0].diagnostics.some((d) => d.code === "BT306_INCLUDE_OUTSIDE_WORKSPACE"));
  assert.equal(result.ok, false);
});

test("T-INCLUDE-003: max include depth is enforced", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-003-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["a.xml"] },
      resolver: { entrypoints: ["a.xml"], includes: { maxDepth: 3 } },
    }),
    "utf8",
  );
  for (const [from, to] of [
    ["a.xml", "b.xml"],
    ["b.xml", "c.xml"],
    ["c.xml", "d.xml"],
    ["d.xml", "e.xml"],
  ]) {
    fs.writeFileSync(
      path.join(dir, from),
      `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="${to}"/><BehaviorTree ID="main"/></root>`,
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(dir, "e.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"/></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["a.xml"] });
  assert.ok(project.project);
  const result = await checkProject({
    project: project.project,
    mode: "check",
  });
  assert.ok(
    result.files.some((file) =>
      file.diagnostics.some((d) => d.code === "BT309_INCLUDE_DEPTH_EXCEEDED"),
    ),
  );
  assert.equal(result.ok, false);
});

test("T-INCLUDE-004: max resolved files is enforced", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-004-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["a.xml"] },
      resolver: { entrypoints: ["a.xml"], includes: { maxFiles: 2 } },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="b.xml"/><BehaviorTree ID="main"/></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="c.xml"/><BehaviorTree ID="main"/></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "c.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"/></root>`,
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir, cliFiles: ["a.xml"] });
  assert.ok(project.project);
  const result = await checkProject({
    project: project.project,
    mode: "check",
  });
  assert.ok(
    result.files.some((file) =>
      file.diagnostics.some((d) => d.code === "BT310_TOO_MANY_RESOLVED_FILES"),
    ),
  );
  assert.equal(result.ok, false);
});
