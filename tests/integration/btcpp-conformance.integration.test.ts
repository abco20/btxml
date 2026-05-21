import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { checkProject } from "@btxml/project";
import { discoverNodeProject, pathToFileUri } from "@btxml/project/node";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");
const FIXTURE_ROOT = path.join(process.cwd(), "tests", "conformance", "btcpp-v4");

function readFixture(...parts: string[]) {
  return fs.readFileSync(path.join(FIXTURE_ROOT, ...parts), "utf8");
}

test("conformance: _while precondition fixture passes unknown-port check", () => {
  const xml = readFixture("prepost", "while.xml");
  const result = validateBtXml(xml, { config: defaultEffectiveConfig });
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT102_UNKNOWN_PORT"),
    false,
  );
});

test("conformance: IfThenElse invalid child count fixture reports BT110", () => {
  const xml = readFixture("tree-shape", "if-then-else-invalid-1.xml");
  const result = validateBtXml(xml, { config: defaultEffectiveConfig });
  assert.ok(result.diagnostics.some((diag) => diag.code === "BT110_INVALID_CHILD_COUNT"));
});

test("conformance: control-valid fixture does not report BT110", () => {
  const xml = readFixture("tree-shape", "control-valid.xml");
  const result = validateBtXml(xml, { config: defaultEffectiveConfig });
  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT110_INVALID_CHILD_COUNT"),
    false,
  );
});

test("conformance: dialect limitation fixture reports unsupported CDATA", () => {
  const xml = readFixture("dialect-limitations", "cdata.unsupported.xml");
  const parsed = parseBtXml(xml);
  assert.ok(parsed.diagnostics.some((diag) => diag.code === "XML010_UNSUPPORTED_CDATA"));
});

test("conformance: ros_pkg include resolves via host capability", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-conformance-ros-"));
  const packageRoot = path.join(dir, "ros", "my_pkg");

  fs.mkdirSync(path.join(dir, "fixtures"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "trees"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["main.xml"] }, resolver: { entrypoints: ["main.xml"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    readFixture("include", "ros-pkg", "main.xml"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(packageRoot, "trees", "common.xml"),
    readFixture("include", "ros-pkg", "common.xml"),
    "utf8",
  );

  const discovered = await discoverNodeProject({
    cwd: dir,
    hostOptions: {
      resolvePackageUri: async (packageName) =>
        packageName === "my_pkg" ? pathToFileUri(packageRoot) : undefined,
    },
  });

  assert.ok(discovered.project);
  const result = await checkProject({ project: discovered.project });

  const allDiagnostics = [
    ...result.projectDiagnostics,
    ...result.files.flatMap((file) => file.diagnostics),
  ];

  assert.equal(
    allDiagnostics.some((diag) => diag.code === "BT312_ROS_PACKAGE_RESOLVER_MISSING"),
    false,
  );
  assert.equal(
    allDiagnostics.some((diag) => diag.code === "BT313_ROS_PACKAGE_NOT_FOUND"),
    false,
  );
  assert.equal(
    allDiagnostics.some((diag) => diag.code === "BT005_UNKNOWN_SUBTREE"),
    false,
  );
});
