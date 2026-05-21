import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const extensionDir = path.join(root, "packages/vscode-btxml");
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));
const output = path.resolve(extensionDir, `btxml-${pkg.version}.vsix`);

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vsce", "package", "--no-dependencies", "--out", output],
  {
    cwd: extensionDir,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
