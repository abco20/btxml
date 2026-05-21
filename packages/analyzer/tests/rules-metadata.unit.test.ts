import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { RuleCodes, RuleMetadataByCode, listRuleSlugs } from "@btxml/analyzer/rules";

test("all RuleCodes have metadata", () => {
  for (const code of Object.values(RuleCodes)) {
    assert.ok(RuleMetadataByCode[code], code);
  }
});

test("rule metadata has the fields needed for docs generation", () => {
  for (const code of Object.values(RuleCodes)) {
    const metadata = RuleMetadataByCode[code];
    assert.ok(metadata.defaultSeverity, code);
    assert.ok(metadata.description, code);
  }
});

test("docs/rules.md covers every rule slug in RULES", () => {
  const docsPath = path.join(process.cwd(), "docs", "rules.md");
  if (!fs.existsSync(docsPath)) return;
  const docs = fs.readFileSync(docsPath, "utf8");
  for (const slug of listRuleSlugs()) {
    assert.match(docs, new RegExp(slug.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("RULE_CODES does not include BT104_INVALID_NODE_ARITY", () => {
  assert.equal(
    Object.values(RuleCodes).includes(
      "BT104_INVALID_NODE_ARITY" as unknown as (typeof RuleCodes)[keyof typeof RuleCodes],
    ),
    false,
  );
});

test("augmentation parse diagnostics are registered in rule metadata", () => {
  assert.deepEqual(
    {
      json: RuleMetadataByCode[RuleCodes.InvalidAugmentationJson],
      schema: RuleMetadataByCode[RuleCodes.InvalidAugmentationSchema],
    },
    {
      json: {
        code: RuleCodes.InvalidAugmentationJson,
        defaultSeverity: "error",
        title: "Invalid augmentation JSON",
        description: "Model augmentation files must parse as JSON.",
        suppressible: false,
      },
      schema: {
        code: RuleCodes.InvalidAugmentationSchema,
        defaultSeverity: "error",
        title: "Invalid augmentation schema",
        description: "Model augmentation files must match the expected schema.",
        suppressible: false,
      },
    },
  );
});
