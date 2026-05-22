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
  assert.doesNotMatch(text, new RegExp(String.raw`${String.fromCodePoint(0x1b)}\[`));
});

test("CLI NO_COLOR=1 output contains no ANSI escapes", () => {
  const originalNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    const text = renderHumanDiagnostics({
      diagnostics: [{ code: "A", message: "m", severity: "error", uri: "" }],
      stream: { isTTY: true } as NodeJS.WriteStream,
    });
    assert.doesNotMatch(text, new RegExp(String.raw`${String.fromCodePoint(0x1b)}\[`));
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
    assert.match(text, new RegExp(String.raw`${String.fromCodePoint(0x1b)}\[`));
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

test("CLI lint --fix removes whole self-closing unused model element and keeps XML valid", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-self-closing-whole-element-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="Main"><Used/></BehaviorTree><TreeNodesModel><Action ID="Used"/><Action ID="Unused"/></TreeNodesModel></root>\n',
    "utf8",
  );

  const fixResult = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(fixResult.status, 0, fixResult.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(!content.includes('ID="Unused"'));
  assert.ok(!content.includes("<Action/>"));
  assert.ok(!content.includes("<Action />"));
  assert.ok(content.includes('ID="Used"'));

  const relint = run(["lint", "--json", "tree.xml"], dir);
  assert.equal(relint.status, 0, relint.stderr);
  const relintJson = JSON.parse(relint.stdout);
  const codes = new Set(
    relintJson.files.flatMap((entry: { diagnostics: Array<{ code: string }> }) =>
      entry.diagnostics.map((diagnostic) => diagnostic.code),
    ),
  );
  assert.equal(codes.has("BT006_DUPLICATE_NODE_MODEL_ID"), false);
  assert.equal(codes.has("BT003_MISSING_MODEL_ID"), false);
  assert.equal(
    Array.from(codes).some((code) => String(code).startsWith("BT1_PARSE")),
    false,
  );
});

test("CLI lint --fix removes whole block unused model element", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-block-whole-element-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main"><Used/></BehaviorTree>
  <TreeNodesModel>
    <Action ID="Used"/>
    <Action ID="Unused">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>
`,
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(!content.includes('ID="Unused"'));
  assert.ok(!content.includes('<input_port name="goal" type="Pose2D"/>'));
  assert.ok(content.includes('ID="Used"'));
});

test("CLI lint --fix inserts missing builtin Sequence local definition", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-used-only-add-sequence-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <AlwaysSuccess/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
  </TreeNodesModel>
</root>
`,
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('<Control ID="Sequence"/>'));
});

test("CLI lint --fix inserts missing builtin decorator local definition", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-used-only-add-decorator-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <ForceSuccess>
      <AlwaysFailure/>
    </ForceSuccess>
  </BehaviorTree>
  <TreeNodesModel>
  </TreeNodesModel>
</root>
`,
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('<Decorator ID="ForceSuccess"/>'));
});

test("CLI lint --fix serializes missing external Action definition with ports", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-add-external-action-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: {
        convention: "used-only",
        files: ["models.xml"],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "models.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<TreeNodesModel>
  <Action ID="Move">
    <input_port name="goal" type="Pose2D"/>
  </Action>
</TreeNodesModel>
`,
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move goal="{goal}"/></BehaviorTree><TreeNodesModel></TreeNodesModel></root>',
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('<Action ID="Move">'));
  assert.ok(content.includes('<input_port name="goal" type="Pose2D"/>'));
});

test("CLI lint --fix serializes missing node-definition-file model into XML", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-add-definition-file-action-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: {
        convention: "used-only",
        definitions: ["nodes.json"],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({
      nodes: {
        JsonMove: {
          kind: "Action",
          ports: {
            goal: { direction: "input", type: "Pose2D" },
          },
        },
      },
    }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><JsonMove goal="{goal}"/></BehaviorTree><TreeNodesModel></TreeNodesModel></root>',
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('<Action ID="JsonMove">'));
  assert.ok(content.includes('<input_port name="goal" type="Pose2D"/>'));
});

test("CLI lint --fix serializes missing config-inline model into XML", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-add-config-inline-action-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
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
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><ConfigMove goal="{goal}"/></BehaviorTree><TreeNodesModel></TreeNodesModel></root>',
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('<Action ID="ConfigMove">'));
  assert.ok(content.includes('<input_port name="goal" type="Pose2D"/>'));
});

test("CLI lint --fix creates TreeNodesModel when missing", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-create-tree-nodes-model-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree></root>',
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes("<TreeNodesModel>"));
  assert.ok(content.includes('<Control ID="Sequence"/>'));
});

test("CLI lint --fix does not add local definition for unknown node", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-no-fix-unknown-node-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><UnknownMove/></BehaviorTree></root>',
    "utf8",
  );

  const before = fs.readFileSync(file, "utf8");
  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const after = fs.readFileSync(file, "utf8");
  assert.equal(after, before);
});

test("CLI lint --fix does not add local definition when model conflicts on shape", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-no-fix-conflicting-shape-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: {
        convention: "used-only",
        files: ["a.xml", "b.xml"],
      },
    }),
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
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move goal="{goal}"/></BehaviorTree><TreeNodesModel></TreeNodesModel></root>',
    "utf8",
  );

  const before = fs.readFileSync(file, "utf8");
  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const after = fs.readFileSync(file, "utf8");
  assert.equal(after, before);
});

test("CLI lint --fix does not add local definition when same ID has different kind conflict", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-used-only-no-fix-kind-conflict-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: {
        convention: "used-only",
        files: ["models.xml"],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "models.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"/></TreeNodesModel>',
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel><Condition ID="Move"/></TreeNodesModel></root>',
    "utf8",
  );

  const before = fs.readFileSync(file, "utf8");
  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const after = fs.readFileSync(file, "utf8");
  assert.equal(after, before);
});

test("CLI lint --fix keeps SubTree model untouched and does not require it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-used-only-subtree-excluded-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="UnusedSubTreeContract"/>
  </TreeNodesModel>
</root>
`,
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);
  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.includes('<SubTree ID="UnusedSubTreeContract"/>'));
  assert.equal((content.match(/<SubTree ID="Child"\/>/g) ?? []).length, 1);
});

test("CLI used-only fix result passes re-lint", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-used-only-relint-pass-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { convention: "used-only" } }),
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Used/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Used"/>
    <Action ID="Unused"/>
  </TreeNodesModel>
</root>
`,
    "utf8",
  );

  const fix = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(fix.status, 0, fix.stderr);

  const relint = run(["lint", "--json", "tree.xml"], dir);
  assert.equal(relint.status, 0, relint.stderr);
  const report = JSON.parse(relint.stdout);
  const codes = new Set(
    report.files.flatMap((entry: { diagnostics: Array<{ code: string }> }) =>
      entry.diagnostics.map((diagnostic) => diagnostic.code),
    ),
  );
  assert.equal(codes.has("BT121_UNUSED_MODEL_DEFINITION"), false);
  assert.equal(codes.has("BT123_MISSING_LOCAL_MODEL_DEFINITION"), false);
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

test("CLI lint --fix removes whole non-canonical block definition for single-source", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-single-source-block-"));
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
    `<?xml version="1.0" encoding="UTF-8"?>
<TreeNodesModel>
  <Action ID="Move">
    <input_port name="goal"/>
  </Action>
</TreeNodesModel>
`,
    "utf8",
  );
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main"><Move goal="x"/></BehaviorTree>
  <TreeNodesModel>
    <Action ID="Move">
      <input_port name="goal"/>
    </Action>
  </TreeNodesModel>
</root>
`,
    "utf8",
  );

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 0, result.stderr);

  const content = fs.readFileSync(file, "utf8");
  assert.ok(!content.includes('ID="Move"'));
  assert.ok(!content.includes('<input_port name="goal"/>'));
});

test("CLI lint --fix does not auto-fix when canonical model files are multiple", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "btxml-lint-fix-single-source-multi-canonical-"),
  );
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: {
        convention: "single-source",
        files: ["models/a.xml", "models/b.xml"],
      },
    }),
    "utf8",
  );
  writeFile(
    dir,
    "models/a.xml",
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"/></TreeNodesModel>',
  );
  writeFile(
    dir,
    "models/b.xml",
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"/></TreeNodesModel>',
  );
  const file = writeFile(
    dir,
    "tree.xml",
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
  );
  const before = fs.readFileSync(file, "utf8");

  const result = run(["lint", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);

  const after = fs.readFileSync(file, "utf8");
  assert.equal(after, before);
});

test("CLI lint --fix does not auto-fix single-source duplicates without canonical models.files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lint-fix-single-source-no-canonical-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: { convention: "single-source" },
    }),
    "utf8",
  );
  const fileA = writeFile(
    dir,
    "a.xml",
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
  );
  const fileB = writeFile(
    dir,
    "b.xml",
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
  );
  const beforeA = fs.readFileSync(fileA, "utf8");
  const beforeB = fs.readFileSync(fileB, "utf8");

  const result = run(["lint", "--fix", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);

  assert.equal(fs.readFileSync(fileA, "utf8"), beforeA);
  assert.equal(fs.readFileSync(fileB, "utf8"), beforeB);
});

test("CLI check --fix exits 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-check-fix-"));
  const result = run(["check", "--fix", "tree.xml"], dir);
  assert.equal(result.status, 2, result.stderr);
  const stripped = result.stderr.replace(
    new RegExp(String.raw`${String.fromCodePoint(0x1b)}\[[0-9;]*m`, "g"),
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
    "match-canonical-model-file",
    "keep-canonical-model-file-definition",
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

test("CLI repair --source model-files --mode sync emits canonical sync action", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-source-sync-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { files: ["models.xml"] } }),
    "utf8",
  );
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main"><Move/></BehaviorTree>
  <TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel>
</root>`,
  );
  writeFile(
    dir,
    "models.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>`,
  );

  const result = run(
    ["repair", "--json", "--source", "model-files", "--mode", "sync", "tree.xml"],
    dir,
  );
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(
    parsed.groups.some((group: { actions: Array<{ kind: string }> }) =>
      group.actions.some((action) => action.kind === "match-canonical-model-file"),
    ),
  );
});

test("CLI repair --source model-files --mode auto uses dedupe under single-source", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-source-auto-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: { convention: "single-source", files: ["models.xml"] },
    }),
    "utf8",
  );
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main"><Move/></BehaviorTree>
  <TreeNodesModel><Action ID="Move"/></TreeNodesModel>
</root>`,
  );
  writeFile(
    dir,
    "models.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<TreeNodesModel><Action ID="Move"/></TreeNodesModel>`,
  );

  const result = run(
    ["repair", "--json", "--source", "model-files", "--mode", "auto", "tree.xml"],
    dir,
  );
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(
    parsed.groups.some((group: { actions: Array<{ kind: string }> }) =>
      group.actions.some((action) => action.kind === "keep-canonical-model-file-definition"),
    ),
  );
});

test("CLI repair --source model-files --mode sync does not emit group for equivalent duplicate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-repair-source-sync-equivalent-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      models: { convention: "allow-unused", files: ["models.xml"] },
    }),
    "utf8",
  );
  writeFile(
    dir,
    "tree.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main"><Move/></BehaviorTree>
  <TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>
</root>`,
  );
  writeFile(
    dir,
    "models.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>`,
  );

  const result = run(
    ["repair", "--json", "--source", "model-files", "--mode", "sync", "tree.xml"],
    dir,
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.groups.length, 0);
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
