import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const targetDir = path.resolve(process.cwd(), args.target);
const sourceDir = path.join(root, "schemas");
const schemaFiles = ["btxml.config.schema.json", "btxml.nodes.schema.json"];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of schemaFiles) {
  const source = path.join(sourceDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing schema: ${path.relative(root, source)}`);
  }

  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
  console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, target)}`);
}

function parseArgs(argv) {
  const targetIndex = argv.indexOf("--target");
  if (targetIndex === -1 || !argv[targetIndex + 1]) {
    throw new Error("Usage: node scripts/copy-schemas.mjs --target <dir>");
  }

  return { target: argv[targetIndex + 1] };
}
