import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
    editor: "src/editor.ts",
    "editor-node": "src/editor-node.ts",
    semantic: "src/semantic.ts",
    syntax: "src/syntax.ts",
    model: "src/model.ts",
    config: "src/config.ts",
    rules: "src/rules.ts",
  },
  define: {
    __BTXML_VERSION__: JSON.stringify(pkg.version),
  },
  outDir: "dist",
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  noExternal: [/^@btxml\//],
  external: [
    "vscode",
    "vscode-languageclient",
    "vscode-languageserver",
    "vscode-languageserver-textdocument",
  ],
});
