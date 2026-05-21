import path from "node:path";
import { runTests } from "@vscode/test-electron";

const root = process.cwd();
const extensionDevelopmentPath = path.resolve(root, "packages/vscode-btxml");
const extensionTestsPath = path.resolve(root, "packages/vscode-btxml/dist/test/index.cjs");
const testWorkspace = path.resolve(root, "packages/vscode-btxml/tests/fixtures/workspace");

async function main() {
  await runTests({
    version: "1.88.0",
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [testWorkspace, "--disable-extensions"],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
