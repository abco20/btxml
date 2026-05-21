import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/main.ts",
  },
  format: ["cjs"],
  sourcemap: true,
  target: "node18",
  platform: "node",
  clean: true,
  outDir: "dist",
  noExternal: [/^@btxml\//, /^vscode-languageserver/],
});
