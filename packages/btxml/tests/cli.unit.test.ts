import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { printDiagnostics } from "../src/output.ts";
import { renderHumanDiagnostics } from "../src/render/human-diagnostic.ts";
import { jsonRepairReportSchema } from "../src/report/schema.ts";

function writeFile(dir: string, name: string, text: string) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return file;
}

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [path.resolve("packages/btxml/dist/cli.js"), ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("CLI doctor returns workspace summary", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-doctor-"));
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
  );
  const result = run(["doctor", "--output", "json", "tree.xml"], dir);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(typeof parsed.selectedFiles, "number");
});

test("CLI normalizes output defaults and warning flags", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-normalize-"));
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`,
  );

  const formatResult = run(["format", "tree.xml"], dir);
  assert.equal(formatResult.status, 0, formatResult.stderr);

  const lintResult = run(["lint", "--json", "tree.xml"], dir);
  assert.equal(lintResult.status, 0, lintResult.stderr);
  assert.equal(JSON.parse(lintResult.stdout).schemaVersion, "2");

  const checkResult = run(["check", "--warnings-as-errors", "tree.xml"], dir);
  assert.equal(checkResult.status, 0, checkResult.stderr);
  assert.ok(checkResult.stdout.includes("checked 1 files") || checkResult.stdout.includes("ok:"));
});

test("CLI deleted commands fail", () => {
  for (const cmd of [
    "complete",
    "hover",
    "definition",
    "symbols",
    "inspect",
    "dump-model",
    "list-files",
    "graph",
  ]) {
    const result = run([cmd], process.cwd());
    assert.notEqual(result.status, 0, `${cmd} should fail`);
    assert.match(result.stderr, /unknown command/);
  }
});

test("CLI human output renders block diagnostic with code frame", () => {
  const text = printDiagnostics(
    "behavior_trees/main.xml",
    [
      {
        code: "BT005_UNKNOWN_SUBTREE",
        message: "unknown subtree `foo`",
        severity: "error",
        range: {
          start: { line: 41, character: 15, offset: 0 },
          end: { line: 41, character: 23, offset: 0 },
        },
        uri: "behavior_trees/main.xml",
        details: {
          primaryLabel: "no `<BehaviorTree>` or subtree node model named `foo` was found",
          help: 'define `<BehaviorTree ID="foo">`, add a subtree node model, or check the spelling',
        },
      },
    ],
    "human",
    new Map([["behavior_trees/main.xml", `${"x".repeat(15)}foo${"x".repeat(10)}`]]),
  );
  assert.ok(text.includes("BT005_UNKNOWN_SUBTREE"));
  assert.ok(text.includes("behavior_trees/main.xml:42:16"));
});

test("CLI human output renders suppressed diagnostic", () => {
  const text = renderHumanDiagnostics({
    diagnostics: [
      {
        code: "BT005_UNKNOWN_SUBTREE",
        message: "unknown subtree `foo`",
        severity: "warning",
        uri: "",
        suppressed: true,
      },
    ],
    noColor: true,
  });
  assert.match(text, /\[suppressed\]/);
});

test("CLI human output renders relatedInformation as note", () => {
  const text = renderHumanDiagnostics({
    diagnostics: [
      {
        code: "BT012_CONFLICTING_NODE_MODEL",
        message: "conflicting node model `Foo`",
        severity: "error",
        uri: "a.xml",
        relatedInformation: [
          {
            uri: "b.xml",
            range: {
              start: { line: 0, character: 0, offset: 0 },
              end: { line: 0, character: 1, offset: 1 },
            },
            message: "other definition",
          },
        ],
      },
    ],
    noColor: true,
  });
  assert.match(text, /note: b\.xml:1:1: other definition/);
});

test("CLI human output separates multiple diagnostics with blank line", () => {
  const text = renderHumanDiagnostics({
    diagnostics: [
      { code: "A", message: "first", severity: "error", uri: "" },
      { code: "B", message: "second", severity: "warning", uri: "" },
    ],
    noColor: true,
  });
  assert.ok(text.includes("\n\n"));
});

test("CLI --no-color output contains no ANSI escapes", () => {
  const text = renderHumanDiagnostics({
    diagnostics: [{ code: "A", message: "m", severity: "error", uri: "" }],
    noColor: true,
  });
  assert.doesNotMatch(text, new RegExp(`${String.fromCharCode(0x1b)}\\[`));
});

test("CLI NO_COLOR=1 output contains no ANSI escapes", () => {
  const originalNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    const text = renderHumanDiagnostics({
      diagnostics: [{ code: "A", message: "m", severity: "error", uri: "" }],
      stream: { isTTY: true } as NodeJS.WriteStream,
    });
    assert.doesNotMatch(text, new RegExp(`${String.fromCharCode(0x1b)}\\[`));
  } finally {
    if (originalNoColor === undefined) {
      Reflect.deleteProperty(process.env, "NO_COLOR");
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  }
});

test("CLI TTY color mode emits ANSI escapes", () => {
  const originalNoColor = process.env.NO_COLOR;
  Reflect.deleteProperty(process.env, "NO_COLOR");
  try {
    const text = renderHumanDiagnostics({
      diagnostics: [{ code: "A", message: "m", severity: "error", uri: "" }],
      stream: { isTTY: true } as NodeJS.WriteStream,
    });
    assert.match(text, new RegExp(`${String.fromCharCode(0x1b)}\\[`));
  } finally {
    if (originalNoColor === undefined) {
      Reflect.deleteProperty(process.env, "NO_COLOR");
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  }
});

test("CLI lint --fix adds BTCPP_format=4", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-"));
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<root><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n',
    "utf8",
  );
  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);
  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('BTCPP_format="4"'));
});

test("CLI lint --fix exits 0 when fixed file has no remaining diagnostics", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-ok-"));
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<root><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n',
    "utf8",
  );
  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("fixed 1 problem"));
});

test("CLI lint --fix exits 1 when non-fixable diagnostics remain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-fail-"));
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>\n',
    "utf8",
  );
  const result = run(["lint", "--fix", "--warnings-as-errors", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes("fixed 0 problems"));
});

test("CLI lint --fix removes used-only unused inline definitions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-used-only-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="Main"><UsedAction/></BehaviorTree><TreeNodesModel><Action ID="UsedAction"/><Action ID="UnusedAction"/></TreeNodesModel></root>\n',
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("fixed"));

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('Action ID="UsedAction"'));
  assert.ok(!content.includes('Action ID="UnusedAction"'));
});

test("CLI lint --fix removes non-canonical duplicates for single-source", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-single-source-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: {
        convention: "single-source",
        files: ["models.xml"],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "models.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<TreeNodesModel><Action ID="Move"/></TreeNodesModel>\n',
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>\n',
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(!content.includes('<Action ID="Move"/>'));
});

test("CLI check --fix exits 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-check-fix-"));
  const result = run(["check", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 2, result.stderr);
  const stripped = result.stderr.replace(
    new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g"),
    "",
  );
  assert.ok(stripped.includes("`--fix` is only supported for"), stripped);
});

test("CLI repair reports ok for clean project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-clean-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n',
    "utf8",
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("ok: no model conflicts found"));
});

test("CLI repair reports BT012 for conflicting model files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-conflict-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("model repair"));
  assert.ok(result.stdout.includes("needs attention"));
  assert.ok(result.stdout.includes("pairwise signature conflict"));
  assert.ok(result.stdout.includes("collapsed into 1 group"));
  assert.ok(result.stdout.includes("signature A"));
  assert.ok(result.stdout.includes("signature B"));
  assert.ok(!result.stdout.includes("Use source 0"));
  assert.ok(!result.stdout.includes("canonical"));
  assert.ok(result.stdout.includes("run `btxmlc repair --write`"));
});

test("CLI repair --json returns schemaVersion 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-json-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "--json", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  jsonRepairReportSchema.parse(parsed);
  assert.equal(parsed.schemaVersion, "2");
  assert.ok(Array.isArray(parsed.groups));
  assert.ok(parsed.groups[0].actions.length > 0);
});

test("CLI repair --write without TTY exits 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-write-notty-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "--write", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /requires an interactive terminal/);
});

test("CLI repair reports BT006 for duplicate model ID in same file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-bt006-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("BT006_DUPLICATE_NODE_MODEL_ID"));
});

test("CLI repair reports BT008 for duplicate port name in same model", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-bt008-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="speed" type="double" default="1.0"/><input_port name="speed" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("BT008_DUPLICATE_PORT_NAME"));
});

test("CLI repair reports node definition model conflicts without BT334", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-bt334-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes1.json"),
    JSON.stringify({
      nodes: {
        MoveBase: {
          kind: "Action",
          ports: { goal: { direction: "input", type: "string" } },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes2.json"),
    JSON.stringify({
      nodes: {
        MoveBase: {
          kind: "Action",
          ports: { goal: { direction: "input", type: "Pose2D" } },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { definitions: ["nodes1.json", "nodes2.json"] } }),
    "utf8",
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(!result.stdout.includes("BT334_DUPLICATE_NODE_DEFINITION_ID"));
  assert.ok(result.stdout.includes("BT012_CONFLICTING_NODE_MODEL"));
});

test("CLI lint reports BT334 for duplicate node definition ID", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-bt334-"));
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes1.json"),
    JSON.stringify({
      nodes: {
        MoveBase: {
          kind: "Action",
          ports: { goal: { direction: "input", type: "string" } },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes2.json"),
    JSON.stringify({
      nodes: {
        MoveBase: {
          kind: "Action",
          ports: { goal: { direction: "input", type: "Pose2D" } },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { definitions: ["nodes1.json", "nodes2.json"] } }),
    "utf8",
  );
  const result = run(["lint", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes("BT334_DUPLICATE_NODE_DEFINITION_ID"));
});

test("CLI repair --show prints only requested group", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-show-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "--show", "MoveBase", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("MoveBase"));
  assert.ok(result.stdout.includes("signature A"));
});

test("CLI repair --show with unknown nodeId exits 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-show-missing-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "--show", "Missing", "a.xml"], dir);
  assert.equal(result.status, 2, result.stdout + result.stderr);
});

test("CLI repair human output has no bulk or canonical wording", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-wording-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(!result.stdout.includes("same difference pattern"), result.stdout);
  assert.ok(!result.stdout.includes("Apply this resolution to"), result.stdout);
  assert.ok(!result.stdout.includes("canonical"), result.stdout);
  assert.ok(!result.stdout.includes("recommendation"), result.stdout);
  assert.ok(!result.stdout.includes("source 0"), result.stdout);
  assert.ok(!result.stdout.includes("source 1"), result.stdout);
});

test("CLI repair --json includes group kind and action kinds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-json-kind-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "--json", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, "2");
  assert.ok(parsed.groups[0].kind);
  assert.equal(typeof parsed.summary.signatureConflictGroups, "number");
  assert.equal(typeof parsed.summary.pairwiseSignatureConflicts, "number");
  const validActionKinds = new Set([
    "match-signature",
    "keep-model-definition",
    "keep-port-definition",
    "manual",
    "skip",
  ]);
  for (const group of parsed.groups) {
    for (const action of group.actions) {
      assert.ok(validActionKinds.has(action.kind), `unexpected action kind: ${action.kind}`);
      assert.equal(typeof action.applicable, "boolean");
      if (action.kind === "manual" || action.kind === "skip") {
        assert.equal(action.applicable, false);
      }
    }
  }
});

test("CLI repair --show uses usage check label", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-usage-check-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = run(["repair", "--show", "MoveBase", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("usage check:"), result.stdout);
  assert.ok(!result.stdout.includes("impact:"), result.stdout);
  assert.ok(!result.stdout.includes("no missing-port diagnostics are introduced"), result.stdout);
});

test("CLI repair reports external model conflict", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-external-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: { files: ["a.xml", "b.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><MoveBase goal=""/></BehaviorTree></root>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="string"/></Action></TreeNodesModel>\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<TreeNodesModel><Action ID="MoveBase"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>\n',
    "utf8",
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("BT012_CONFLICTING_NODE_MODEL"), result.stdout);
});

test("CLI repair --show MoveBase.speed matches duplicate port group", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-show-port-"));
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double"/>
      <input_port name="speed" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  const result = run(["repair", "--show", "MoveBase.speed", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("BT008_DUPLICATE_PORT_NAME"), result.stdout);
});

test("CLI repair --show speed does not match duplicate port group", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-show-port-miss-"));
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double"/>
      <input_port name="speed" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  const result = run(["repair", "--show", "speed", "tree.xml"], dir);
  assert.equal(result.status, 2, result.stderr);
});

test("CLI repair --json --show outputs valid JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-json-show-"));
  writeFile(
    dir,
    "a.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  writeFile(
    dir,
    "b.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  const result = run(["repair", "--json", "--show", "MoveBase", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, "2");
  assert.equal(parsed.ok, false);
  assert.ok(Array.isArray(parsed.groups));
  assert.equal(parsed.groups.length, 1);
});

test("CLI repair shows no usage evidence when totalUsages is 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-usage-zero-"));
  writeFile(
    dir,
    "a.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  writeFile(
    dir,
    "b.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  const result = run(["repair", "--show", "MoveBase", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("no usage evidence available"), result.stdout);
  assert.ok(!result.stdout.includes("provided 0/1"), result.stdout);
});

test("CLI repair BT006 human output shows duplicate model definitions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-bt006-human-"));
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("duplicate model definitions"), result.stdout);
  assert.ok(result.stdout.includes("BT006_DUPLICATE_NODE_MODEL_ID"), result.stdout);
});

test("CLI repair BT006 identical duplicate model shows single variant", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-bt006-identical-"));
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`,
  );
  const result = run(["repair", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.includes("BT006_DUPLICATE_NODE_MODEL_ID"), result.stdout);
});
