import { spawnSync } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

run(["--filter", "@btxml/lsp", "run", "build"]);
run(["-r", "--filter", "./packages/*", "--filter", "!@btxml/lsp", "run", "build"]);

function run(args) {
  const result = spawnSync(pnpmCommand, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
