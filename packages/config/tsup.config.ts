import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/json-schema.ts", "src/zod.ts"],
  outDir: "dist",
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
});
