#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

const root = process.cwd();
const packagesDir = path.join(root, "packages");

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

const allowedMissing = new Map([["btxml-checker", new Set(["vscode"])]]);

const skipPackages = new Set([]);

function isBundledWorkspaceImport(packageName, importedPackage) {
  return packageName === "@abco20/btxml-checker" && importedPackage.startsWith("@btxml/");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function getPackageName(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return `${scope}/${name}`;
  }
  return specifier.split("/")[0];
}

function isRelativeOrAbsolute(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  );
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      out.push(...walk(full));
      continue;
    }

    if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

function extractSpecifiers(source) {
  const specifiers = new Set();

  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"()]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'"()]+?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

const packageDirs = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name))
  .filter((dir) => fs.existsSync(path.join(dir, "package.json")));

const errors = [];

for (const packageDir of packageDirs) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  const packageName = packageJson.name ?? path.basename(packageDir);
  const dirName = path.basename(packageDir);

  if (skipPackages.has(packageName) || skipPackages.has(dirName)) {
    continue;
  }

  const deps = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);

  const srcDir = path.join(packageDir, "src");
  const files = walk(srcDir);

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const specifiers = extractSpecifiers(source);

    for (const specifier of specifiers) {
      if (isRelativeOrAbsolute(specifier)) continue;
      if (nodeBuiltins.has(specifier)) continue;

      if (specifier.startsWith("#")) {
        errors.push(
          `${packageName}: forbidden internal alias "${specifier}" in ${path.relative(root, file)}`,
        );
        continue;
      }

      const importedPackage = getPackageName(specifier);

      if (importedPackage === packageName) continue;
      if (isBundledWorkspaceImport(packageName, importedPackage)) continue;

      const allowed = allowedMissing.get(packageName);
      if (allowed?.has(importedPackage)) continue;

      if (!deps.has(importedPackage)) {
        errors.push(
          `${packageName}: missing dependency "${importedPackage}" imported by ${path.relative(root, file)} as "${specifier}"`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Dependency verification failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("Package dependency verification passed.");
