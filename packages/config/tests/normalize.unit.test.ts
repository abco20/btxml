import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBtxmlConfig } from "@btxml/config";

test("fills defaults correctly", () => {
  const result = normalizeBtxmlConfig({});
  assert.equal(result.ok, true);
  const { config } = result;
  assert.deepEqual(config.files.include, ["**/*.xml"]);
  assert.deepEqual(config.files.ignore, [
    "build/**",
    "install/**",
    "log/**",
    "node_modules/**",
    ".git/**",
  ]);
  assert.equal(config.files.useGitignore, true);
  assert.equal(config.files.maxSize, 5242880);
  assert.deepEqual(config.resolver.includes.elements, [
    { name: "include", attribute: "path", base: "file" },
  ]);
  assert.equal(config.resolver.includes.maxFiles, 1000);
  assert.deepEqual(config.models.augmentations, []);
  assert.equal(config.formatter.xmlDeclaration, "always");
  assert.equal(config.formatter.lineEnding, "lf");
  assert.equal(config.linter.suppressions.inline, "allow");
  assert.deepEqual(config.overrides, []);
  assert.equal(config.linter.enabled, true);
});

test("normalize preserves configured model augmentations", () => {
  const result = normalizeBtxmlConfig({
    models: {
      augmentations: ["models/augment.xml"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.config.models.augmentations, ["models/augment.xml"]);
});

test("strict applies expected rule escalations", () => {
  const result = normalizeBtxmlConfig({ strict: true });
  assert.equal(result.ok, true);
  const { config, diagnostics } = result;
  assert.equal(diagnostics.length, 0);
  assert.equal(config.linter.rules["model/no-unknown-node"], "error");
  assert.equal(config.linter.rules["suppression/no-unused"], "error");
  assert.equal(config.linter.rules["suppression/require-reason"], "warn");
});

test("user config overrides strict", () => {
  const result = normalizeBtxmlConfig({
    strict: true,
    linter: { rules: { "model/no-unknown-node": "warn" } },
  });
  assert.equal(result.ok, true);
  const { config } = result;
  assert.equal(config.linter.rules["model/no-unknown-node"], "warn");
});

test("normalize keeps unknown rules and stays ok", () => {
  const result = normalizeBtxmlConfig({
    linter: {
      rules: {
        "tree/unknown-rule": "error" as const,
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.config.linter.rules["tree/unknown-rule"], "error");
});

test("normalize keeps invalid rule options and stays ok", () => {
  const result = normalizeBtxmlConfig({
    linter: {
      rules: {
        "model/no-unknown-port": ["warn", { subTreePorts: "invalid" }] as [
          "warn",
          Record<string, unknown>,
        ],
      },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("normalize rejects legacy fields via schema parsing", () => {
  const result = normalizeBtxmlConfig({
    extends: ["btxml:recommended"],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === "CFG002_UNKNOWN_CONFIG_FIELD"),
  );
});
