import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRawConfigRules } from "@btxml/analyzer/rules";
import type { RawBtxmlConfig } from "@btxml/config";

test("rule validation reports normalize-time rule issues separately", () => {
  const diagnostics = validateRawConfigRules({
    linter: {
      rules: {
        "tree/unknown-rule": "error",
        "model/no-unknown-port": ["warn", { subTreePorts: "invalid" }],
        "model/no-blackboard-type-mismatch": ["warn", { allowStringEntryCompatibility: "invalid" }],
      },
    },
  } as RawBtxmlConfig);

  assert.ok(diagnostics.some((d) => d.code === "CFG010_UNKNOWN_RULE"));
  assert.ok(diagnostics.some((d) => d.code === "CFG011_INVALID_RULE_OPTION"));
});
