import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { jsonCheckReportSchema } from "@abco20/btxml-checker";

const repoRoot = process.cwd();
const cli = path.resolve(repoRoot, "packages/btxml/dist/cli.js");
const fixtures = path.resolve(repoRoot, "tests/e2e/fixtures/fix");
const snapshots = path.resolve(repoRoot, "tests/e2e/snapshots/fix");

function runCli(args: string[], cwd = repoRoot, env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
}

function setupFixture(): { cwd: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-fix-e2e-"));
  fs.cpSync(fixtures, cwd, { recursive: true });
  return { cwd };
}

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

test("FIX-E2E-001 lint --fix applies BT002 safe fix", () => {
  const { cwd } = setupFixture();
  const file = path.join(cwd, "bt002.xml");

  const result = runCli(["lint", "--fix", "bt002.xml"], cwd);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const fixed = read(file);
  assert.equal(fixed, read(path.join(snapshots, "bt002.expected.xml")));
});

test("FIX-E2E-002 lint --fix skips BT121 unsafe fix", () => {
  const { cwd } = setupFixture();
  const file = path.join(cwd, "bt121.xml");
  const before = read(file);

  const result = runCli(["lint", "--fix", "bt121.xml"], cwd);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /skipped\s+\d+\s+unsafe fix/);

  const after = read(file);
  assert.equal(after, before);
});

test("FIX-E2E-003 lint --fix --unsafe applies BT121 and BT123", () => {
  const { cwd } = setupFixture();

  const bt121 = runCli(["lint", "--fix", "--unsafe", "bt121.xml"], cwd);
  assert.equal(bt121.status, 0, bt121.stdout + bt121.stderr);
  assert.equal(
    read(path.join(cwd, "bt121.xml")),
    read(path.join(snapshots, "bt121-unsafe.expected.xml")),
  );

  const bt123 = runCli(["lint", "--fix", "--unsafe", "bt123.xml"], cwd);
  assert.equal(bt123.status, 0, bt123.stdout + bt123.stderr);
  assert.equal(
    read(path.join(cwd, "bt123.xml")),
    read(path.join(snapshots, "bt123-unsafe.expected.xml")),
  );
});

test("FIX-E2E-004 lint --fix-dry-run --unsafe --output json previews without writing", () => {
  const { cwd } = setupFixture();
  const file = path.join(cwd, "bt123.xml");
  const before = read(file);

  const result = runCli(
    ["lint", "--fix-dry-run", "--unsafe", "--output", "json", "bt123.xml"],
    cwd,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const parsed = JSON.parse(result.stdout) as {
    fixes?: {
      dryRun?: boolean;
      enabled?: boolean;
      fixedTextByPath?: Record<string, string>;
    };
  };

  assert.equal(parsed.fixes?.enabled, true);
  assert.equal(parsed.fixes?.dryRun, true);
  assert.equal(typeof parsed.fixes?.fixedTextByPath?.["bt123.xml"], "string");
  assert.equal(read(file), before);
});

test("FIX-E2E-005 lint --unsafe without fix exits with usage error", () => {
  const { cwd } = setupFixture();
  const result = runCli(["lint", "--unsafe", "bt002.xml"], cwd);

  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /--unsafe` can only be used with `--fix` or `--fix-dry-run/);
});

test("FIX-E2E-006 lint --fix is idempotent", () => {
  const { cwd } = setupFixture();
  const file = path.join(cwd, "bt002.xml");

  const first = runCli(["lint", "--fix", "bt002.xml"], cwd);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const afterFirst = read(file);

  const second = runCli(["lint", "--fix", "bt002.xml"], cwd);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, /fixed 0 problems/);

  const afterSecond = read(file);
  assert.equal(afterSecond, afterFirst);
});

test("FIX-E2E-007 lint --fix --unsafe --fix-no-format keeps raw layout", () => {
  const { cwd } = setupFixture();
  const file = path.join(cwd, "bt123.xml");

  const result = runCli(["lint", "--fix", "--unsafe", "--fix-no-format", "bt123.xml"], cwd);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const fixed = read(file);
  const formattedExpected = read(path.join(snapshots, "bt123-unsafe.expected.xml"));
  assert.notEqual(fixed, formattedExpected);
  assert.match(fixed, /<TreeNodesModel>/);
});

test("FIX-E2E-008 lint --fix-dry-run honors --fix-max-passes and reports passes", () => {
  const { cwd } = setupFixture();

  const result = runCli(
    [
      "lint",
      "--fix-dry-run",
      "--fix-max-passes",
      "1",
      "--output",
      "json",
      "bt002.xml",
      "bt123.xml",
    ],
    cwd,
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);

  const parsed = JSON.parse(result.stdout) as {
    fixes?: {
      dryRun?: boolean;
      passes?: number;
      maxPasses?: number;
      circularFixesDetected?: boolean;
      fixedTextByPath?: Record<string, string>;
    };
  };

  assert.equal(parsed.fixes?.dryRun, true);
  assert.equal(parsed.fixes?.maxPasses, 1);
  assert.equal(parsed.fixes?.passes, 1);
  assert.equal(typeof parsed.fixes?.circularFixesDetected, "boolean");
  assert.equal(typeof parsed.fixes?.fixedTextByPath?.["bt002.xml"], "string");
});

test("FIX-E2E-009 lint --fix-dry-run reaches final pass before preview", () => {
  const { cwd } = setupFixture();

  const result = runCli(
    ["lint", "--fix-dry-run", "--output", "json", "bt002.xml", "bt123.xml"],
    cwd,
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);

  const parsed = JSON.parse(result.stdout) as {
    fixes?: {
      dryRun?: boolean;
      passes?: number;
      maxPasses?: number;
      fixedTextByPath?: Record<string, string>;
    };
  };

  assert.equal(parsed.fixes?.dryRun, true);
  assert.equal(parsed.fixes?.maxPasses, 10);
  assert.equal(parsed.fixes?.passes, 2);
  assert.equal(typeof parsed.fixes?.fixedTextByPath?.["bt002.xml"], "string");
  assert.equal(parsed.fixes?.fixedTextByPath?.["bt123.xml"], undefined);
});

test("FIX-E2E-011 lint --fix-dry-run JSON is valid against report schema", () => {
  const { cwd } = setupFixture();
  const result = runCli(
    ["lint", "--fix-dry-run", "--unsafe", "--output", "json", "bt123.xml"],
    cwd,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  jsonCheckReportSchema.parse(JSON.parse(result.stdout));
});

test("FIX-E2E-013 lint --fix honors formatter override after fix", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-fix-override-e2e-"));
  fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      formatter: { indentWidth: 2 },
      overrides: [
        {
          files: ["legacy/*.xml"],
          formatter: { indentWidth: 4 },
        },
      ],
    }),
    "utf8",
  );
  const file = path.join(dir, "legacy", "tree.xml");
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="UTF-8"?><root><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );

  const result = runCli(["lint", "--fix", "legacy/tree.xml"], dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const fixed = read(file);
  assert.match(fixed, /\n {4}<BehaviorTree ID="Main">/);
});
