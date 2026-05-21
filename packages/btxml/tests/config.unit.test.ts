import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { maybeUpdateBaseline } from "../src/baseline-options.ts";
import { runCheck } from "../src/commands/check.ts";
import { runFormat } from "../src/commands/format.ts";
import { runInit } from "../src/commands/init.ts";
import { discoverCommandProject } from "../src/project-context.ts";

function chdir<T>(dir: string, fn: () => T): T {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(original);
  }
}

async function chdirAsync<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

function makeProjectDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, ".git"));
  return dir;
}

test("btxmlc init writes minimal v1 config", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-init-"));
  chdir(dir, () => {
    const result = runInit({});
    assert.equal(result.ok, true);
    const configPath = path.join(dir, "btxml.config.json");
    assert.equal(fs.existsSync(configPath), true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.$schema, "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json");
    assert.equal(Object.keys(config).length, 1);
  });
});

test("btxmlc check --reporter json controls output without config", async () => {
  const dir = makeProjectDir("btxml-check-reporter-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  await chdirAsync(dir, async () => {
    const projectResult = await discoverCommandProject("check", {
      _: ["check", "tree.xml"],
    });
    assert.ok(projectResult);
    assert.ok(projectResult.project);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    try {
      await runCheck(projectResult.project, {
        reporter: "json",
        resolvedConfig: projectResult.resolvedConfig,
      });
    } finally {
      console.log = originalLog;
    }
    assert.equal(logs.length, 1);
    const report = JSON.parse(logs[0]);
    assert.equal(typeof report.ok, "boolean");
    assert.equal(Array.isArray(report.files), true);
  });
});

test("btxmlc check --max-warnings 0 fails on warnings", async () => {
  const dir = makeProjectDir("btxml-check-maxwarnings-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence unknownPort="1"/></BehaviorTree></root>',
    "utf8",
  );
  await chdirAsync(dir, async () => {
    const projectResult = await discoverCommandProject("check", {
      _: ["check", "tree.xml"],
    });
    assert.ok(projectResult);
    assert.ok(projectResult.project);
    const result = await runCheck(projectResult.project, {
      reporter: "human",
      maxWarnings: 0,
      resolvedConfig: projectResult.resolvedConfig,
    });
    assert.equal(result.ok, false);
    const diagnostics = result.files[0].diagnostics;
    const warning = diagnostics.find((d) => d.severity === "warning");
    assert.ok(warning, "expected a warning diagnostic");
  });
});

test("btxmlc check --update-baseline writes baseline", async () => {
  const dir = makeProjectDir("btxml-check-baseline-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );
  await chdirAsync(dir, async () => {
    const projectResult = await discoverCommandProject("check", {
      _: ["check", "tree.xml"],
    });
    assert.ok(projectResult);
    assert.ok(projectResult.project);
    const result = await runCheck(projectResult.project, {
      reporter: "human",
      resolvedConfig: projectResult.resolvedConfig,
      updateBaseline: "baseline.json",
    });
    maybeUpdateBaseline(projectResult.project, { _: ["check"], updateBaseline: "baseline.json" }, [
      ...result.projectDiagnostics,
      ...result.files.flatMap((file) => file.rawDiagnostics ?? file.diagnostics),
    ]);
    assert.equal(fs.existsSync(path.join(dir, "baseline.json")), true);
  });
});

test("btxmlc format respects formatter config", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-format-config-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ formatter: { indentWidth: 4 } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4">\n<BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree>\n</root>\n',
    "utf8",
  );
  await chdirAsync(dir, async () => {
    const projectResult = await discoverCommandProject("format", {
      _: ["format", "tree.xml"],
    });
    assert.ok(projectResult);
    assert.ok(projectResult.project);
    runFormat([path.join(dir, "tree.xml")], {
      output: "human",
      config: projectResult.resolvedConfig,
    });
    const formatted = fs.readFileSync(path.join(dir, "tree.xml"), "utf8");
    assert.ok(formatted.includes("    <BehaviorTree"), formatted);
  });
});
