import assert from "node:assert/strict";
import test from "node:test";
import { RuleCodes } from "@btxml/analyzer/rules";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import { normalizeConfigNodeModel } from "@btxml/model";
import { buildSemanticIndex, getEffectiveNodeModels, getModelConflicts } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

function semanticConfig(models: Partial<typeof DEFAULT_RESOLVED_BTXML_CONFIG.models>) {
  return {
    ...DEFAULT_RESOLVED_BTXML_CONFIG,
    models: { ...DEFAULT_RESOLVED_BTXML_CONFIG.models, ...models },
  };
}

test("model layers: config-inline overrides node-definition-file", () => {
  const definition = normalizeConfigNodeModel("Move", {
    kind: "Action",
    ports: { goal: { direction: "input", type: "int" } },
  });
  const result = buildSemanticIndex([], {
    config: semanticConfig({
      builtins: [],
      inline: { Move: { kind: "Action", ports: { goal: { direction: "input", type: "Pose2D" } } } },
    }),
    models: [{ ...definition, source: "node-definition-file" }],
  });

  assert.equal(
    getEffectiveNodeModels(result.index).find((model) => model.id === "Move")?.ports[0]?.type,
    "Pose2D",
  );
  assert.equal(
    getModelConflicts(result.index).some((fact) => fact.code === RuleCodes.ConflictingNodeModel),
    false,
  );
});

test("model layers: node-definition-file overrides xml-tree-nodes-model", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);
  const definition = normalizeConfigNodeModel("Move", {
    kind: "Action",
    ports: { goal: { direction: "input", type: "int" } },
  });
  const result = buildSemanticIndex([parsed.document], {
    config: semanticConfig({ builtins: [] }),
    models: [{ ...definition, source: "node-definition-file" }],
  });

  assert.equal(
    getEffectiveNodeModels(result.index).find((model) => model.id === "Move")?.ports[0]?.type,
    "int",
  );
  assert.equal(
    getModelConflicts(result.index).some((fact) => fact.code === RuleCodes.ConflictingNodeModel),
    false,
  );
});

test("model layers: xml-tree-nodes-model overrides builtin", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Sequence"/></TreeNodesModel></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);
  const result = buildSemanticIndex([parsed.document], {
    config: semanticConfig({ builtins: ["btcpp-v4"] }),
  });

  assert.equal(
    getEffectiveNodeModels(result.index).find((model) => model.id === "Sequence")?.kind,
    "Action",
  );
  assert.equal(
    getModelConflicts(result.index).some((fact) => fact.code === RuleCodes.ConflictingNodeModel),
    false,
  );
});

test("model layers: explicit versioned builtin set contributes builtins", () => {
  const result = buildSemanticIndex([], {
    config: semanticConfig({ builtins: ["btcpp-v4.6.2"] }),
  });

  assert.equal(
    getEffectiveNodeModels(result.index).some((model) => model.id === "Sequence"),
    true,
  );
  assert.equal(
    getEffectiveNodeModels(result.index).some((model) => model.id === "Parallel"),
    true,
  );
});

test("model layers: same precedence incompatible definitions produce conflict diagnostic", () => {
  const first = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const second = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(first.document);
  assert.ok(second.document);

  const result = buildSemanticIndex([first.document, second.document], {
    config: semanticConfig({ builtins: [] }),
  });

  assert.equal(
    getModelConflicts(result.index).some((fact) => fact.code === RuleCodes.ConflictingNodeModel),
    true,
  );
});

test("model layers: overridden lower precedence differences do not produce conflict diagnostic", () => {
  const first = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const second = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(first.document);
  assert.ok(second.document);

  const result = buildSemanticIndex([first.document, second.document], {
    config: semanticConfig({
      builtins: [],
      inline: { Move: { kind: "Action", ports: { goal: { direction: "input", type: "bool" } } } },
    }),
  });

  assert.equal(
    getEffectiveNodeModels(result.index).find((model) => model.id === "Move")?.ports[0]?.type,
    "bool",
  );
  assert.equal(
    getModelConflicts(result.index).some((fact) => fact.code === RuleCodes.ConflictingNodeModel),
    false,
  );
});
