import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "schemas", "btxml.config.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ strict: false });
const validateConfig = ajv.compile(schema);

function findMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(absolute));
    } else if (entry.isFile() && absolute.endsWith(".md")) {
      files.push(absolute);
    }
  }
  return files;
}

const filesToScan = ["README.md"];
if (fs.existsSync("docs")) {
  filesToScan.push(...findMarkdownFiles("docs"));
}

let hasErrors = false;

const CONFIG_KEYS = new Set([
  "$schema",
  "strict",
  "files",
  "resolver",
  "models",
  "linter",
  "formatter",
  "overrides",
]);
const STALE_CONFIG_KEYS = new Set(["include", "exclude", "resolve", "lint", "format", "output", "baseline"]);

function looksLikeBtxmlConfig(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return false;
  return Object.keys(obj).some((key) => CONFIG_KEYS.has(key) || STALE_CONFIG_KEYS.has(key));
}

function hasStaleConfigShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const topLevelKeys = Object.keys(value);
  if (topLevelKeys.some((key) => STALE_CONFIG_KEYS.has(key))) {
    return true;
  }

  return false;
}

function shouldValidateAsConfig(tag, parsed) {
  if (tag === "json invalid-config") {
    return true;
  }
  if (!looksLikeBtxmlConfig(parsed)) {
    return false;
  }
  return !hasStaleConfigShape(parsed);
}

for (const file of filesToScan) {
  const content = fs.readFileSync(file, "utf8");
  const codeBlockRegex = /```\s*([^\n]*?)\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const tag = match[1].trim();
    const code = match[2];
    if (!(tag === "json" || tag.startsWith("json "))) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(code);
    } catch (err) {
      console.error(`Error: Invalid JSON in ${file}`);
      console.error(err.message);
      hasErrors = true;
      continue;
    }
    if (tag === "json node-definitions") {
      continue;
    }
    if (shouldValidateAsConfig(tag, parsed)) {
      const valid = validateConfig(parsed);
      if (tag === "json invalid-config") {
        if (valid) {
          console.error(`Error: invalid-config block should be schema-invalid in ${file}`);
          hasErrors = true;
        }
      } else if (!valid) {
        console.error(`Error: Invalid BTXML config in ${file}`);
        for (const error of validateConfig.errors) {
          console.error(`  ${error.instancePath || "/"}: ${error.message}`);
        }
        hasErrors = true;
      }
    }
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log("All markdown JSON examples are valid.");
