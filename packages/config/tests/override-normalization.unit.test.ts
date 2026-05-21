import assert from "node:assert/strict";
import test from "node:test";

import { getEffectiveConfigForFile, normalizeBtxmlConfig } from "@btxml/config";

test("formatter override is partial and preserves unspecified fields", () => {
  const result = normalizeBtxmlConfig({
    formatter: {
      indentWidth: 2,
      xmlDeclaration: "always",
    },
    overrides: [
      {
        files: ["generated/**"],
        formatter: {
          indentWidth: 4,
        },
      },
    ],
  });

  assert.equal(result.ok, true);

  const effective = getEffectiveConfigForFile(result.config, "generated/tree.xml");

  assert.equal(effective.formatter.indentWidth, 4);
  assert.equal(effective.formatter.xmlDeclaration, "always");
});

test("linter override is partial and does not re-enable linter", () => {
  const result = normalizeBtxmlConfig({
    linter: {
      enabled: false,
      rules: {
        "model/no-unknown-port": "warn",
      },
    },
    overrides: [
      {
        files: ["legacy/**"],
        linter: {
          rules: {
            "model/no-unknown-port": "off",
          },
        },
      },
    ],
  });

  assert.equal(result.ok, true);

  const effective = getEffectiveConfigForFile(result.config, "legacy/tree.xml");

  assert.equal(effective.linter.enabled, false);
  assert.equal(effective.linter.rules["model/no-unknown-port"], "off");
});

test("formatter and linter overrides can be combined", () => {
  const result = normalizeBtxmlConfig({
    overrides: [
      {
        files: ["special/**"],
        formatter: { indentWidth: 4 },
        linter: { rules: { "model/no-unknown-port": "off" } },
      },
    ],
  });

  const effective = getEffectiveConfigForFile(result.config, "special/tree.xml");

  assert.equal(effective.formatter.indentWidth, 4);
  assert.equal(effective.linter.rules["model/no-unknown-port"], "off");
});
