import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packagesDir = path.join(root, "packages");
const options = parseArgs(process.argv.slice(2));
const pnpmCommand = getPnpmCommand();
const npmCommand = getNpmCommand();

const PUBLISHABLE_PACKAGE_NAMES = [
  "@abco20/btxml",
];

const BT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>
`;

const MODEL_JSON = JSON.stringify(
  {
    nodes: {
      MoveBase: {
        kind: "Action",
        ports: {
          goal: { direction: "input", type: "Pose2D" },
        },
      },
    },
  },
  null,
  2,
);

const README_EXAMPLE_MODULE = String.raw`
import assert from "node:assert/strict";
import { checkBtWorkspace, formatBtXml, normalizeBtxmlConfig } from "@abco20/btxml";
import { createBtEditorService } from "@abco20/btxml/editor";

const workspaceXml = "<?xml version=\"1.0\"?>\n<root BTCPP_format=\"4\"><BehaviorTree ID=\"Main\"/></root>";
const editorXml = "<root BTCPP_format=\"4\"><BehaviorTree ID=\"Main\"/></root>";

const { config, ok, diagnostics } = normalizeBtxmlConfig({
  strict: true,
});

assert.equal(ok, true);
assert.deepEqual(diagnostics, []);

const result = await checkBtWorkspace({
  inputs: [
    {
      uri: "file:///workspace/behavior_trees/main.xml",
      path: "behavior_trees/main.xml",
      kind: "bt-xml",
      text: workspaceXml,
    },
  ],
  config,
});

assert.equal(result.ok, true);
assert.equal(result.summary.errors, 0);

const service = createBtEditorService();
service.openDocument("memory:///tree.xml", editorXml);
const serviceDiagnostics = service.getDiagnostics("memory:///tree.xml").diagnostics;
assert.ok(Array.isArray(serviceDiagnostics));
assert.equal(serviceDiagnostics.some((diagnostic) => diagnostic.severity === "error"), false);

const formatted = formatBtXml(editorXml);
assert.equal(formatted.ok, true);
assert.equal(formatted.skipped, false);
`;

main();

function main() {
  const publishableWorkspaces = getPublishableWorkspaces();
  const tarballsDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-workspace-packs-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-workspace-smoke-"));

  try {
    if (!options.noBuild) {
      run(pnpmCommand, ["build"], root);
    }

    const tarballs = [];
    for (const workspace of publishableWorkspaces) {
      const tarballPath = packWorkspace(workspace, tarballsDir);
      tarballs.push(tarballPath);
    }

    run(npmCommand, ["init", "-y"], projectDir);
    run(npmCommand, ["install", ...tarballs], projectDir);

    writeFixtureFiles(projectDir);
    runSmokeAssertions(projectDir);

    console.log("Workspace npm pack smoke passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    fs.rmSync(tarballsDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

function getPublishableWorkspaces() {
  const workspaces = [];
  for (const dirent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;

    const packageRoot = path.join(packagesDir, dirent.name);
    const packageJsonPath = path.join(packageRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (pkg.private) continue;
    if (!PUBLISHABLE_PACKAGE_NAMES.includes(pkg.name)) continue;
    workspaces.push({ name: pkg.name, packageRoot });
  }

  workspaces.sort(
    (left, right) =>
      PUBLISHABLE_PACKAGE_NAMES.indexOf(left.name) - PUBLISHABLE_PACKAGE_NAMES.indexOf(right.name),
  );

  assert.deepEqual(
    workspaces.map((workspace) => workspace.name),
    PUBLISHABLE_PACKAGE_NAMES,
    "publishable workspace set diverged from the single-package release baseline",
  );

  return workspaces;
}

function packWorkspace(workspace, tarballsDir) {
  const result = run(npmCommand, ["pack", "--json"], workspace.packageRoot);
  const packJson = JSON.parse(result.stdout);
  const tarballName = packJson[0]?.filename;
  assert.ok(tarballName, `missing tarball filename for ${workspace.name}`);

  const tarballPath = path.join(workspace.packageRoot, tarballName);
  const destinationPath = path.join(tarballsDir, tarballName);
  fs.copyFileSync(tarballPath, destinationPath);
  fs.rmSync(tarballPath, { force: true });
  return destinationPath;
}

function writeFixtureFiles(projectDir) {
  fs.writeFileSync(path.join(projectDir, "main.xml"), BT_XML, "utf8");
  fs.writeFileSync(path.join(projectDir, "nodes.json"), MODEL_JSON, "utf8");
  fs.writeFileSync(
    path.join(projectDir, "btxml.config.json"),
    JSON.stringify(
      {
        strict: true,
        files: { include: ["main.xml"] },
        models: { definitions: ["nodes.json"] },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(path.join(projectDir, "readme-example.mjs"), README_EXAMPLE_MODULE, "utf8");
}

function runSmokeAssertions(projectDir) {
  runNodeModule(
    String.raw`
      import assert from "node:assert/strict";
      import { checkBtXml, normalizeBtxmlConfig } from "@abco20/btxml";
      import { createBtEditorService } from "@abco20/btxml/editor";
      import { createBtProjectEditorService } from "@abco20/btxml/editor/node";
      import { buildDocumentModel } from "@abco20/btxml/model";
      import { buildSemanticIndex, buildSemanticDocumentView } from "@abco20/btxml/semantic";
      import { parseBtXml } from "@abco20/btxml/syntax";

      const xml = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./main.xml", import.meta.url), "utf8"));
      const tempMainUri = new URL("./main.xml", import.meta.url).href;
      const parsed = parseBtXml(xml, { uri: tempMainUri, path: "main.xml" });
      assert.equal(parsed.ok, true);
      assert.ok(parsed.document);

      const { config, ok } = normalizeBtxmlConfig({
        strict: true,
        files: { include: ["main.xml"] },
        models: { definitions: ["nodes.json"] },
      });
      assert.equal(ok, true);
      assert.equal(typeof checkBtXml, "function");

      const modelResult = buildDocumentModel(parsed.document);
      assert.equal(modelResult.model.behaviorTrees.length, 1);
      assert.equal(modelResult.model.treeNodesModel.length, 1);

      const semantic = buildSemanticIndex([parsed.document], { config });
      assert.equal(semantic.ok, true);
      const view = buildSemanticDocumentView(parsed.document, semantic.index);
      assert.ok(view.nodes.length >= 1);

      const workspaceService = createBtEditorService();
      workspaceService.openDocument("memory:///tree.xml", xml);
      assert.ok(workspaceService.getSemanticDocumentView("memory:///tree.xml").view);

      const nodeWorkspace = createBtProjectEditorService({ cwd: process.cwd() });
      const loaded = await nodeWorkspace.loadProject();
      assert.equal(loaded.ok, true);
      nodeWorkspace.openDocument(tempMainUri, xml);
      assert.equal(nodeWorkspace.getNodeModelById("MoveBase", tempMainUri).model?.id, "MoveBase");
      nodeWorkspace.dispose();
    `,
    projectDir,
  );

  runNodeModule(String.raw`await import(new URL("./readme-example.mjs", import.meta.url));`, projectDir);
}

function runNodeModule(source, cwd) {
  run(process.execPath, ["--input-type=module", "--eval", source], cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });

  if (result.status !== 0) {
    const details = [`Command failed: ${command} ${args.join(" ")}`];
    if (result.stdout) details.push(result.stdout.trimEnd());
    if (result.stderr) details.push(result.stderr.trimEnd());
    const error = new Error(details.join("\n"));
    error.exitCode = result.status ?? 1;
    throw error;
  }

  return result;
}

function parseArgs(argv) {
  return {
    noBuild: argv.includes("--no-build"),
  };
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
