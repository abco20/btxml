import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const packagesDir = path.join(root, "packages");
const options = parseArgs(process.argv.slice(2));
const npmCommand = getNpmCommand();

const steps = [
  ["packed workspace contents", verifyPackedWorkspaces],
  ["package dependencies", () => run(process.execPath, ["scripts/verify-package-dependencies.mjs"])],
  ["dts leaks", () => run(process.execPath, ["scripts/verify-dist-dts-leaks.mjs"])],
  [
    "workspace package smoke",
    () => run(process.execPath, ["scripts/smoke-test-workspace-packages.mjs", ...(options.noBuild ? ["--no-build"] : [])]),
  ],
];

for (const [label, action] of steps) {
  console.log(`\n==> ${label}`);
  action();
}

function verifyPackedWorkspaces() {
  let failed = false;

  for (const workspace of getPublishableWorkspaces()) {
    const packedFiles = packWorkspaceDryRun(workspace);
    const requiredEntries = collectRequiredPackedEntries(workspace.pkg);

    for (const entry of requiredEntries) {
      const present = entry.type === "prefix" ? hasPathPrefix(packedFiles, entry.value) : packedFiles.has(entry.value);
      if (!present) {
        failed = true;
        console.error(`[${workspace.name}] missing packed file: ${entry.label}`);
      }
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("All publishable workspace packs include required exports, bins, and files.");
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

    workspaces.push({
      name: pkg.name,
      packageRoot,
      pkg,
    });
  }

  return workspaces.sort((left, right) => left.name.localeCompare(right.name));
}

function packWorkspaceDryRun(workspace) {
  const result = spawnSync(npmCommand, ["pack", "--dry-run", "--json"], {
    cwd: workspace.packageRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.error(`[${workspace.name}] ${npmCommand} pack failed`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  const packed = JSON.parse(result.stdout)[0];
  return new Set((packed.files || []).map((file) => normalizePath(file.path)));
}

function collectRequiredPackedEntries(pkg) {
  const required = new Map();
  addRequired(required, exactEntry("package.json", "package.json"));

  for (const target of collectExportTargets(pkg.exports)) {
    addRequired(required, exactEntry(normalizePackageTarget(target), `export ${target}`));
  }

  if (pkg.bin) {
    if (typeof pkg.bin === "string") {
      addRequired(required, exactEntry(normalizePackageTarget(pkg.bin), `bin ${pkg.bin}`));
    } else {
      for (const [name, target] of Object.entries(pkg.bin)) {
        addRequired(required, exactEntry(normalizePackageTarget(target), `bin ${name}: ${target}`));
      }
    }
  }

  for (const fileEntry of pkg.files || []) {
    const normalized = normalizePath(String(fileEntry));
    if (normalized.endsWith("/**")) {
      const prefix = normalized.slice(0, -2);
      addRequired(required, prefixEntry(prefix, `files ${fileEntry}`));
      continue;
    }
    if (!normalized.includes("*")) {
      addRequired(required, exactEntry(normalized, `files ${fileEntry}`));
    }
  }

  return [...required.values()];
}

function collectExportTargets(entry) {
  if (typeof entry === "string") {
    return [entry];
  }
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const targets = [];
  for (const value of Object.values(entry)) {
    targets.push(...collectExportTargets(value));
  }
  return targets;
}

function normalizePackageTarget(value) {
  return normalizePath(String(value).replace(/^\.\//, ""));
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function exactEntry(value, label) {
  return { type: "exact", value, label };
}

function prefixEntry(value, label) {
  const prefix = value.endsWith("/") ? value : `${value}/`;
  return { type: "prefix", value: prefix, label };
}

function addRequired(required, entry) {
  required.set(`${entry.type}:${entry.value}`, entry);
}

function hasPathPrefix(filePaths, prefix) {
  for (const filePath of filePaths) {
    if (filePath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  return {
    noBuild: argv.includes("--no-build"),
  };
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
