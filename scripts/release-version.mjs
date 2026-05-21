import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2);
const command = args[0];

if (command === "bump") {
  const input = args[1];
  if (!input) {
    fail("Usage: node scripts/release-version.mjs bump <major|minor|patch|x.y.z>");
  }
  const currentVersion = readJson(path.join(root, "package.json")).version;
  const nextVersion = resolveNextVersion(currentVersion, input);
  updateWorkspaceVersions(nextVersion);
  console.log(nextVersion);
  process.exit(0);
}

if (command === "verify-tag") {
  const rawTag = args[1] || process.env.GITHUB_REF_NAME || "";
  const version = normalizeTag(rawTag);
  if (!version) {
    fail(`Expected release tag in the form vX.Y.Z, received: ${rawTag || "<empty>"}`);
  }
  verifyWorkspaceVersions(version);
  console.log(version);
  process.exit(0);
}

fail("Usage: node scripts/release-version.mjs <bump|verify-tag> ...");

function updateWorkspaceVersions(nextVersion) {
  const packageJsonFiles = collectPackageJsonFiles();

  for (const filePath of packageJsonFiles) {
    const pkg = readJson(filePath);
    if (typeof pkg.version === "string") {
      pkg.version = nextVersion;
    }

    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      if (!pkg[field] || typeof pkg[field] !== "object") continue;
      for (const [name, value] of Object.entries(pkg[field])) {
        if (typeof value !== "string") continue;
        if (isVersionManagedDependency(name, value)) {
          pkg[field][name] = nextVersion;
        }
      }
    }

    writeJson(filePath, pkg);
  }
}

function verifyWorkspaceVersions(expectedVersion) {
  const errors = [];
  const packageJsonFiles = collectPackageJsonFiles();

  for (const filePath of packageJsonFiles) {
    const pkg = readJson(filePath);
    const relativePath = path.relative(root, filePath);

    if (typeof pkg.version === "string" && pkg.version !== expectedVersion) {
      errors.push(`${relativePath}: version ${pkg.version} does not match ${expectedVersion}`);
    }

    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      if (!pkg[field] || typeof pkg[field] !== "object") continue;
      for (const [name, value] of Object.entries(pkg[field])) {
        if (!isVersionManagedDependency(name, value)) continue;
        if (value !== expectedVersion) {
          errors.push(`${relativePath}: ${field}.${name}=${value} does not match ${expectedVersion}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("Release version verification failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

function collectPackageJsonFiles() {
  const files = [path.join(root, "package.json")];
  const packagesDir = path.join(root, "packages");

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageJsonPath = path.join(packagesDir, entry.name, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      files.push(packageJsonPath);
    }
  }

  return files.sort();
}

function isVersionManagedDependency(name, value) {
  return value !== "workspace:*" && (/^@btxml\//.test(name) || name === "@abco20/btxml-checker");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveNextVersion(currentVersion, input) {
  if (/^\d+\.\d+\.\d+$/.test(input)) {
    return input;
  }

  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    fail(`Unsupported current version: ${currentVersion}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (input === "major") {
    return `${major + 1}.0.0`;
  }
  if (input === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  if (input === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }

  fail(`Unsupported release version input: ${input}`);
}

function normalizeTag(tag) {
  const match = String(tag).trim().match(/^v(\d+\.\d+\.\d+)$/);
  return match?.[1] ?? null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
