import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const lspPackageDir = path.join(root, "packages", "btxml-lsp");
const targetDir = path.resolve(process.cwd(), args.target);
const sourceDir = path.join(lspPackageDir, "dist");
const workspacePackagesDir = path.join(root, "packages");

const required = ["server.cjs"];
const optional = ["server.cjs.map"];
const packageRootsByName = collectWorkspacePackageRoots();
const buildInputs = collectBuildInputs();

ensureRuntimeBuilt();

fs.mkdirSync(targetDir, { recursive: true });

for (const file of required) {
  copyRequired(file);
}

for (const file of optional) {
  copyOptional(file);
}

function copyRequired(file) {
  const source = path.join(sourceDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing LSP runtime: ${path.relative(root, source)}`);
  }

  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
  console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, target)}`);
}

function ensureRuntimeBuilt() {
  if (!runtimeNeedsBuild()) {
    return;
  }

  const result = spawnSync(getPnpmCommand(), ["--filter", "@btxml/lsp...", "run", "build"], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runtimeNeedsBuild() {
  const outputTimes = required.map((file) => getMtime(path.join(sourceDir, file)));
  if (outputTimes.some((mtime) => mtime === null)) {
    return true;
  }

  const oldestOutputTime = Math.min(...outputTimes);
  const newestInputTime = Math.max(...buildInputs.map((file) => getMtime(file) ?? 0));
  return newestInputTime > oldestOutputTime;
}

function copyOptional(file) {
  const source = path.join(sourceDir, file);
  if (!fs.existsSync(source)) {
    return;
  }

  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
  console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, target)}`);
}

function parseArgs(argv) {
  const targetIndex = argv.indexOf("--target");
  if (targetIndex === -1 || !argv[targetIndex + 1]) {
    throw new Error("Usage: node scripts/copy-lsp-runtime.mjs --target <dir>");
  }

  return { target: argv[targetIndex + 1] };
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

function collectPackageTsconfigFiles(packageRoot) {
  if (!fs.existsSync(packageRoot)) {
    return [];
  }

  return fs.readdirSync(packageRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile() || !/^tsconfig.*\.json$/u.test(entry.name)) {
      return [];
    }

    return [path.join(packageRoot, entry.name)];
  });
}

function collectBuildInputs() {
  const workspacePackageNames = collectWorkspaceDependencyNames("@btxml/lsp");
  const inputs = [
    path.join(root, "package.json"),
    path.join(root, "pnpm-lock.yaml"),
    path.join(root, "tsconfig.json"),
    path.join(lspPackageDir, "package.json"),
    ...collectPackageTsconfigFiles(lspPackageDir),
    path.join(lspPackageDir, "tsup.config.ts"),
    ...collectFiles(path.join(lspPackageDir, "src")),
  ];

  for (const packageName of workspacePackageNames) {
    const packageRoot = packageRootsByName.get(packageName);
    if (!packageRoot) {
      continue;
    }

    inputs.push(path.join(packageRoot, "package.json"));
    inputs.push(...collectPackageTsconfigFiles(packageRoot));
    inputs.push(path.join(packageRoot, "tsup.config.ts"));
    inputs.push(...collectFiles(path.join(packageRoot, "src")));
  }

  return [...new Set(inputs)];
}

function collectWorkspaceDependencyNames(packageName, seen = new Set()) {
  if (seen.has(packageName)) {
    return seen;
  }

  seen.add(packageName);

  const packageRoot = packageRootsByName.get(packageName);
  if (!packageRoot) {
    return seen;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dependencyName of Object.keys(pkg[field] ?? {})) {
      if (!packageRootsByName.has(dependencyName)) {
        continue;
      }

      collectWorkspaceDependencyNames(dependencyName, seen);
    }
  }

  return seen;
}

function collectWorkspacePackageRoots() {
  const packageRoots = new Map();

  for (const entry of fs.readdirSync(workspacePackagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageRoot = path.join(workspacePackagesDir, entry.name);
    const packageJsonPath = path.join(packageRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (typeof pkg.name === "string") {
      packageRoots.set(pkg.name, packageRoot);
    }
  }

  return packageRoots;
}

function getMtime(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.statSync(filePath).mtimeMs;
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}
