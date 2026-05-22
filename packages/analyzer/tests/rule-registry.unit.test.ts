import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RULES,
  RuleCodes,
  getDiagnosticCodeForRule,
  getRuleNameForCode,
  getRuleSeverity,
  isRuleName,
  normalizeRuleConfig,
} from "@btxml/analyzer/rules";

test("every rule slug in RULES is unique", () => {
  const slugs = Object.keys(RULES);
  const uniqueSlugs = new Set(slugs);
  assert.equal(uniqueSlugs.size, slugs.length);
});

test("new rule slugs are registered", () => {
  for (const slug of [
    "script/valid-syntax",
    "script/no-unknown-variable",
    "script/valid-result-type",
    "include/no-cycle",
    "include/no-missing-file",
    "include/no-outside-root",
    "model/no-blackboard-type-mismatch",
    "model/require-output-port-remap",
    "model/valid-port-name",
    "suppression/no-unused",
    "suppression/require-reason",
  ]) {
    assert.ok(slug in RULES, `Missing rule: ${slug}`);
  }
});

test("isRuleName identifies valid rules", () => {
  assert.equal(isRuleName("tree/no-duplicate-id-in-file"), true);
  assert.equal(isRuleName("unknown/rule"), false);
});

test("getDiagnosticCodeForRule returns correct code", () => {
  const rule1 = "tree/no-duplicate-id-in-file";
  assert.equal(getDiagnosticCodeForRule(rule1), "BT004_DUPLICATE_BEHAVIOR_TREE_ID");
  const rule2 = "include/no-cycle";
  assert.equal(getDiagnosticCodeForRule(rule2), "BT303_INCLUDE_CYCLE");
});

test("getRuleNameForCode returns correct name", () => {
  assert.equal(
    getRuleNameForCode("BT004_DUPLICATE_BEHAVIOR_TREE_ID"),
    "tree/no-duplicate-id-in-file",
  );
  assert.equal(getRuleNameForCode("BT303_INCLUDE_CYCLE"), "include/no-cycle");
  assert.equal(getRuleNameForCode("BT406_INVALID_COMPOUND_ASSIGNMENT"), "script/valid-assignment");
  assert.equal(
    getRuleNameForCode("BT410_SCRIPT_VARIABLE_TYPE_MISMATCH"),
    "script/valid-assignment",
  );
  assert.equal(
    getRuleNameForCode("BT411_INVALID_GLOBAL_BLACKBOARD_IDENTIFIER"),
    "script/valid-assignment",
  );
});

test("normalizeRuleConfig handles various formats", () => {
  assert.deepEqual(normalizeRuleConfig("error"), { severity: "error" });
  assert.deepEqual(normalizeRuleConfig("warn"), { severity: "warn" });
  assert.deepEqual(normalizeRuleConfig("off"), { severity: "off" });
  assert.deepEqual(normalizeRuleConfig(["error", { foo: 1 }]), {
    severity: "error",
    options: { foo: 1 },
  });
});

test("getRuleSeverity handles inheritance and defaults", () => {
  // severity of tree/no-duplicate-id-in-file is error by default
  assert.equal(getRuleSeverity({}, "tree/no-duplicate-id-in-file"), "error");
  assert.equal(
    getRuleSeverity({ "tree/no-duplicate-id-in-file": "warn" }, "tree/no-duplicate-id-in-file"),
    "warn",
  );
  assert.equal(
    getRuleSeverity({ "tree/no-duplicate-id-in-file": "off" }, "tree/no-duplicate-id-in-file"),
    "off",
  );

  const rulesConfig = { "tree/no-duplicate-id-in-file": "error" };
  assert.equal(getRuleSeverity(rulesConfig, "tree/no-duplicate-id-in-file"), "error");
});

test("all rule codes are valid and following BTxxx format", () => {
  for (const rule of Object.values(RULES)) {
    assert.match(rule.code, /^BT[0-9]{3}/);
  }
});

test("all rule codes match their enum in RuleCodes", () => {
  // This test checks if codes in RULES match RuleCodes from analyzer/rules.
  for (const rule of Object.values(RULES)) {
    const codeKey = Object.entries(RuleCodes).find(([, value]) => value === rule.code)?.[0];
    assert.ok(codeKey, `Missing RuleCodes entry for ${rule.code} (${rule.description})`);
    const entry = rule as (typeof RULES)[keyof typeof RULES] & { codes?: readonly string[] };
    for (const extraCode of entry.codes ?? []) {
      const extraKey = Object.entries(RuleCodes).find(([, value]) => value === extraCode)?.[0];
      assert.ok(extraKey, `Missing RuleCodes entry for ${extraCode} (${rule.description})`);
    }
  }
});
