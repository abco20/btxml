import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RULES, validateRawConfigRules } from "@btxml/analyzer/rules";
import { getEffectiveConfigForFile, normalizeBtxmlConfig, parseBtxmlConfig } from "@btxml/config";
import { Ajv } from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "schemas", "btxml.config.schema.json"), "utf8"),
);

const ajv = new Ajv({ strict: false });
const validate = ajv.compile(schema);

function assertValid(config: unknown) {
  const valid = validate(config);
  if (!valid) {
    console.error("Validation errors:", JSON.stringify(validate.errors, null, 2));
  }
  assert.equal(valid, true);
}

function assertInvalid(config: unknown) {
  const valid = validate(config);
  assert.equal(valid, false);
  assert.notEqual(validate.errors, null);
  assert.notEqual(validate.errors, undefined);
}

// Valid cases

test("minimal config", () => {
  assertValid({
    $schema: "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json",
  });
});

test("strict true config", () => {
  assertValid({
    strict: true,
  });
});

test("strict with user rule override", () => {
  assertValid({
    strict: true,
    linter: {
      rules: {
        "model/no-unknown-node": "warn",
      },
    },
  });
});

test("resolver entrypoints accepts string[]", () => {
  assertValid({
    resolver: {
      entrypoints: ["behavior_trees/main.xml"],
    },
  });
});

test("override with files + linter + formatter", () => {
  assertValid({
    overrides: [
      {
        files: ["legacy/**/*.xml"],
        linter: {
          rules: {
            "model/no-unknown-node": "off",
          },
        },
        formatter: {
          indentWidth: 4,
        },
      },
    ],
  });
});

test("rule config as tuple with options", () => {
  assertValid({
    linter: {
      rules: {
        "model/no-unknown-port": ["error", { subTreePorts: "strict" }],
      },
    },
  });
});

test("inline model definition", () => {
  assertValid({
    models: {
      inline: {
        MyAction: {
          kind: "Action",
          ports: {},
        },
      },
    },
  });
});

test("schema rule names match RULES registry", () => {
  const enumRules = schema.properties.linter.properties.rules.propertyNames.enum;
  assert.deepEqual(
    enumRules,
    Object.keys(RULES).sort((a, b) => a.localeCompare(b)),
  );
});

// Invalid cases

test("unknown root field is rejected", () => {
  assertInvalid({
    include: ["**/*.xml"],
  });
});

test("unknown nested field is rejected", () => {
  assertInvalid({
    formatter: {
      encoding: "UTF-8",
    },
  });
});

test("old resolve.modelFiles is rejected", () => {
  assertInvalid({
    resolve: {
      modelFiles: ["models.xml"],
    },
  });
});

test("extends is rejected", () => {
  assertInvalid({
    extends: ["btxml:recommended"],
  });
});

test("files.associations is rejected", () => {
  assertInvalid({
    files: {
      associations: [{ files: ["**/*.xml"], kind: "model" }],
    },
  });
});

test("resolver.scope is rejected", () => {
  assertInvalid({
    resolver: {
      scope: "workspace",
    },
  });
});

test("resolver.entrypoints object form is rejected", () => {
  assertInvalid({
    resolver: {
      entrypoints: [{ file: "main.xml", tree: "MainTree" }],
    },
  });
});

test("formatter.enabled is rejected", () => {
  assertInvalid({
    formatter: {
      enabled: true,
    },
  });
});

test("linter.suppressions.requireReason is rejected", () => {
  assertInvalid({
    linter: {
      suppressions: {
        requireReason: true,
      },
    },
  });
});

test("linter.suppressions.reportUnused is rejected", () => {
  assertInvalid({
    linter: {
      suppressions: {
        reportUnused: "warn",
      },
    },
  });
});

test("overrides[].ignore is rejected", () => {
  assertInvalid({
    overrides: [{ files: ["legacy/**"], ignore: ["**/*.generated.xml"] }],
  });
});

test("overrides[].resolver is rejected", () => {
  assertInvalid({
    overrides: [
      {
        files: ["legacy/**"],
        resolver: {
          behaviorTreeIds: "allow-ambiguous",
        },
      },
    ],
  });
});

test("overrides[].models is rejected", () => {
  assertInvalid({
    overrides: [
      {
        files: ["legacy/**"],
        models: {
          files: ["legacy/models.xml"],
        },
      },
    ],
  });
});

test("overrides[].linter.enabled is rejected", () => {
  assertInvalid({
    overrides: [
      {
        files: ["legacy/**"],
        linter: {
          enabled: false,
        },
      },
    ],
  });
});

test("overrides[].linter.baseline is rejected", () => {
  assertInvalid({
    overrides: [
      {
        files: ["legacy/**"],
        linter: {
          baseline: "legacy-baseline.json",
        },
      },
    ],
  });
});

test("models.builtins unknown value is rejected", () => {
  assertInvalid({
    models: {
      builtins: ["unknown-builtin"],
    },
  });
});

test("files.maxSize <= 0 is rejected", () => {
  assertInvalid({
    files: {
      maxSize: 0,
    },
  });
});

test("resolver.includes.maxDepth <= 0 is rejected", () => {
  assertInvalid({
    resolver: {
      includes: {
        maxDepth: 0,
      },
    },
  });
});

test("resolver.includes.maxFiles <= 0 is rejected", () => {
  assertInvalid({
    resolver: {
      includes: {
        maxFiles: 0,
      },
    },
  });
});

test("formatter.indentWidth <= 0 is rejected", () => {
  assertInvalid({
    formatter: {
      indentWidth: 0,
    },
  });
});

test("formatter.indentWidth > 8 is rejected", () => {
  assertInvalid({
    formatter: {
      indentWidth: 9,
    },
  });
});

test("invalid severity in rule is rejected", () => {
  assertInvalid({
    linter: {
      rules: {
        "model/no-unknown-port": "fatal",
      },
    },
  });
});

test("invalid formatter.xmlDeclaration is rejected", () => {
  assertInvalid({
    formatter: {
      xmlDeclaration: "sometimes",
    },
  });
});

test("override without files is rejected", () => {
  assertInvalid({
    overrides: [
      {
        linter: {
          enabled: false,
        },
      },
    ],
  });
});

test("invalid rule tuple with wrong length is rejected", () => {
  assertInvalid({
    linter: {
      rules: {
        "model/no-unknown-port": ["warn"],
      },
    },
  });
});

test("invalid rule tuple with wrong types is rejected", () => {
  assertInvalid({
    linter: {
      rules: {
        "model/no-unknown-port": [{}, "warn"],
      },
    },
  });
});

test("invalid include base is rejected", () => {
  assertInvalid({
    resolver: {
      includes: {
        elements: [{ name: "include", attribute: "path", base: "unknown" }],
      },
    },
  });
});

test("unknown rule key is rejected by schema", () => {
  assertInvalid({
    linter: {
      rules: {
        "model/nonexistent-rule": "error",
      },
    },
  });
});

// Runtime validation tests

test("config parsing accepts minimal v1 config", () => {
  const result = parseBtxmlConfig({
    $schema: "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.diagnostics.length, 0);
  }
});

test("strict=true applies strict escalations", () => {
  const result = normalizeBtxmlConfig({ strict: true });
  assert.equal(result.ok, true);

  const expectedRules: Record<string, unknown> = {
    "xml/require-btcpp-format": "error",
    "xml/no-unknown-top-level-element": "error",
    "model/no-unknown-node": "error",
    "model/no-childless-control-shape-mismatch": "error",
    "model/no-leaf-block-shape": "error",
    "suppression/no-unused": "error",
    "suppression/require-reason": "warn",
  };

  for (const [rule, severity] of Object.entries(expectedRules)) {
    assert.equal(result.config.linter.rules[rule], severity);
  }

  assert.deepEqual(result.config.linter.rules["model/no-unknown-port"], [
    "error",
    { subTreePorts: "strict" },
  ]);
});

test("user rule config overrides strict rule severity", () => {
  const result = normalizeBtxmlConfig({
    strict: true,
    linter: {
      rules: {
        "model/no-unknown-node": "warn",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.config.linter.rules["model/no-unknown-node"], "warn");
});

test("file override config overrides strict rule severity", () => {
  const result = normalizeBtxmlConfig({
    strict: true,
    overrides: [
      {
        files: ["legacy/**/*.xml"],
        linter: {
          rules: {
            "model/no-unknown-node": "off",
          },
        },
      },
    ],
  });

  assert.equal(result.ok, true);
  const effective = getEffectiveConfigForFile(result.config, "legacy/tree.xml");
  assert.equal(effective.linter.rules["model/no-unknown-node"], "off");
});

test("config parsing rejects old root include", () => {
  const result = parseBtxmlConfig({
    include: ["**/*.xml"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((d) => d.code === "CFG002_UNKNOWN_CONFIG_FIELD"));
    assert.ok(result.diagnostics.some((d) => d.message.includes("include")));
  }
});

test("config parsing rejects unknown nested field", () => {
  const result = parseBtxmlConfig({
    files: { unknownField: true },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((d) => d.code === "CFG002_UNKNOWN_CONFIG_FIELD"));
    assert.ok(result.diagnostics.some((d) => d.message.includes("unknownField")));
  }
});

test("config parsing reports diagnostic path", () => {
  const result = parseBtxmlConfig({
    files: { unknownField: true },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const diag = result.diagnostics.find((d) => d.code === "CFG002_UNKNOWN_CONFIG_FIELD");
    assert.ok(diag);
    assert.ok(diag?.path);
    assert.equal(typeof diag?.path, "string");
    assert.ok(diag?.path?.includes("unknownField"));
  }
});

test("config parsing allows unknown rule names when schema shape is valid", () => {
  const result = parseBtxmlConfig({
    linter: {
      rules: {
        "unknown/rule": "error",
      },
    },
  });

  assert.equal(result.ok, true);
});

test("rule validation rejects unknown rule names", () => {
  const diagnostics = validateRawConfigRules({
    linter: {
      rules: {
        "unknown/rule": "error",
      },
    },
  });

  assert.equal(diagnostics[0]?.code, "CFG010_UNKNOWN_RULE");
});
