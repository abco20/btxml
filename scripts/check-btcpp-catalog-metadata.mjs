import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VERSIONS_FILE = path.join(
  REPO_ROOT,
  "packages",
  "model",
  "resources",
  "btcpp",
  "versions.json"
);
const BTCPP_RESOURCES_DIR = path.dirname(VERSIONS_FILE);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${file}: ${error.message}`);
  }
}

function validateVersionsJson(data) {
  const errors = [];

  // Check versions array
  if (!Array.isArray(data.versions)) {
    errors.push("'versions' must be an array");
    return errors;
  }

  if (data.versions.length === 0) {
    errors.push("'versions' array must not be empty");
    return errors;
  }

  // Check for duplicates
  const seen = new Set();
  for (const version of data.versions) {
    if (seen.has(version)) {
      errors.push(`Duplicate version: ${version}`);
    }
    seen.add(version);
  }

  // Check default version
  if (!data.default) {
    errors.push("'default' field is required");
  } else if (!data.versions.includes(data.default)) {
    errors.push(
      `'default' version "${data.default}" is not in 'versions' array`
    );
  }

  return errors;
}

function validateVersionDirectory(version) {
  const errors = [];
  const versionDir = path.join(BTCPP_RESOURCES_DIR, version);

  // Check directory exists
  if (!fs.existsSync(versionDir)) {
    errors.push(`Directory not found: ${versionDir}`);
    return errors;
  }

  // Check XML file exists
  const xmlFile = path.join(versionDir, "btcpp_default_models.xml");
  if (!fs.existsSync(xmlFile)) {
    errors.push(`Missing XML file: ${xmlFile}`);
  }

  // Check metadata.json exists
  const metadataFile = path.join(versionDir, "metadata.json");
  if (!fs.existsSync(metadataFile)) {
    errors.push(`Missing metadata.json: ${metadataFile}`);
    return errors;
  }

  // Validate metadata.json
  const metadata = readJson(metadataFile);

  // Check version matches directory name
  if (metadata.version !== version) {
    errors.push(
      `metadata.json version "${metadata.version}" does not match directory name "${version}"`
    );
  }

  // Check commit is not UNKNOWN
  if (metadata.commit === "UNKNOWN") {
    errors.push(`metadata.json commit is "UNKNOWN" for version ${version}`);
  }

  // Check commit is valid 40-char hex SHA
  if (!isValidSha40(metadata.commit)) {
    errors.push(
      `metadata.json commit "${metadata.commit}" is not a valid 40-character hex SHA for version ${version}`
    );
  }

  // Check source field
  if (metadata.source !== "BehaviorTree/BehaviorTree.CPP") {
    errors.push(
      `metadata.json source "${metadata.source}" should be "BehaviorTree/BehaviorTree.CPP" for version ${version}`
    );
  }

  return errors;
}

function isValidSha40(commit) {
  if (typeof commit !== "string") return false;
  if (commit.length !== 40) return false;
  return /^[0-9a-f]{40}$/.test(commit);
}

let hasErrors = false;
const errors = [];

// Read and validate versions.json
if (!fs.existsSync(VERSIONS_FILE)) {
  console.error(`✗ versions.json not found: ${VERSIONS_FILE}`);
  process.exit(1);
}

const versionsData = readJson(VERSIONS_FILE);
const versionErrors = validateVersionsJson(versionsData);
if (versionErrors.length > 0) {
  errors.push("versions.json validation failed:");
  for (const error of versionErrors) {
    errors.push(`  - ${error}`);
  }
  hasErrors = true;
}

// Validate each version directory
for (const version of versionsData.versions) {
  const versionErrors = validateVersionDirectory(version);
  if (versionErrors.length > 0) {
    errors.push(`Version ${version} validation failed:`);
    for (const error of versionErrors) {
      errors.push(`  - ${error}`);
    }
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error("✗ BT.CPP catalog metadata validation failed:\n");
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("✓ BT.CPP catalog metadata is valid");
