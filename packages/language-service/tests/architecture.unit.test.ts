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

test("language-service providers do not extract document models directly", () => {
  const files = walkFiles(path.join(ROOT, "packages", "language-service", "src", "providers"));
  const offenders = collectPatternOffenders(files, [
    /buildDocumentModel/,
    /from\s+["']@btxml\/model["']|import\s*\(\s*["']@btxml\/model["']\s*\)/,
  ]);

  assert.deepEqual(offenders, []);
});

test("language-service providers do not call resolveSubTreeTarget directly", () => {
  const files = walkFiles(path.join(ROOT, "packages", "language-service", "src", "providers"));
  const offenders = collectPatternOffenders(files, [/resolveSubTreeTarget\s*\(/]);

  assert.deepEqual(offenders, []);
});
