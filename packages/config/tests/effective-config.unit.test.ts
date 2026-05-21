import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileUriToPath,
  getDefaultResolvedBtxmlConfig,
  getEffectiveConfigForFile,
  getEffectiveConfigForUri,
  isIncludedFilePath,
  isIncludedUri,
} from "@btxml/config";
import type { ResolvedBtxmlConfig } from "@btxml/config";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

function makeConfig(overrides: ResolvedBtxmlConfig["overrides"]): ResolvedBtxmlConfig {
  return {
    ...DEFAULT_RESOLVED_BTXML_CONFIG,
    overrides,
  };
}

test("no overrides returns base effective config", () => {
  const config = makeConfig([]);
  const effective = getEffectiveConfigForFile(config, "src/foo.xml");
  assert.equal(effective.linter.enabled, true);
  assert.equal(effective.formatter.xmlDeclaration, "always");
  assert.equal(effective.resolver.behaviorTreeIds, "workspace-unique");
});

test("one matching override applies", () => {
  const config = makeConfig([
    {
      files: ["src/**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, "src/foo.xml");
  assert.equal(effective.formatter.xmlDeclaration, "never");
  assert.equal(effective.linter.enabled, true);
});

test("non-matching override does not apply", () => {
  const config = makeConfig([
    {
      files: ["test/**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, "src/foo.xml");
  assert.equal(effective.formatter.xmlDeclaration, "always");
});

test("multiple matching overrides apply in order", () => {
  const config = makeConfig([
    {
      files: ["**/*.xml"],
      formatter: { indentWidth: 4 },
    },
    {
      files: ["src/**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, "src/foo.xml");
  assert.equal(effective.formatter.indentWidth, 4);
  assert.equal(effective.formatter.xmlDeclaration, "never");
});

test("last matching override wins", () => {
  const config = makeConfig([
    {
      files: ["src/**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
    {
      files: ["src/**/*.xml"],
      formatter: { xmlDeclaration: "always" },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, "src/foo.xml");
  assert.equal(effective.formatter.xmlDeclaration, "always");
});

test("override can change formatter settings", () => {
  const config = makeConfig([
    {
      files: ["**/*.xml"],
      formatter: { indentWidth: 4 },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, "foo.xml");
  assert.equal(effective.formatter.indentWidth, 4);
});

test("override can change linter rule severity", () => {
  const config = makeConfig([
    {
      files: ["**/*.xml"],
      linter: { rules: { "tree/no-unknown-subtree": "error" } },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, "foo.xml");
  assert.equal(effective.linter.rules["tree/no-unknown-subtree"], "error");
});

test("Windows path matching", () => {
  const config = makeConfig([
    {
      files: ["src/**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
  ]);
  const effective = getEffectiveConfigForFile(config, String.raw`src\foo\bar.xml`);
  assert.equal(effective.formatter.xmlDeclaration, "never");
});

test("URI path matching", () => {
  const config = makeConfig([
    {
      files: ["/src/**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
  ]);
  const effective = getEffectiveConfigForUri(config, "file:///src/foo/bar.xml");
  assert.equal(effective.formatter.xmlDeclaration, "never");
});

test("fileUriToPath decodes percent-encoded file URIs", () => {
  assert.equal(
    fileUriToPath("file:///workspace/behavior%20trees/main.xml"),
    "/workspace/behavior trees/main.xml",
  );
  assert.equal(fileUriToPath("file:///workspace/%E6%9C%A8.xml"), "/workspace/木.xml");
});

test("fileUriToPath normalizes Windows file URIs", () => {
  assert.equal(fileUriToPath("file:///C:/workspace/trees/main.xml"), "C:/workspace/trees/main.xml");
  assert.equal(
    fileUriToPath("file:///C:/workspace/behavior%20trees/main.xml"),
    "C:/workspace/behavior trees/main.xml",
  );
});

test("original config is not mutated", () => {
  const config = makeConfig([
    {
      files: ["**/*.xml"],
      formatter: { xmlDeclaration: "never" },
    },
  ]);
  getEffectiveConfigForFile(config, "foo.xml");
  assert.equal(config.formatter.xmlDeclaration, "always");
  assert.equal(config.overrides.length, 1);
  assert.equal(config.overrides[0].formatter?.xmlDeclaration, "never");
});

test("isIncludedFilePath matches include patterns and respects ignore", () => {
  const config = makeConfig([]);
  config.files.include = ["behavior_trees/**/*.xml", "**/*.tree.xml"];
  config.files.ignore = ["behavior_trees/generated/**"];

  assert.equal(isIncludedFilePath(config, "behavior_trees/main.xml"), true);
  assert.equal(isIncludedFilePath(config, "foo/main.tree.xml"), true);
  assert.equal(isIncludedFilePath(config, "behavior_trees/generated/main.xml"), false);
  assert.equal(isIncludedFilePath(config, "package.xml"), false);
});

test("isIncludedUri matches file URIs", () => {
  const config = makeConfig([]);
  config.files.include = ["/config/*.xml"];

  assert.equal(isIncludedUri(config, "file:///config/tree.xml"), true);
  assert.equal(isIncludedUri(config, "file:///package.xml"), false);
});

test("isIncludedUri matches Windows and percent-encoded file URIs", () => {
  const config = makeConfig([]);
  config.files.include = ["C:/workspace/behavior trees/**/*.xml"];

  assert.equal(isIncludedUri(config, "file:///C:/workspace/behavior%20trees/main.xml"), true);
  assert.equal(isIncludedUri(config, "file:///C:/workspace/other/main.xml"), false);
});
