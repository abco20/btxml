import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { RULES, RuleMetadataByCode, RuleMetadataBySlug } from "@btxml/analyzer/rules";

const ROOT = process.cwd();
const SOURCE_DIRS = [
  path.join(ROOT, "packages", "btxml", "src"),
  path.join(ROOT, "packages", "btxml-lsp", "src"),
  path.join(ROOT, "packages", "vscode-btxml", "src"),
  path.join(ROOT, "packages", "foundation", "src"),
  path.join(ROOT, "packages", "syntax", "src"),
  path.join(ROOT, "packages", "model", "src"),
  path.join(ROOT, "packages", "config", "src"),
  path.join(ROOT, "packages", "analyzer", "src"),
  path.join(ROOT, "packages", "core", "src"),
  path.join(ROOT, "packages", "project", "src"),
  path.join(ROOT, "packages", "language-service", "src"),
];

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute));
      continue;
    }
    if (entry.isFile() && absolute.endsWith(".ts")) files.push(absolute);
  }
  return files;
}

function readAllSourceFiles() {
  return SOURCE_DIRS.flatMap((dir) => walkFiles(dir));
}

function readText(file: string): string {
  return fs.readFileSync(file, "utf8");
}

test("formatter legacy fallbacks are absent", () => {
  const banned = [
    /\banyConfig\.indent\b/,
    /rawXmlDecl === true/,
    /rawXmlDecl === false/,
    /options\.output \|\| "human"/,
    /options\.reporter \|\|/,
    /options\.files \|\| \[\]/,
    /argv as any/,
    /CommandModule<any/,
  ];
  const offenders: Array<{ file: string; match: string }> = [];
  const architectureTestPath = path.join(ROOT, "tests", "architecture.test.ts"); // Old path but it's used to skip itself
  const scanFiles = [...readAllSourceFiles(), ...walkFiles(path.join(ROOT, "tests"))];
  for (const file of scanFiles) {
    if (file === architectureTestPath || file.includes("architecture/")) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of banned) {
      const match = text.match(pattern);
      if (match) offenders.push({ file: path.relative(ROOT, file), match: match[0] });
    }
  }
  assert.deepEqual(offenders, []);
});

test("repair command does not erase definitionFiles", () => {
  const repairPath = path.join(ROOT, "packages", "btxml", "src", "commands", "repair.ts");
  if (!fs.existsSync(repairPath)) return;
  assert.doesNotMatch(readText(repairPath), /definitionFiles:\s*\[\]/);
});

test("language-service root barrel stays browser-safe", () => {
  const rootIndex = path.join(ROOT, "packages", "language-service", "src", "index.ts");
  const workspaceService = path.join(
    ROOT,
    "packages",
    "language-service",
    "src",
    "workspace-service.ts",
  );
  assert.doesNotMatch(readText(rootIndex), /from\s+["']node:/);
  assert.doesNotMatch(readText(workspaceService), /from\s+["']node:/);
});

test("old CLI parser files and imports are absent", () => {
  const deletedFiles = [
    path.join(ROOT, "packages", "btxml", "src", ["ar", "gs.ts"].join("")),
    path.join(ROOT, "packages", "btxml", "src", ["dispa", "tch.ts"].join("")),
    path.join(ROOT, "packages", "btxml", "src", ["usa", "ge.ts"].join("")),
    path.join(ROOT, "packages", "btxml", "src", "yargs-types.d.ts"),
    path.join(ROOT, "scripts", "update-imports.mjs"),
    path.join(ROOT, "scripts", "update-imports2.mjs"),
    path.join(ROOT, "pack.json"),
    path.join(ROOT, "packages", "btxml-core"),
    path.join(ROOT, "docs", "refactoring-baseline.md"),
    path.join(ROOT, "btxml-refactoring-plan-md"),
  ];
  for (const file of deletedFiles) {
    assert.equal(fs.existsSync(file), false, path.relative(ROOT, file));
  }

  const deleted = new Set(deletedFiles.map((file) => path.normalize(file)));
  const offenders: Array<{ file: string; match: string }> = [];

  function collectOffenders(file: string) {
    const text = fs.readFileSync(file, "utf8");
    const imports = text.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g);
    for (const match of imports) {
      const specifier = match[2];
      const absolute = specifier.startsWith(".")
        ? path.normalize(path.resolve(path.dirname(file), specifier))
        : path.normalize(path.join(ROOT, "node_modules", specifier));
      if (
        deleted.has(absolute) ||
        deletedFiles.some((deletedFile) => specifier.endsWith(path.relative(ROOT, deletedFile)))
      ) {
        offenders.push({ file: path.relative(ROOT, file), match: specifier });
      }
    }
  }

  for (const file of readAllSourceFiles()) collectOffenders(file);
  for (const file of walkFiles(path.join(ROOT, "tests"))) {
    collectOffenders(file);
  }

  assert.deepEqual(offenders, []);
});

test("stale built-in API names are absent from source files", () => {
  const staleNames = [
    "builtinArity",
    "builtinPort",
    "BT104_INVALID_NODE_ARITY",
    "InvalidNodeArity",
  ];
  const offenders: Array<{ file: string; name: string }> = [];
  for (const file of readAllSourceFiles()) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const name of staleNames) {
      if (text.includes(name)) offenders.push({ file: path.relative(ROOT, file), name });
    }
  }
  assert.deepEqual(offenders, []);
});

test("vscode child-capability logic stays delegated to LSP", () => {
  const snippetPath = path.join(ROOT, "packages", "vscode-btxml", "src", "tag-snippets.ts");
  const text = readText(snippetPath);

  assert.doesNotMatch(text, /\bBUILTIN_CHILD_CAPABLE\b/);
  assert.doesNotMatch(text, /\bGENERIC_BLOCK_TAGS\b/);
  assert.doesNotMatch(text, /\bGENERIC_NON_BLOCK_TAGS\b/);
  assert.doesNotMatch(text, /btxml\/getNodeModel(ById)?/);
  assert.match(text, /btxml\/getChildCapability/);
});

test("rule metadata default severities come from the runtime rule registry", () => {
  for (const [slug, rule] of Object.entries(RULES)) {
    assert.equal(RuleMetadataBySlug[slug]?.defaultSeverity, rule.defaultSeverity, slug);
    assert.equal(RuleMetadataByCode[rule.code]?.defaultSeverity, rule.defaultSeverity, rule.code);
  }
});

test("stale config names are absent outside allowlist", () => {
  const staleConfigNames = [
    "detectBtXmlOnly",
    "externalTreeNodesModelFiles",
    "nodeDefinitionFiles",
    "builtinModels",
    "warningsAsErrors",
    "strictSubTreePorts",
    "includePathAttributes",
    "entrypoint-graph",
    "allowDuplicateBehaviorTreeIds",
    "preferFileLocalBehaviorTree",
    "spaceBeforeEmptyCloseTag",
    "project.profiles",
    "lint.overrides",
    "format.encoding",
  ];

  const allowlist = new Set([
    path.join(ROOT, "docs", "adr", "0001-config-v1.md"),
    path.join(ROOT, "docs", "migration.md"),
    path.join(ROOT, "tests", "architecture/package-boundaries.architecture.test.ts"),
    path.join(ROOT, "tests", "architecture/source-hygiene.architecture.test.ts"),
    path.join(ROOT, "btxml_v1_config_refactor_release_plan.md"),
  ]);

  function* walkAllScannedFiles(): Generator<string> {
    for (const dir of SOURCE_DIRS) {
      for (const file of walkFiles(dir)) yield file;
    }
    for (const file of walkFiles(path.join(ROOT, "tests"))) yield file;
    for (const file of walkFiles(path.join(ROOT, "docs"))) yield file;
    // Scan JSON fixtures and schemas
    function* walkJsonAndConfig(dir: string): Generator<string> {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          yield* walkJsonAndConfig(absolute);
          continue;
        }
        if (entry.isFile() && (absolute.endsWith(".json") || absolute.endsWith(".md"))) {
          yield absolute;
        }
      }
    }
    for (const file of walkJsonAndConfig(path.join(ROOT, "tests"))) yield file;
  }

  const offenders: Array<{ file: string; name: string }> = [];
  for (const file of walkAllScannedFiles()) {
    if (allowlist.has(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const name of staleConfigNames) {
      if (!text.includes(name)) continue;
      // warningsAsErrors is a legitimate CLI runtime option, not project config
      if (
        name === "warningsAsErrors" &&
        file.startsWith(path.join(ROOT, "packages", "btxml", "src"))
      )
        continue;
      offenders.push({ file: path.relative(ROOT, file), name });
    }
  }
  assert.deepEqual(offenders, []);
});

test("CLI source does not mutate project config directly", () => {
  const offenders: Array<{ file: string; match: string }> = [];
  for (const file of walkFiles(path.join(ROOT, "packages", "btxml", "src"))) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("project.config =")) {
        offenders.push({
          file: `${path.relative(ROOT, file)}:${i + 1}`,
          match: "project.config =",
        });
        continue;
      }
      if (line.includes(".config.linter =")) {
        offenders.push({
          file: `${path.relative(ROOT, file)}:${i + 1}`,
          match: ".config.linter =",
        });
        continue;
      }
      if (line.includes(".config.lint =")) {
        offenders.push({ file: `${path.relative(ROOT, file)}:${i + 1}`, match: ".config.lint =" });
        continue;
      }
      // project.config. is only a mutation when there is an assignment operator after it
      const idx = line.indexOf("project.config.");
      if (idx !== -1) {
        const after = line.slice(idx + "project.config.".length);
        const eqPos = after.indexOf("=");
        if (eqPos !== -1) {
          const absoluteEq = idx + "project.config.".length + eqPos;
          const prevChar = line[absoluteEq - 1];
          const nextChar = line[absoluteEq + 1];
          const isAssignment =
            prevChar !== "=" &&
            prevChar !== "!" &&
            prevChar !== ">" &&
            prevChar !== "<" &&
            nextChar !== "=" &&
            nextChar !== ">";
          if (isAssignment) {
            offenders.push({
              file: `${path.relative(ROOT, file)}:${i + 1}`,
              match: "project.config.",
            });
          }
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("old config fallback casts are absent", () => {
  const banned = [
    "(cfg as any)?.format",
    "(cfg as any)?.lint",
    "(cfg as any)?.resolve",
    "?? (cfg as any)?.format",
  ];
  const offenders = [];
  for (const file of readAllSourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of banned) {
      if (text.includes(pattern)) offenders.push({ file: path.relative(ROOT, file), pattern });
    }
  }
  assert.deepEqual(offenders, []);
});
