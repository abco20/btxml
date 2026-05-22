import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: {
    server: "src/main.ts",
  },
  define: {
    __BTXML_VERSION__: JSON.stringify(pkg.version),
  },
  format: ["cjs"],
  sourcemap: true,
  target: "node18",
  platform: "node",
  clean: true,
  outDir: "dist",
  noExternal: [/^@btxml\//, /^vscode-languageserver/],
});
