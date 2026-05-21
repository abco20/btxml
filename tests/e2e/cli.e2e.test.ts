import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { jsonCheckReportSchema } from "@abco20/btxml-checker";

const repoRoot = process.cwd();
const cli = path.resolve(repoRoot, "packages/btxml/dist/cli.js");
const fixtures = path.resolve(repoRoot, "tests/e2e/fixtures");
const snapshots = path.resolve(repoRoot, "tests/e2e/snapshots");

function runCli(args: string[], cwd = repoRoot) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function copyFixture(name: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-e2e-"));
  const from = path.join(fixtures, name);
  const to = path.join(tmp, name);
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.cpSync(from, to, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return { cwd: tmp, file: to };
}

function copyFixtureDir(name: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-e2e-dir-"));
  const from = path.join(fixtures, name);
  const to = path.join(tmp, name);
  fs.cpSync(from, to, { recursive: true });
  return { cwd: tmp, dir: to };
}

test("E2E-001 Groot format passes check", () => {
  const { cwd, file } = copyFixture("valid/groot_formatted.xml");
  const result = runCli(["format", "--check", file], cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(read(file), read(path.join(fixtures, "valid/groot_formatted.xml")));
});

test("E2E-000 built CLI must exist", () => {
  assert.equal(fs.existsSync(cli), true);
});

test("E2E-002 Red Hat format converts to Groot", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const result = runCli(["format", file], cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(read(file), read(path.join(snapshots, "redhat_to_groot.expected.xml")));
});

test("E2E-003 format check fails on unformatted file", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const result = runCli(["format", "--check", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /file is not formatted/);
  assert.equal(read(file), read(path.join(fixtures, "valid/redhat_formatted.xml")));
});

test("E2E-004 format check diff prints unified diff", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const result = runCli(["format", "--check", "--diff", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /\+/);
  assert.equal(read(file), read(path.join(fixtures, "valid/redhat_formatted.xml")));
});

test("E2E-005 malformed XML is not overwritten", () => {
  const { cwd, file } = copyFixture("invalid/malformed_xml.xml");
  const before = read(file);
  const result = runCli(["format", file], cwd);
  assert.equal(result.status, 1);
  assert.match(
    result.stdout + result.stderr,
    /XML001_INVALID_SYNTAX|XML006_MISSING_CLOSING_TAG|parse error|syntax/i,
  );
  assert.equal(read(file), before);
});

test("E2E-006 lint detects malformed XML", () => {
  const { cwd, file } = copyFixture("invalid/malformed_xml.xml");
  const result = runCli(["lint", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /XML001_INVALID_SYNTAX|XML006_MISSING_CLOSING_TAG/);
});

test("E2E-007 duplicate BehaviorTree ID is detected", () => {
  const { cwd, file } = copyFixture("invalid/duplicate_behavior_tree_id.xml");
  const result = runCli(["lint", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT004_DUPLICATE_BEHAVIOR_TREE_ID/);
});

test("E2E-008 unknown SubTree reference is detected", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const result = runCli(["lint", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT005_UNKNOWN_SUBTREE/);
});

test("E2E-009 duplicate port name is detected", () => {
  const { cwd, file } = copyFixture("invalid/duplicate_port.xml");
  const result = runCli(["lint", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT008_DUPLICATE_PORT_NAME/);
});

test("E2E-010 missing BTCPP_format is detected", () => {
  const { cwd, file } = copyFixture("invalid/missing_btcpp_format.xml");
  const result = runCli(["lint", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT002_MISSING_BTCPP_FORMAT/);
});

test("E2E-011 check reports format diff and lint error", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree_unformatted.xml");
  const result = runCli(["check", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /file is not formatted/);
  assert.match(result.stdout + result.stderr, /BT005_UNKNOWN_SUBTREE/);
});

test("E2E-012 lint json output is valid", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const result = runCli(["lint", "--output", "json", file], cwd);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  jsonCheckReportSchema.parse(parsed);
  assert.equal(Array.isArray(parsed.files), true);
  assert.ok(parsed.files[0].diagnostics.length > 0);
});

test("E2E-013 check json output matches schema", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree_unformatted.xml");
  const result = runCli(["check", "--output", "json", file], cwd);
  assert.equal(result.status, 1);
  jsonCheckReportSchema.parse(JSON.parse(result.stdout));
});

test("E2E-014 glob processes multiple files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-multi-"));
  fs.mkdirSync(path.join(dir, "fixtures", "multiple"), { recursive: true });
  fs.copyFileSync(
    path.join(fixtures, "valid/groot_formatted.xml"),
    path.join(dir, "fixtures/multiple/a.xml"),
  );
  fs.copyFileSync(
    path.join(fixtures, "invalid/unknown_subtree.xml"),
    path.join(dir, "fixtures/multiple/b.xml"),
  );
  const result = runCli(["check", "fixtures/multiple/**/*.xml"], dir);
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /b\.xml/);
  assert.match(output, /2 files/);
});

test("E2E-015 config include and exclude work", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-config-"));
  fs.mkdirSync(path.join(dir, "build"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["target.xml"], ignore: ["ignored.xml", "build/**"] } }),
    "utf8",
  );
  fs.copyFileSync(path.join(fixtures, "invalid/unknown_subtree.xml"), path.join(dir, "target.xml"));
  fs.copyFileSync(
    path.join(fixtures, "invalid/unknown_subtree.xml"),
    path.join(dir, "ignored.xml"),
  );
  fs.copyFileSync(
    path.join(fixtures, "invalid/unknown_subtree.xml"),
    path.join(dir, "build", "ignored-by-exclude.xml"),
  );
  const result = runCli(["check"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /target\.xml/);
  assert.doesNotMatch(result.stdout + result.stderr, /ignored\.xml/);
});

test("E2E-016 check validates invalid port names with augmentation-driven types", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-port-name-e2e-"));
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
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><MoveTo target="1;2;3"/></BehaviorTree><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="std::string"/><input_port name="request.name" type="string"/></Action></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.model-augment.json"),
    JSON.stringify({
      version: 1,
      types: {
        Pose2D: {
          kind: "opaque",
          validate: {
            kind: "tuple",
            separator: ";",
            items: ["double", "double", "double"],
          },
        },
      },
      augment: {
        MoveTo: {
          ports: {
            target: {
              typeRefinement: {
                from: "std::string",
                to: "Pose2D",
              },
            },
          },
        },
      },
    }),
    "utf8",
  );

  const result = runCli(["check"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT116_INVALID_PORT_NAME/);
  assert.doesNotMatch(result.stdout + result.stderr, /BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR/);
  assert.doesNotMatch(result.stdout + result.stderr, /BT103_INVALID_PORT_VALUE_TYPE/);
});

test("E2E-089 strict and file override precedence works", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-strict-override-e2e-"));
  fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      strict: true,
      files: { include: ["**/*.xml"] },
      overrides: [
        {
          files: ["legacy/**/*.xml"],
          linter: {
            rules: {
              "model/no-unknown-node": "off",
            },
          },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "root.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "legacy", "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );

  const result = runCli(["check"], dir);
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /root\.xml/);
  assert.match(output, /BT105_UNKNOWN_NODE/);
  assert.doesNotMatch(output, /legacy\/tree\.xml.*BT105_UNKNOWN_NODE/);
});

test("E2E-016 stdout does not modify file", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const before = read(file);
  const result = runCli(["format", "--stdout", file], cwd);
  assert.equal(result.status, 0);
  assert.equal(read(file), before);
  assert.match(result.stdout, /<root BTCPP_format="4">/);
});

test("E2E-052 format stdout ignores external model files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-stdout-external-"));
  fs.cpSync(path.join(fixtures, "external-model"), path.join(dir, "external-model"), {
    recursive: true,
  });
  const result = runCli(["format", "--stdout", path.join(dir, "external-model", "main.xml")], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /<root BTCPP_format="4">/);
  assert.equal(
    read(path.join(dir, "external-model", "models", "nodes.xml")),
    read(path.join(fixtures, "external-model", "models", "nodes.xml")),
  );
});

test("E2E-053 format stdout rejects multiple explicit files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-stdout-multi-"));
  fs.writeFileSync(
    path.join(dir, "a.xml"),
    read(path.join(fixtures, "valid/redhat_formatted.xml")),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    read(path.join(fixtures, "valid/redhat_formatted.xml")),
    "utf8",
  );
  const result = runCli(["format", "--stdout", "a.xml", "b.xml"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /exactly one file/);
});

test("E2E-017 format is idempotent", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const first = runCli(["format", file], cwd);
  assert.equal(first.status, 0);
  const firstContent = read(file);
  const second = runCli(["format", file], cwd);
  assert.equal(second.status, 0);
  const secondContent = read(file);
  assert.equal(firstContent, secondContent);
});

test("E2E-018 --warnings-as-errors turns warnings into failure", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-warn-"));
  fs.mkdirSync(path.join(dir, "fixtures", "warnings"), { recursive: true });
  fs.copyFileSync(
    path.join(fixtures, "warnings/btxml.config.json"),
    path.join(dir, "fixtures/warnings/btxml.config.json"),
  );
  fs.copyFileSync(
    path.join(fixtures, "warnings/unknown_port.xml"),
    path.join(dir, "fixtures/warnings/unknown_port.xml"),
  );
  const result = runCli(
    [
      "lint",
      "--config",
      "fixtures/warnings/btxml.config.json",
      "--warnings-as-errors",
      "fixtures/warnings/unknown_port.xml",
    ],
    dir,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT007_MISSING_PORT_NAME/);
});

test("E2E-050 check respects --warnings-as-errors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-warn-check-"));
  fs.cpSync(path.join(fixtures, "warnings"), path.join(dir, "warnings"), {
    recursive: true,
  });
  const result = runCli(["check", "--warnings-as-errors", "warnings/unknown_port.xml"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT007_MISSING_PORT_NAME/);
});

test("E2E-051 project-level warning respects --warnings-as-errors", () => {
  const { cwd } = copyFixtureDir("warnings");
  const result = runCli(
    [
      "check",
      "--config",
      "warnings/btxml.config.json",
      "--warnings-as-errors",
      "warnings/unknown_port.xml",
    ],
    cwd,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT007_MISSING_PORT_NAME/);
});

test("E2E-019 non-BT XML can be skipped", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-nonbt-"));
  fs.mkdirSync(path.join(dir, "fixtures", "non_bt"), { recursive: true });
  fs.copyFileSync(
    path.join(fixtures, "non_bt/btxml.config.json"),
    path.join(dir, "fixtures/non_bt/btxml.config.json"),
  );
  fs.copyFileSync(
    path.join(fixtures, "non_bt/package.xml"),
    path.join(dir, "fixtures/non_bt/package.xml"),
  );
  fs.copyFileSync(
    path.join(fixtures, "non_bt/behavior_tree.xml"),
    path.join(dir, "fixtures/non_bt/behavior_tree.xml"),
  );
  const result = runCli(
    [
      "check",
      "--config",
      "fixtures/non_bt/btxml.config.json",
      "--output",
      "json",
      "fixtures/non_bt/*.xml",
    ],
    dir,
  );
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  const packageFile = parsed.files.find((f: { path: string }) => f.path.includes("package.xml"));
  const btFile = parsed.files.find((f: { path: string }) => f.path.includes("behavior_tree.xml"));
  assert.ok(packageFile, "package.xml should be in output");
  assert.ok(packageFile.skipped, "package.xml should be skipped");
  assert.ok(btFile, "behavior_tree.xml should be in output");
  assert.equal(btFile.diagnostics.length, 0, "behavior_tree.xml should have no diagnostics");
});

test("E2E-020 Windows-like paths do not break JSON output", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const windowsPath = file.replaceAll(path.sep, "\\\\");
  const result = runCli(["lint", "--output", "json", windowsPath], cwd);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(typeof parsed.ok, "boolean");
});

test("E2E-021 project-level error affects check exit code", () => {
  const { cwd } = copyFixtureDir("project-diagnostics");
  const result = runCli(
    ["check", "--config", "project-diagnostics/btxml.config.json", "project-diagnostics/main.xml"],
    cwd,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT302_INCLUDE_NOT_FOUND/);
});

test("E2E-022 include target format diff is detected by check", () => {
  const { cwd } = copyFixtureDir("include-format");
  const result = runCli(
    ["check", "--config", "include-format/btxml.config.json", "include-format/main.xml"],
    cwd,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /common\.xml/);
  assert.match(result.stdout + result.stderr, /BTXML_FORMAT/);
});

test("E2E-061 check detects external model format diff", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-check-external-format-"));
  fs.cpSync(path.join(fixtures, "external-model"), path.join(dir, "external-model"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, "external-model", "models", "nodes.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root><TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = runCli(
    ["check", "--config", "external-model/btxml.config.json", "external-model/main.xml"],
    dir,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /models\/nodes\.xml/);
  assert.match(result.stdout + result.stderr, /BTXML_FORMAT/);
});

test("E2E-062 check format-only includes external model files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-check-format-only-external-"));
  fs.cpSync(path.join(fixtures, "external-model"), path.join(dir, "external-model"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, "external-model", "models", "nodes.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root><TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool"/></Action></TreeNodesModel></root>\n',
    "utf8",
  );
  const result = runCli(
    [
      "check",
      "--format-only",
      "--config",
      "external-model/btxml.config.json",
      "external-model/main.xml",
    ],
    dir,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /models\/nodes\.xml/);
  assert.match(result.stdout + result.stderr, /BTXML_FORMAT/);
});

test("E2E-023 external TreeNodesModel file is formatted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-external-model-"));
  fs.cpSync(path.join(fixtures, "external-model"), path.join(dir, "external-model"), {
    recursive: true,
  });
  const result = runCli(["format", "--config", "external-model/btxml.config.json"], dir);
  assert.equal(result.status, 0);
  assert.match(read(path.join(dir, "external-model", "models", "nodes.xml")), /<TreeNodesModel>/);
});

test("E2E-024 JSON summary includes format diagnostics", () => {
  const { cwd } = copyFixtureDir("include-format");
  const result = runCli(
    [
      "check",
      "--output",
      "json",
      "--config",
      "include-format/btxml.config.json",
      "include-format/main.xml",
    ],
    cwd,
  );
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.summary.errors >= 1);
  assert.ok(
    parsed.files.some((entry: { diagnostics: Array<{ code: string }> }) =>
      entry.diagnostics.some((diag) => diag.code === "BTXML_FORMAT"),
    ),
  );
});

test("E2E-054 runCheck summary includes format diagnostics", () => {
  const { cwd } = copyFixtureDir("include-format");
  const result = runCli(
    ["check", "--config", "include-format/btxml.config.json", "include-format/main.xml"],
    cwd,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BTXML_FORMAT/);
});

test("E2E-055 JSON report summary is derived from diagnostics", () => {
  const { cwd } = copyFixtureDir("include-format");
  const result = runCli(
    [
      "check",
      "--output",
      "json",
      "--config",
      "include-format/btxml.config.json",
      "include-format/main.xml",
    ],
    cwd,
  );
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.summary.errors >= 1);
  assert.ok(
    parsed.files.some((entry: { diagnostics: Array<{ code: string }> }) =>
      entry.diagnostics.some((diag) => diag.code === "BTXML_FORMAT"),
    ),
  );
});

test("E2E-058 missing external TreeNodesModel pattern is diagnostic", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-missing-external-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["main.xml"] },
      models: { files: ["models/missing.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    read(path.join(fixtures, "external-model", "main.xml")),
    "utf8",
  );
  const result = runCli(["check", "--config", "btxml.config.json", "main.xml"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT321_EXTERNAL_MODEL_FILE_NOT_FOUND/);
});

test("E2E-063 external model without TreeNodesModel is diagnostic", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-missing-model-e2e-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["main.xml"] },
      models: { files: ["model.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    read(path.join(fixtures, "external-model", "main.xml")),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "model.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="x"><AlwaysSuccess/></BehaviorTree></root>`,
    "utf8",
  );
  const result = runCli(["check", "--config", "btxml.config.json", "main.xml"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT322_MISSING_TREENODESMODEL/);
});

test("E2E-064 explain supports short code", () => {
  const result = runCli(["explain", "BT005"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /BT005_UNKNOWN_SUBTREE/);
});

test("E2E-065 explain supports all full rule codes", () => {
  const docs = read(path.join(repoRoot, "docs", "rules.md"));
  const codes = [...docs.matchAll(/\*\*Diagnostic code:\*\* `(BT\d{3}_[A-Z0-9_]+)`/gm)].map(
    (match) => match[1],
  );
  assert.ok(codes.length > 0);
  for (const code of codes) {
    const result = runCli(["explain", code]);
    assert.equal(result.status, 0, code);
    assert.match(result.stdout, new RegExp(code));
    assert.match(result.stdout, /Default severity:/);
  }
});

test("E2E-066 explain resolves unambiguous short codes", () => {
  const cases = [
    ["BT005", "BT005_UNKNOWN_SUBTREE"],
    ["BT107", "BT107_CONFLICTING_PORT_DEFAULT"],
    ["BT322", "BT322_MISSING_TREENODESMODEL"],
  ] as const;
  for (const [shortCode, fullCode] of cases) {
    const result = runCli(["explain", shortCode]);
    assert.equal(result.status, 0, shortCode);
    assert.match(result.stdout, new RegExp(fullCode));
  }
});

test("E2E-059 missing node definition pattern is diagnostic", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-missing-node-def-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["main.xml"] },
      models: { definitions: ["nodes/missing.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    read(path.join(fixtures, "external-model", "main.xml")),
    "utf8",
  );
  const result = runCli(["check", "--config", "btxml.config.json", "main.xml"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT331_NODE_DEFINITION_FILE_NOT_FOUND/);
});

test("E2E-025 CLI version matches package version", () => {
  const result = runCli(["--version"]);
  assert.equal(result.status, 0);
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  assert.equal(result.stdout.trim(), pkg.version);
});

test("E2E-026 JSON output includes schema and tool version", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const result = runCli(["lint", "--output", "json", file], cwd);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, "2");
  assert.equal(typeof parsed.toolVersion, "string");
  assert.equal(parsed.version, 2);
});

test("E2E-067 check rejects unknown output", () => {
  const { cwd, file } = copyFixture("valid/groot_formatted.xml");
  const result = runCli(["check", "--output", "unknown", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid value `unknown` for `--output`/);
});

test("E2E-068 lint rejects --stdout", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const result = runCli(["lint", "--stdout", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--stdout is not supported for `lint`/);
});

test("E2E-069 check rejects --stdout", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const result = runCli(["check", "--stdout", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--stdout is not supported for `check`/);
});

test("E2E-028 paths with spaces work", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml spaces "));
  const file = path.join(dir, "tree with spaces.xml");
  fs.writeFileSync(file, read(path.join(fixtures, "invalid/unknown_subtree.xml")), "utf8");
  const result = runCli(["lint", file], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /BT005_UNKNOWN_SUBTREE/);
});

test("E2E-072 format --stdout --check fails", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const result = runCli(["format", "--stdout", "--check", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--stdout` cannot be used with `--check`/);
});

test("E2E-073 format --stdout --diff fails", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const result = runCli(["format", "--stdout", "--diff", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--stdout` cannot be used with `--diff`/);
});

test("E2E-074 format --output json fails", () => {
  const { cwd, file } = copyFixture("valid/redhat_formatted.xml");
  const result = runCli(["format", "--output", "json", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid value `json` for `--output`/);
});

test("E2E-075 check --format-only --no-format fails", () => {
  const { cwd, file } = copyFixture("valid/groot_formatted.xml");
  const result = runCli(["check", "--format-only", "--no-format", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--no-format` and `--format-only` cannot be used together/);
});

test("E2E-076 check --lint-only --no-lint fails", () => {
  const { cwd, file } = copyFixture("valid/groot_formatted.xml");
  const result = runCli(["check", "--lint-only", "--no-lint", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--no-lint` and `--lint-only` cannot be used together/);
});

test("E2E-077 unknown option fails", () => {
  const { cwd, file } = copyFixture("valid/groot_formatted.xml");
  const result = runCli(["check", "--unknown-option", file], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option `--unknown-option`/);
});

test("E2E-078 option missing required value fails", () => {
  const { cwd, file } = copyFixture("valid/groot_formatted.xml");
  const result = runCli(["check", file, "--output"], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--output requires a value/);
});

test("E2E-084 bare ampersand in attribute is rejected", () => {
  const { cwd, file } = copyFixture("invalid/malformed_ampersand.xml");
  const result = runCli(["lint", file], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /bare ampersand/);
});

test("E2E-085 format does not rewrite malformed ampersand", () => {
  const { cwd, file } = copyFixture("invalid/malformed_ampersand.xml");
  const before = fs.readFileSync(file, "utf8");
  const result = runCli(["format", file], cwd);
  assert.equal(result.status, 1);
  const after = fs.readFileSync(file, "utf8");
  assert.equal(before, after);
});

test("E2E-086 CLI help exits 0", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /btxml <command>/);
});

test("E2E-087 command help exits 0", () => {
  const format = runCli(["format", "--help"]);
  assert.equal(format.status, 0);
  assert.match(format.stdout, /Format BT\/XML files/);

  const lint = runCli(["lint", "--help"]);
  assert.equal(lint.status, 0);
  assert.match(lint.stdout, /Lint BT\/XML files/);
});

test("E2E-088 lint --json outputs JSON", () => {
  const { cwd, file } = copyFixture("invalid/unknown_subtree.xml");
  const result = runCli(["lint", "--json", file], cwd);
  assert.equal(result.status, 1);
  jsonCheckReportSchema.parse(JSON.parse(result.stdout));
});
