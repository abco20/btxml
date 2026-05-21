import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const packageRoot = path.join(root, "packages");

remove(path.join(root, "dist"));
remove(path.join(root, ".vscode-test"));

for (const entry of fs.readdirSync(packageRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageDir = path.join(packageRoot, entry.name);
  remove(path.join(packageDir, "dist"));

  if (entry.name === "btxml" || entry.name === "vscode-btxml") {
    remove(path.join(packageDir, "schemas"));
  }
}

function remove(target) {
  fs.rmSync(target, { recursive: true, force: true });
}
