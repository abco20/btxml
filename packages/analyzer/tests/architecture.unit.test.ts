import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectPatternOffenders(files: readonly string[], patterns: readonly RegExp[]) {
  const offenders: Array<{ file: string; match: string }> = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) offenders.push({ file: path.relative(ROOT, file), match: match[0] });
    }
  }

  return offenders;
}

test("upper layers do not own usage resolution", () => {
  const forbiddenFiles = [
    "packages/analyzer/src/usage-ports.ts",
    "packages/language-service/src/usage-ports.ts",
  ];

  for (const file of forbiddenFiles) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), false, file);
  }
});

test("generic BT node tag resolution is centralized in semantic usage", () => {
  const files = [
    ...walkFiles(path.join(ROOT, "packages", "analyzer", "src")),
    ...walkFiles(path.join(ROOT, "packages", "language-service", "src")),
  ];

  const offenders = collectPatternOffenders(files, [
    /const\s+GENERIC_NODE_TAGS\s*=/,
    /function\s+isGenericNodeTag\s*\(/,
    /function\s+getGenericNodeKind(?:FromTag)?\s*\(/,
    /(?:if|return)\s*\(?\s*element\.name\s*===\s*["']Action["']\s*\|\|\s*element\.name\s*===\s*["']Condition["']\s*\|\|\s*element\.name\s*===\s*["']Control["']\s*\|\|\s*element\.name\s*===\s*["']Decorator["'](?:\s*\|\|\s*element\.name\s*===\s*["']SubTree["'])?/,
    /(?:if|return)\s*\(?\s*kind\s*===\s*["']Action["']\s*\|\|\s*kind\s*===\s*["']Condition["']\s*\|\|\s*kind\s*===\s*["']Control["']\s*\|\|\s*kind\s*===\s*["']Decorator["'](?:\s*\|\|\s*kind\s*===\s*["']SubTree["'])?/,
    /(?:if|return)\s*\(?\s*kind\s*!==\s*["']Action["']\s*&&\s*kind\s*!==\s*["']Condition["']\s*&&\s*kind\s*!==\s*["']Control["']\s*&&\s*kind\s*!==\s*["']Decorator["'](?:\s*&&\s*kind\s*!==\s*["']SubTree["'])?/,
  ]);

  assert.deepEqual(offenders, []);
});
