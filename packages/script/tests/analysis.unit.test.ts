import assert from "node:assert/strict";
import test from "node:test";
import { createTypeRegistry } from "@btxml/model";
import {
  analyzeScript,
  collectScriptEnums,
  collectScriptIdentifiers,
  createScriptEnvironment,
  isScriptTypeBoolCompatible,
  parseScript,
  scriptTypeFromTypeName,
} from "@btxml/script";

test("script analysis introduces := symbols in statement order", () => {
  const parsed = parseScript("A:=1; B:=A+2; C=A");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = analyzeScript({ program: parsed.program, attributeName: "code" });

  assert.deepEqual(
    result.introducedSymbols.map((symbol) => [symbol.name, symbol.type.kind]),
    [
      ["A", "number"],
      ["B", "number"],
    ],
  );
  assert.deepEqual(
    result.unknownIdentifiers.map((identifier) => identifier.name),
    [],
  );
});

test("collectScriptIdentifiers distinguishes reads, writes, and declarations", () => {
  const parsed = parseScript("A:=1; B=A; C+=A");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const identifiers = collectScriptIdentifiers(parsed.program);
  assert.deepEqual(
    identifiers.map((identifier) => [identifier.name, identifier.kind]),
    [
      ["A", "declare"],
      ["B", "write"],
      ["A", "read"],
      ["C", "readwrite"],
      ["A", "read"],
    ],
  );
});

test("createScriptEnvironment merges enums from augmentations", () => {
  const environment = createScriptEnvironment({
    augmentations: [{ version: 1, script: { enums: { RED: 1, BLUE: 2 } } }],
  });

  assert.equal(environment.enums.get("RED"), 1);
  assert.equal(environment.enums.get("BLUE"), 2);
  assert.deepEqual(
    [...collectScriptEnums([{ version: 1, script: { enums: { GREEN: 3 } } }])],
    [["GREEN", 3]],
  );
});

test("scriptTypeFromTypeName maps model types to script types", () => {
  const registry = createTypeRegistry([
    {
      version: 1,
      types: {
        Pose2D: {
          kind: "opaque",
          canonical: "my_robot/Pose2D",
        },
      },
    },
  ]);

  assert.deepEqual(scriptTypeFromTypeName(registry, "double"), { kind: "number" });
  assert.deepEqual(scriptTypeFromTypeName(registry, "std::string"), { kind: "string" });
  assert.deepEqual(scriptTypeFromTypeName(registry, "bool"), { kind: "bool" });
  assert.deepEqual(scriptTypeFromTypeName(registry, "Pose2D"), {
    kind: "custom",
    name: "Pose2D",
    canonical: "my_robot/Pose2D",
  });
});

test("script analysis infers final type and reports assignment/expression diagnostics", () => {
  const parsed = parseScript(
    "count:=1; count='x'; flag = missing; name:='x'; name -= 1; pose ? 1 : 0",
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const environment = createScriptEnvironment({
    symbols: [
      {
        name: "pose",
        type: { kind: "custom", name: "Pose2D", canonical: "my_robot/Pose2D" },
        source: { kind: "augmentation" },
        readable: true,
        writable: false,
      },
    ],
  });
  const result = analyzeScript({ program: parsed.program, environment, attributeName: "code" });

  assert.deepEqual(
    result.statementTypes.map((type) => type.kind),
    ["number", "error", "error", "string", "error", "number"],
  );
  assert.equal(result.finalType?.kind, "number");
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    [
      "variable-type-mismatch",
      "assignment-to-unknown-variable",
      "invalid-compound-assignment",
      "invalid-operand-type",
    ],
  );
  assert.deepEqual(
    result.unknownIdentifiers.map((identifier) => identifier.name),
    ["missing"],
  );
});

test("script analysis supports compound assignments and bool-compatible results conservatively", () => {
  const parsed = parseScript("count:=1; count += 2; count");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = analyzeScript({ program: parsed.program, attributeName: "code" });

  assert.deepEqual(
    result.statementTypes.map((type) => type.kind),
    ["number", "number", "number"],
  );
  assert.equal(result.finalType?.kind, "number");
  assert.equal(result.diagnostics.length, 0);
  assert.equal(isScriptTypeBoolCompatible(result.finalType ?? { kind: "error" }), true);
});
