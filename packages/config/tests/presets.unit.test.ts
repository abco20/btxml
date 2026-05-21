import assert from "node:assert/strict";
import { test } from "node:test";
import { getDefaultResolvedBtxmlConfig, normalizeBtxmlConfig } from "@btxml/config";
import { mergeResolvedBtxmlConfig } from "../src/merge.ts";
import { STRICT_CONFIG_OVERRIDES } from "../src/presets.ts";

test("strict overrides expose expected rule escalations", () => {
  assert.equal(STRICT_CONFIG_OVERRIDES.linter.rules["xml/require-btcpp-format"], "error");
  assert.deepEqual(STRICT_CONFIG_OVERRIDES.linter.rules["model/no-unknown-port"], [
    "error",
    { subTreePorts: "strict" },
  ]);
  assert.equal(STRICT_CONFIG_OVERRIDES.linter.rules["script/no-unknown-variable"], "error");
  assert.equal(STRICT_CONFIG_OVERRIDES.linter.rules["suppression/require-reason"], "warn");
  assert.equal(STRICT_CONFIG_OVERRIDES.linter.rules["model/valid-child-count"], "error");
});

test("merging presets produces a valid config", () => {
  const base = getDefaultResolvedBtxmlConfig();
  const overlay = normalizeBtxmlConfig({ strict: true }).config;

  const merged = mergeResolvedBtxmlConfig(base, overlay);
  assert.equal(merged.linter.enabled, true);
  // strict has error for no-unknown-port
  const rule = merged.linter.rules["model/no-unknown-port"];
  assert.equal(Array.isArray(rule) ? rule[0] : rule, "error");
});

test("default resolved config includes empty model augmentations", () => {
  const config = getDefaultResolvedBtxmlConfig();

  assert.deepEqual(config.models.augmentations, []);
});

test("merging with default is idempotent for normalized strict config", () => {
  const base = getDefaultResolvedBtxmlConfig();
  const overlay = normalizeBtxmlConfig({ strict: true }).config;

  const merged = mergeResolvedBtxmlConfig(base, overlay);
  assert.deepEqual(merged, overlay);
});
