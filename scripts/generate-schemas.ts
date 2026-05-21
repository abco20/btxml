import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "@btxml/analyzer/rules";
import { generateBtxmlNodesJsonSchema } from "@btxml/model/json-schema";
import { generateBtxmlConfigJsonSchema } from "@btxml/config/json-schema";

type JsonObject = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const check = process.argv.includes("--check");

const JSON_SCHEMA_KEY_ORDER = [
  "$schema",
  "title",
  "description",
  "markdownDescription",
  "type",
  "enum",
  "const",
  "properties",
  "propertyNames",
  "items",
  "additionalItems",
  "required",
  "additionalProperties",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "definitions",
];

const generatedSchemas = [
  {
    schema: generateBtxmlConfigJsonSchema({
      ruleNames: Object.keys(RULES),
    }),
    path: path.join(root, "schemas", "btxml.config.schema.json"),
  },
  {
    schema: generateBtxmlNodesJsonSchema(),
    path: path.join(root, "schemas", "btxml.nodes.schema.json"),
  },
];

let failed = false;

for (const generated of generatedSchemas) {
  const contents = formatJson(`${JSON.stringify(sortJson(generated.schema), null, 2)}\n`);
  const targetPath = generated.path;
  if (check) {
    const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null;
    if (existing !== contents) {
      console.error(`Schema drift: ${path.relative(root, targetPath)}`);
      failed = true;
    }
    continue;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
  console.log(`Wrote ${path.relative(root, targetPath)}`);
}

if (failed) process.exit(1);

function formatJson(contents: string): string {
  const tmpPath = path.join(root, ".tmp-schema-format.json");
  try {
    fs.writeFileSync(tmpPath, contents, "utf8");
    execFileSync("pnpm", ["exec", "biome", "format", "--write", tmpPath], { stdio: "pipe" });
    return fs.readFileSync(tmpPath, "utf8");
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isJsonObject(value)) return value;

  const sorted: JsonObject = {};
  for (const key of Object.keys(value).sort(compareJsonSchemaKeys)) {
    sorted[key] = sortJson(value[key]);
  }
  return sorted;
}

function compareJsonSchemaKeys(a: string, b: string): number {
  const aIndex = JSON_SCHEMA_KEY_ORDER.indexOf(a);
  const bIndex = JSON_SCHEMA_KEY_ORDER.indexOf(b);
  if (aIndex !== -1 || bIndex !== -1) {
    const normalizedAIndex = aIndex === -1 ? JSON_SCHEMA_KEY_ORDER.length : aIndex;
    const normalizedBIndex = bIndex === -1 ? JSON_SCHEMA_KEY_ORDER.length : bIndex;
    return normalizedAIndex - normalizedBIndex;
  }
  return a.localeCompare(b);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
