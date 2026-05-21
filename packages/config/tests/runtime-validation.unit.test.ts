import assert from "node:assert/strict";
import test from "node:test";

import { validateRawConfigRules } from "@btxml/analyzer/rules";
import { parseBtxmlConfig } from "@btxml/config";
import { assertInvalidRuntimeConfig, assertValidRuntimeConfig } from "./helpers.ts";

test("runtime validation accepts minimal v1 config", () => {
  assertValidRuntimeConfig({
    $schema: "./node_modules/btxml/schemas/btxml.config.schema.json",
    strict: true,
  });
});

test("runtime validation rejects old root include", () => {
  const diagnostics = assertInvalidRuntimeConfig(
    { include: ["**/*.xml"] },
    "CFG002_UNKNOWN_CONFIG_FIELD",
  );

  assert.ok(diagnostics.some((diagnostic) => diagnostic.path === "include"));
});

test("runtime validation rejects old formatter encoding property", () => {
  const diagnostics = assertInvalidRuntimeConfig(
    {
      formatter: {
        encoding: "UTF-16",
      },
    },
    "CFG002_UNKNOWN_CONFIG_FIELD",
  );

  assert.ok(diagnostics.some((diagnostic) => diagnostic.path === "formatter.encoding"));
});

test("runtime validation rejects files.associations", () => {
  const diagnostics = assertInvalidRuntimeConfig(
    {
      files: {
        associations: [
          {
            files: ["**/*.xml"],
            kind: "whatever",
          },
        ],
      },
    },
    "CFG002_UNKNOWN_CONFIG_FIELD",
  );

  assert.ok(diagnostics.some((diagnostic) => diagnostic.path === "files.associations"));
});

test("runtime validation rejects formatter.enabled", () => {
  assertInvalidRuntimeConfig(
    {
      formatter: {
        enabled: true,
      },
    },
    "CFG002_UNKNOWN_CONFIG_FIELD",
  );
});

test("runtime validation rejects invalid include base", () => {
  assertInvalidRuntimeConfig(
    {
      resolver: {
        includes: {
          elements: [
            {
              name: "include",
              attribute: "path",
              base: "current-file",
            },
          ],
        },
      },
    },
    "CFG003_INVALID_CONFIG_VALUE",
  );
});

test("rule validation rejects unknown rule key", () => {
  const parsed = parseBtxmlConfig({
    linter: {
      rules: {
        "typo/rule": "error",
      },
    },
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const diagnostics = validateRawConfigRules(parsed.value);

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "CFG010_UNKNOWN_RULE"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.path === "linter.rules.typo/rule"));
});

test("rule validation rejects invalid rule option", () => {
  const parsed = parseBtxmlConfig({
    linter: {
      rules: {
        "model/no-unknown-port": ["warn", { subTreePorts: "invalid" }],
        "model/no-blackboard-type-mismatch": ["warn", { allowStringEntryCompatibility: "invalid" }],
      },
    },
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const diagnostics = validateRawConfigRules(parsed.value);

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "CFG011_INVALID_RULE_OPTION"));
  assert.ok(
    diagnostics.some(
      (diagnostic) => diagnostic.path === "linter.rules.model/no-unknown-port.1.subTreePorts",
    ),
  );
  assert.ok(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.path ===
        "linter.rules.model/no-blackboard-type-mismatch.1.allowStringEntryCompatibility",
    ),
  );
});

test("runtime validation accepts new rule slugs", () => {
  assertValidRuntimeConfig({
    linter: {
      rules: {
        "model/require-port-name": "error",
        "model/no-duplicate-port-name": "error",
        "tree/no-duplicate-node-model-id": "error",
        "xml/no-unknown-top-level-element": "warn",
      },
    },
  });
});

test("runtime validation rejects old warning severity", () => {
  assertInvalidRuntimeConfig(
    {
      linter: {
        rules: {
          "model/no-unknown-port": "warning",
        },
      },
    },
    "CFG003_INVALID_CONFIG_VALUE",
  );
});

test("runtime validation rejects invalid formatter lineEnding", () => {
  assertInvalidRuntimeConfig(
    {
      formatter: {
        lineEnding: "native",
      },
    },
    "CFG003_INVALID_CONFIG_VALUE",
  );
});
