import { spawnSync } from "node:child_process";

const steps = [
  ["quality", getPnpmCommand(), ["verify:quality"]],
  ["build", getPnpmCommand(), ["verify:build"]],
  ["generated", getPnpmCommand(), ["verify:generated"]],
  ["tests", process.execPath, ["scripts/verify/run-tests.mjs"]],
  ["packages", process.execPath, ["scripts/verify/packages.mjs", "--no-build"]],
  ["package vsix", process.execPath, ["scripts/package-vsix.mjs"]],
  ["vsix", process.execPath, ["scripts/verify/vsix.mjs"]],
  ["runtime", process.execPath, ["scripts/verify/runtime.mjs"]],
];

for (const [label, command, args] of steps) {
  console.log(`\n==> ${label}`);
  run(command, args);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}
