import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "browser",
  target: "es2022",
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
});
