import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentModel, buildDocumentModelResult } from "@btxml/model";
import { parseBtXml } from "@btxml/syntax";

test("buildDocumentModelResult extracts behavior trees, subtree refs, and blackboard refs", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child" target="{goal}"/></BehaviorTree><TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool">Enabled flag</input_port></Action></TreeNodesModel></root>`,
  );
  assert.equal(parsed.ok, true);
  assert.ok(parsed.document);
  if (!parsed.document) throw new Error("parsed.document is null");
  const result = buildDocumentModelResult(parsed.document);
  assert.deepEqual(
    result.model.behaviorTrees.map((tree) => tree.id),
    ["main"],
  );
  assert.equal(result.model.subtreeReferences[0].id, "child");
  assert.deepEqual(result.model.blackboardReferences[0], {
    raw: "{goal}",
    key: "goal",
    scope: "local",
    identity: "local:goal",
    syntax: "braced",
    attributeName: "target",
    uri: parsed.document.uri,
    range: result.model.blackboardReferences[0]?.range,
  });
  assert.deepEqual(result.diagnostics, []);
});

test("buildDocumentModel returns a pure AST-free DTO result", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child" target="{goal}"/></BehaviorTree><TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool">Enabled flag</input_port></Action></TreeNodesModel></root>`,
  );
  assert.ok(parsed.document);
  if (!parsed.document) throw new Error("parsed.document is null");
  const diagnosticsBefore = [...parsed.document.diagnostics];
  const result = buildDocumentModel(parsed.document);
  const model = result.model;
  assert.equal(model.kind, "bt-xml");
  assert.equal("root" in model, false);
  assert.equal("element" in model.behaviorTrees[0], false);
  assert.equal("element" in model.treeNodesModel[0], false);
  assert.equal("element" in model.subtreeReferences[0], false);
  assert.equal("element" in model.blackboardReferences[0], false);
  assert.deepEqual(parsed.document.diagnostics, diagnosticsBefore);
  assert.deepEqual(result.diagnostics, []);
});

test("buildDocumentModel reports duplicate node model IDs without mutating the document", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="A"/><Condition ID="A"/></TreeNodesModel></root>`,
  );
  assert.ok(parsed.document);
  if (!parsed.document) throw new Error("parsed.document is null");
  const diagnosticsBefore = [...parsed.document.diagnostics];
  const result = buildDocumentModelResult(parsed.document);
  assert.equal(result.model.treeNodesModel.length, 2);
  assert.equal(result.diagnostics.length, 1);
  assert.deepEqual(parsed.document.diagnostics, diagnosticsBefore);
});

test("buildDocumentModelResult computes blackboard reference range from raw source when entities precede it", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main">
    <Action ID="Node" port="a &amp; b {@foo}"/>
  </BehaviorTree>
</root>`;
  const parsed = parseBtXml(text);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.document);
  if (!parsed.document) throw new Error("parsed.document is null");

  const result = buildDocumentModelResult(parsed.document);
  const reference = result.model.blackboardReferences[0];
  assert.ok(reference);
  assert.equal(reference?.raw, "{@foo}");
  assert.equal(reference?.key, "foo");
  assert.equal(
    reference
      ? text.slice(reference.range?.start.offset ?? 0, reference.range?.end.offset ?? 0)
      : "",
    "{@foo}",
  );
});
