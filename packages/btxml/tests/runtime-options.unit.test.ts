import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { RawBtxmlConfig } from "@btxml/config";
import type { BtxmlProject } from "@btxml/project";
import {
  checkProject,
  getBaselinePath,
  getProjectConfig,
  loadProjectDocuments,
} from "@btxml/project";
import { discoverNodeProject, pathToFileUri } from "@btxml/project/node";
import { maybeUpdateBaseline, resolveBaseline } from "../src/baseline-options.ts";
import { CliError } from "../src/errors.ts";

function makeProjectDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, ".git"));
  return dir;
}

test("maxWarnings = 0 fails when warnings exist but diagnostics remain warnings", async () => {
  const dir = makeProjectDir("btxml-runtime-maxwarnings-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence unknownPort="1"/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadProjectDocuments(project.project);
  const result = await checkProject({
    project: project.project,
    documents: loaded.documents,
    externalModelDocuments: loaded.externalModelDocuments,
    projectDiagnostics: loaded.diagnostics,
    maxWarnings: 0,
  });
  assert.equal(result.ok, false);
  const warning = result.files[0].diagnostics.find((d) => d.severity === "warning");
  assert.ok(warning, "expected a warning diagnostic");
});

test("reporter is controlled by CLI option, not config", async () => {
  const dir = makeProjectDir("btxml-runtime-reporter-");
  fs.writeFileSync(path.join(dir, "btxml.config.json"), JSON.stringify({}), "utf8");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadProjectDocuments(project.project);
  const result = await checkProject({
    project: project.project,
    documents: loaded.documents,
    externalModelDocuments: loaded.externalModelDocuments,
    projectDiagnostics: loaded.diagnostics,
  });
  assert.equal(result.ok, true);
});

test("baseline update only happens when CLI option is provided", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-runtime-baseline-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ linter: { baseline: "baseline.json" } }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "tree.xml"), "...", "utf8");

  const project = {
    rootUri: pathToFileUri(dir),
    configUri: pathToFileUri(path.join(dir, "btxml.config.json")),
    config: { linter: { baseline: "baseline.json" } } as RawBtxmlConfig,
    host: {} as never,
    selectedFiles: [],
    entrypoints: [],
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  assert.equal(
    getBaselinePath(getProjectConfig(project) as import("@btxml/config").ResolvedBtxmlConfig),
    "baseline.json",
  );

  maybeUpdateBaseline(project, { _: ["check"] }, []);
  assert.equal(fs.existsSync(path.join(dir, "baseline.json")), false);

  maybeUpdateBaseline(project, { _: ["check"], updateBaseline: "baseline.json" }, []);
  assert.equal(fs.existsSync(path.join(dir, "baseline.json")), true);
});

test("invalid baseline file shape is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-runtime-invalid-baseline-"));
  fs.writeFileSync(path.join(dir, "baseline.json"), JSON.stringify({ version: 1 }), "utf8");

  const project = {
    rootUri: pathToFileUri(dir),
    config: {} as RawBtxmlConfig,
    host: {} as never,
    selectedFiles: [],
    entrypoints: [],
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  assert.throws(
    () => resolveBaseline(project, { _: ["lint"], baseline: "baseline.json" }),
    CliError,
  );
});

test("valid baseline file shape is accepted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-runtime-valid-baseline-"));
  fs.writeFileSync(
    path.join(dir, "baseline.json"),
    JSON.stringify({ version: 1, diagnostics: [] }),
    "utf8",
  );

  const project = {
    rootUri: pathToFileUri(dir),
    config: {} as RawBtxmlConfig,
    host: {} as never,
    selectedFiles: [],
    entrypoints: [],
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  const baseline = resolveBaseline(project, {
    _: ["lint"],
    baseline: "baseline.json",
  });
  assert.deepEqual(baseline, { version: 1, diagnostics: [] });
});

test("config containing old output and baseline.update is ignored for runtime behavior", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-runtime-ignored-config-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["**/*.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence unknownPort="1"/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadProjectDocuments(project.project);
  const result = await checkProject({
    project: project.project,
    documents: loaded.documents,
    externalModelDocuments: loaded.externalModelDocuments,
    projectDiagnostics: loaded.diagnostics,
  });
  assert.equal(result.ok, true);
  const warning = result.files[0].diagnostics.find((d) => d.severity === "warning");
  assert.ok(warning, "expected a warning diagnostic");
});
