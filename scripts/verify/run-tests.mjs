import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpmCommand = getPnpmCommand();

const steps = [
  ["architecture tests", "node", ["--import", "tsx", "--test", ...expandFiles("tests/architecture/**/*.test.ts")]],
  ["unit tests", "node", ["--import", "tsx", "--test", ...expandFiles("packages/*/tests/**/*.unit.test.ts")]],
  [
    "integration tests",
    "node",
    [
      "--import",
      "tsx",
      "--test",
      ...expandFiles("tests/integration/**/*.test.ts"),
      ...expandFiles("packages/*/tests/**/*.integration.test.ts"),
    ],
  ],
  ["e2e tests", "node", ["--import", "tsx", "--test", ...expandFiles("tests/e2e/**/*.e2e.test.ts")]],
  ["vscode tests", "node", ["--import", "tsx", "./packages/vscode-btxml/tests/run-vscode-tests.ts"]],
  ["docs examples", "node", ["scripts/verify-doc-examples.mjs"]],
  ["browser smoke", pnpmCommand, ["--dir", "tests/smoke/browser", "build"]],
  ["cli smoke", "node", ["packages/btxml/dist/cli.js", "--help"]],
  ["cli check help", "node", ["packages/btxml/dist/cli.js", "check", "--help"]],
  ["cli format help", "node", ["packages/btxml/dist/cli.js", "format", "--help"]],
];

for (const [label, command, args] of steps) {
  console.log(`\n==> ${label}`);
  run(command, args);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function expandFiles(pattern) {
  const matcher = globMatcher(pattern);
  const files = listFiles(rootDir).filter((file) => matcher(file));
  if (files.length === 0) {
    throw new Error(`No files matched ${pattern}`);
  }
  return files;
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }
      return entry.isFile() ? [relative(rootDir, entryPath).split(sep).join("/")] : [];
    })
    .sort();
}

function globMatcher(pattern) {
  const regexp = new RegExp(`^${globToRegExpSource(pattern)}$`);
  return (file) => regexp.test(file);
}

function globToRegExpSource(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*" && pattern[index + 2] === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += char.replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
    }
  }
  return source;
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}
