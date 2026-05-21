import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/ast-view.ts"],
  outDir: "dist",
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
});
