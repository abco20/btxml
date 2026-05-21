import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  outDir: "dist",
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  external: ["vscode"],
});
