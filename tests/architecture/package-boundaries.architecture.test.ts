import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const SOURCE_DIRS = [
  path.join(ROOT, "packages", "btxml", "src"),
  path.join(ROOT, "packages", "btxml-lsp", "src"),
  path.join(ROOT, "packages", "vscode-btxml", "src"),
  path.join(ROOT, "packages", "foundation", "src"),
  path.join(ROOT, "packages", "script", "src"),
  path.join(ROOT, "packages", "syntax", "src"),
  path.join(ROOT, "packages", "model", "src"),
  path.join(ROOT, "packages", "config", "src"),
  path.join(ROOT, "packages", "semantic", "src"),
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

function relative(file: string): string {
  return path.relative(ROOT, file);
}

function collectPatternOffenders(
  files: readonly string[],
  patterns: readonly RegExp[],
): Array<{ file: string; match: string }> {
  const offenders: Array<{ file: string; match: string }> = [];
  for (const file of files) {
    const text = readText(file);
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) offenders.push({ file: relative(file), match: match[0] });
    }
  }
  return offenders;
}

function collectLiteralOffenders(
  files: readonly string[],
  literals: readonly string[],
): Array<{ file: string; match: string }> {
  const offenders: Array<{ file: string; match: string }> = [];
  for (const file of files) {
    const text = readText(file);
    for (const literal of literals) {
      if (text.includes(literal)) offenders.push({ file: relative(file), match: literal });
    }
  }
  return offenders;
}

function dirExists(dir: string): boolean {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function filesInDirIfExists(dir: string): string[] {
  return dirExists(dir) ? walkFiles(dir) : [];
}

function collectImportSpecifiers(file: string): string[] {
  const text = readText(file);
  return [...text.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
}

test("includes.ts stays facts-only without diagnostic or severity dependencies", () => {
  const includesPath = path.join(ROOT, "packages", "project", "src", "includes.ts");
  if (!fs.existsSync(includesPath)) return;
  const text = readText(includesPath);

  const bannedImports = [
    /from\s+["'][^"']*foundation\/diagnostic(?:\.ts)?["']/,
    /from\s+["'][^"']*analysis\/severity(?:\.ts)?["']/,
    /from\s+["'][^"']*rules\/registry(?:\.ts)?["']/,
    /from\s+["'][^"']*rules(?:\.ts)?["']/,
    /\bRuleCodes\b/,
  ];
  const bannedStrings = ["diagnostic(", "includeIssuesToDiagnostics", "getEffectiveRuleSeverity"];

  assert.deepEqual(collectPatternOffenders([includesPath], bannedImports), []);
  assert.deepEqual(collectLiteralOffenders([includesPath], bannedStrings), []);
  assert.equal(text.includes("foundation/diagnostic"), false);
});

test("include and suppression rule modules are not stubs", () => {
  const files = [
    path.join(ROOT, "packages", "analyzer", "src", "analysis", "rules", "include.ts"),
    path.join(ROOT, "packages", "analyzer", "src", "analysis", "rules", "suppression.ts"),
  ];
  const banned = [
    /create:\s*\(\)\s*=>\s*\(\{\s*\}\s*\)/s,
    /create\s*\(\s*context\s*\)\s*\{\s*return\s*\{\s*\};\s*\}/s,
  ];

  assert.deepEqual(
    collectPatternOffenders(
      files.filter((f) => fs.existsSync(f)),
      banned,
    ),
    [],
  );
});

test("ProjectHost remains async-only without host result casts", () => {
  const banned = [
    /host\.exists\([^)]*\)\s+as\s+boolean/,
    /host\.readFile\([^)]*\)\s+as\s+string/,
    /host\.stat\([^)]*\)\s+as\s+FileStat(?:\s*\|\s*undefined)?/,
    /host\.readDir\([^)]*\)\s+as\s+DirEntry\[\]/,
    /Promise<boolean>\s*\|\s*boolean/,
    /Promise<string>\s*\|\s*string/,
    /Promise<FileStat \| undefined>\s*\|\s*FileStat\s*\|\s*undefined/,
    /Promise<DirEntry\[]>\s*\|\s*DirEntry\[\]/,
  ];
  const offenders: Array<{ file: string; match: string }> = [];
  const projectSrc = path.join(ROOT, "packages", "project", "src");
  if (!fs.existsSync(projectSrc)) return;
  for (const file of walkFiles(projectSrc)) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of banned) {
      const match = text.match(pattern);
      if (match) offenders.push({ file: path.relative(ROOT, file), match: match[0] });
    }
  }
  assert.deepEqual(offenders, []);
});

test("semantic and project indexes are query-only outside their query modules", () => {
  const bannedPatterns = [
    {
      pattern:
        /semantic\.(documents|behaviorTreesById|nodeModelsById|mergedNodeModelsById|genericSubTreePorts|modelConflicts|conflicts|modelLayers)\b/,
      allowed: new Set([
        path.join(ROOT, "packages", "semantic", "src", "semantic-index.ts"),
        path.join(ROOT, "packages", "semantic", "src", "queries.ts"),
        path.join(ROOT, "packages", "semantic", "src", "internal-types.ts"),
      ]),
    },
    {
      pattern: /projectIndex\.(files|workspace|nodeModelsById|reachableDocuments)\b/,
      allowed: new Set([
        path.join(ROOT, "packages", "project", "src", "queries.ts"),
        path.join(ROOT, "packages", "project", "src", "internal-types.ts"),
      ]),
    },
  ];
  const offenders: Array<{ file: string; match: string }> = [];
  for (const file of readAllSourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const { pattern, allowed } of bannedPatterns) {
      const match = text.match(pattern);
      if (match && !allowed.has(file))
        offenders.push({ file: path.relative(ROOT, file), match: match[0] });
    }
  }
  assert.deepEqual(offenders, []);
});

test("public core barrel only imports allowed sources", () => {
  const coreIndexPath = path.join(ROOT, "packages", "core", "src", "index.ts");
  if (!fs.existsSync(coreIndexPath)) return;
  const coreIndex = readText(coreIndexPath);
  const allowedSources = [
    /^@btxml\/foundation$/,
    /^@btxml\/syntax$/,
    /^@btxml\/analyzer$/,
    /^@btxml\/config$/,
    /^\.\/check-bt-xml\.js$/,
  ];
  const imports = collectImportSpecifiers(coreIndexPath);

  assert.deepEqual(
    imports.filter((specifier) => !allowedSources.some((pattern) => pattern.test(specifier))),
    [],
  );
});

test("public barrels do not leak internal types", () => {
  const forbidden = [
    "BtDocument",
    "BtXmlElement",
    "BtXmlAttribute",
    "BtXmlNode",
    "buildBtModel",
    "BtModel",
    "SemanticIndex",
    "ProjectIndex",
    "ProjectHost",
    "TreeNodeModelDef",
    "PortDef",
    "ModelConflictGroup",
  ];
  const files = [
    path.join(ROOT, "packages", "core", "src", "index.ts"),
    path.join(ROOT, "packages", "language-service", "src", "index.ts"),
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = readText(file);
    assert.deepEqual(
      forbidden.filter((name) => text.includes(name)),
      [],
      relative(file),
    );
  }
});

test("@btxml/project package exports stay narrow", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "packages", "project", "package.json"), "utf8"),
  ) as { exports?: Record<string, unknown> };
  assert.deepEqual(Object.keys(packageJson.exports ?? {}).sort(), [".", "./node"]);
});

test("legacy core removal hygiene", () => {
  // repository must not contain packages/btxml-core
  assert.equal(fs.existsSync(path.join(ROOT, "packages", "btxml-core")), false);

  // tsconfig.json must not contain #core alias
  const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8"));
  const paths = tsconfig.compilerOptions?.paths ?? {};
  assert.equal("#core" in paths, false);
  assert.equal("#core/*" in paths, false);

  // all source files must not import #core or btxml-core
  const allFiles = readAllSourceFiles();
  const forbidden = [/#core/, /btxml-core/];
  const offenders = collectPatternOffenders(allFiles, forbidden);
  assert.deepEqual(offenders, []);
});

test("@btxml/core stays within its package boundary", () => {
  const coreDir = path.join(ROOT, "packages", "core", "src");
  const forbidden = ["@btxml/project", "@btxml/model", "@btxml/language-service"];
  const offenders: Array<{ file: string; import: string }> = [];

  for (const file of filesInDirIfExists(coreDir)) {
    for (const specifier of collectImportSpecifiers(file)) {
      if (forbidden.some((entry) => specifier.includes(entry))) {
        offenders.push({ file: relative(file), import: specifier });
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("@btxml/project sources stay within their boundary", () => {
  const projectDir = path.join(ROOT, "packages", "project", "src");
  const forbidden = ["@btxml/language-service", "@btxml/btxml-lsp"];
  const offenders: Array<{ file: string; import: string }> = [];

  for (const file of filesInDirIfExists(projectDir)) {
    for (const specifier of collectImportSpecifiers(file)) {
      if (forbidden.some((entry) => specifier.includes(entry))) {
        offenders.push({ file: relative(file), import: specifier });
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("@btxml/project root stays node-free", () => {
  const projectSrc = path.join(ROOT, "packages", "project", "src");

  for (const file of walkFiles(projectSrc)) {
    if (file.includes(`${path.sep}node${path.sep}`)) continue;
    if (file.endsWith(`${path.sep}node.ts`)) continue;

    const text = readText(file);
    assert.equal(text.includes("node:"), false, path.relative(ROOT, file));
  }
});

test("library packages must not import picocolors", () => {
  const libraryDirs = [
    "foundation",
    "script",
    "syntax",
    "model",
    "config",
    "semantic",
    "analyzer",
    "core",
    "project",
    "language-service",
  ];
  const offenders: Array<{ file: string; match: string }> = [];
  const pattern = /\bfrom\s+["']picocolors["']|import\s*\(\s*["']picocolors["']\s*\)/;

  for (const pkg of libraryDirs) {
    const pkgSrc = path.join(ROOT, "packages", pkg, "src");
    if (!fs.existsSync(pkgSrc)) continue;
    for (const file of walkFiles(pkgSrc)) {
      const text = fs.readFileSync(file, "utf8");
      const match = text.match(pattern);
      if (match) offenders.push({ file: path.relative(ROOT, file), match: match[0] });
    }
  }
  assert.deepEqual(offenders, []);
});

test("model sources do not import config modules", () => {
  const offenders: Array<{ file: string; match: string }> = [];
  const pattern = /config\/types\.ts|ResolvedModelsConfig|ResolvedBtxmlConfig/;
  const modelSrc = path.join(ROOT, "packages", "model", "src");
  if (!fs.existsSync(modelSrc)) return;
  for (const file of walkFiles(modelSrc)) {
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(pattern);
    if (match) offenders.push({ file: path.relative(ROOT, file), match: match[0] });
  }
  assert.deepEqual(offenders, []);
});

test("btxml may import picocolors only from render/color.ts", () => {
  const allowed = path.join(ROOT, "packages", "btxml", "src", "render", "color.ts");
  const offenders: Array<{ file: string; match: string }> = [];
  const pattern = /\bfrom\s+["']picocolors["']|import\s*\(\s*["']picocolors["']\s*\)/;
  const cliSrc = path.join(ROOT, "packages", "btxml", "src");
  if (!fs.existsSync(cliSrc)) return;
  for (const file of walkFiles(cliSrc)) {
    if (file === allowed) continue;
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(pattern);
    if (match) offenders.push({ file: path.relative(ROOT, file), match: match[0] });
  }
  assert.deepEqual(offenders, []);
});

test("new package dependency boundaries are respected when packages exist", () => {
  const packageRules = [
    {
      dir: path.join(ROOT, "packages", "foundation", "src"),
      label: "@btxml/foundation",
      forbidden: [/@btxml\//],
    },
    {
      dir: path.join(ROOT, "packages", "syntax", "src"),
      label: "@btxml/syntax",
      forbidden: [/@btxml\/model/, /@btxml\/config/, /@btxml\/analyzer/, /@btxml\/core/],
    },
    {
      dir: path.join(ROOT, "packages", "model", "src"),
      label: "@btxml/model",
      forbidden: [
        /@btxml\/config/,
        /@btxml\/analyzer/,
        /@btxml\/core/,
        /\/project\//,
        /\/rules(?:\.ts)?$/,
        /\/rules\//,
      ],
    },
    {
      dir: path.join(ROOT, "packages", "config", "src"),
      label: "@btxml/config",
      forbidden: [
        /@btxml\/analyzer/,
        /@btxml\/core/,
        /\/project\//,
        /\/rules(?:\.ts)?$/,
        /\/rules\//,
      ],
    },
    {
      dir: path.join(ROOT, "packages", "semantic", "src"),
      label: "@btxml/semantic",
      forbidden: [
        /@btxml\/analyzer/,
        /@btxml\/project/,
        /@btxml\/language-service/,
        /@btxml\/core/,
        /\/btxml\//,
        /\/btxml-lsp\//,
        /\/vscode-btxml\//,
      ],
    },
    {
      dir: path.join(ROOT, "packages", "analyzer", "src"),
      label: "@btxml/analyzer",
      forbidden: [
        /@btxml\/core/,
        /\/project\//,
        /\/language-service\//,
        /\/cli\//,
        /\/lsp\//,
        /\/vscode/i,
      ],
    },
    {
      dir: path.join(ROOT, "packages", "project", "src"),
      label: "@btxml/project",
      forbidden: [/@btxml\/core/, /\/language-service\//, /\/cli\//, /\/lsp\//, /\/vscode/i],
    },
    {
      dir: path.join(ROOT, "packages", "language-service", "src"),
      label: "@btxml/language-service",
      forbidden: [
        /@btxml\/core/,
        /\/btxml\//,
        /\/btxml-lsp\//,
        /\/vscode-btxml\//,
        /^vscode$/,
        /vscode-languageserver\/node/,
      ],
    },
  ];

  const offenders: Array<{ file: string; import: string; label: string }> = [];

  for (const rule of packageRules) {
    for (const file of filesInDirIfExists(rule.dir)) {
      for (const specifier of collectImportSpecifiers(file)) {
        if (rule.forbidden.some((pattern) => pattern.test(specifier))) {
          offenders.push({
            file: relative(file),
            import: specifier,
            label: rule.label,
          });
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("RuleCodes is not used as config lookup key in non-registry code", () => {
  const scanFiles = [
    ...walkFiles(path.join(ROOT, "packages", "analyzer", "src", "rules")),
    ...walkFiles(path.join(ROOT, "packages", "project", "src", "check")),
  ].filter((f) => fs.existsSync(f));

  const offenders: Array<{ file: string; line: number; match: string }> = [];
  const seen = new Set<string>();
  for (const file of scanFiles) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    let idx = 0;
    let parenDepth = 0;
    const contextStack: string[] = [];

    function enterContext(name: string, callLen: number) {
      contextStack.push(name);
      idx += callLen;
      parenDepth = 1;
    }

    while (idx < text.length) {
      if (parenDepth === 0) {
        if (text.slice(idx).startsWith("lookupRuleSeverity(")) {
          enterContext("lookupRuleSeverity", "lookupRuleSeverity(".length);
          continue;
        }
        if (text.slice(idx).startsWith("add(")) {
          enterContext("add", "add(".length);
          continue;
        }
        if (text.slice(idx).startsWith("diagnostic(")) {
          enterContext("diagnostic", "diagnostic(".length);
          continue;
        }
        if (text.slice(idx).startsWith("getRuleNameForCode(")) {
          enterContext("getRuleNameForCode", "getRuleNameForCode(".length);
          continue;
        }
      }

      if (text[idx] === "(") parenDepth++;
      if (text[idx] === ")") {
        parenDepth--;
        if (parenDepth <= 0) {
          contextStack.pop();
          parenDepth = 0;
        }
      }

      if (text.slice(idx).startsWith("RuleCodes.")) {
        const lineNum = text.slice(0, idx).split("\n").length;
        if (contextStack[contextStack.length - 1] === "lookupRuleSeverity") {
          const key = `${file}:${lineNum}`;
          if (!seen.has(key)) {
            seen.add(key);
            offenders.push({
              file: path.relative(ROOT, file),
              line: lineNum,
              match: "RuleCodes. inside lookupRuleSeverity",
            });
          }
        }
        idx += "RuleCodes.".length;
        continue;
      }

      idx++;
    }
  }
  assert.deepEqual(offenders, []);
});
