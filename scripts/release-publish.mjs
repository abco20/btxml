import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const mode = args[0];
const version = args[1];
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const extensionDir = path.join(root, "packages/vscode-btxml");
const extensionPkg = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail("Usage: node scripts/release-publish.mjs <npm|vsce> <x.y.z>");
}

if (mode === "npm") {
  run("npm", ["publish", "./packages/btxml", "--access", "public", "--provenance"]);
  process.exit(0);
}

if (mode === "vsce") {
  if (!process.env.VSCE_PAT) {
    fail("VSCE_PAT must be set to publish the VS Code extension.");
  }
  run(getPnpmCommand(), ["package:vsix"]);
  run(getPnpmCommand(), [
    "exec",
    "vsce",
    "publish",
    "--packagePath",
    `packages/vscode-btxml/${extensionPkg.name}-${version}.vsix`,
    "-p",
    process.env.VSCE_PAT,
  ]);
  process.exit(0);
}

fail("Usage: node scripts/release-publish.mjs <npm|vsce> <x.y.z>");

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
