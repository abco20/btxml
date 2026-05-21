import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    extension: "src/extension.ts",
    "test/index": "src/test/index.ts",
  },
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  clean: true,
  sourcemap: true,
  target: "node18",
  platform: "node",
  external: ["vscode"],
  outDir: "dist",
  noExternal: [/^@btxml\//, /^vscode-languageclient/],
});
