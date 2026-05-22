import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import {
  buildSemanticIndex,
  getModelDefinitionFacts,
  groupModelDefinitionsById,
  groupModelDefinitionsByKey,
} from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

test("getModelDefinitionFacts marks builtin and canonical sources", () => {
  const btDocument = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><MoveInline/></BehaviorTree><TreeNodesModel><Action ID="MoveInline"/></TreeNodesModel></root>',
    { uri: "tree.xml" },
  );
  const modelDocument = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="MoveExternal"/></TreeNodesModel>',
    { uri: "models.xml", kind: "model-xml" },
  );

  assert.ok(btDocument.document);
  assert.ok(modelDocument.document);

  const { index } = buildSemanticIndex([btDocument.document, modelDocument.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });

  const facts = getModelDefinitionFacts(index);

  const builtinSequence = facts.find((fact) => fact.id === "Sequence" && fact.kind === "Control");
  assert.ok(builtinSequence);
  assert.equal(builtinSequence?.isBuiltin, true);
  assert.equal(builtinSequence?.isCanonicalModelFile, false);

  const inlineModel = facts.find((fact) => fact.id === "MoveInline");
  assert.ok(inlineModel);
  assert.equal(inlineModel?.sourceKind, "inline-tree-nodes-model");
  assert.equal(inlineModel?.isBuiltin, false);
  assert.equal(inlineModel?.isCanonicalModelFile, false);

  const externalModel = facts.find((fact) => fact.id === "MoveExternal");
  assert.ok(externalModel);
  assert.equal(externalModel?.sourceKind, "external-tree-nodes-model");
  assert.equal(externalModel?.isBuiltin, false);
  assert.equal(externalModel?.isCanonicalModelFile, true);
});

test("groupModelDefinitionsById and groupModelDefinitionsByKey group as expected", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Foo"/><Condition ID="Foo"/></TreeNodesModel></root>',
    { uri: "conflict.xml" },
  );
  assert.ok(parsed.document);

  const { index } = buildSemanticIndex([parsed.document], {
    config: {
      ...DEFAULT_RESOLVED_BTXML_CONFIG,
      models: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG.models,
        builtins: [],
      },
    },
  });

  const facts = getModelDefinitionFacts(index).filter((fact) => fact.id === "Foo");
  const byId = groupModelDefinitionsById(facts);
  const byKey = groupModelDefinitionsByKey(facts);

  assert.equal(byId.get("Foo")?.length, 2);
  assert.equal(byKey.size, 2);
  assert.deepEqual(
    [...byKey.values()].map((group) => group.length),
    [1, 1],
  );
});
