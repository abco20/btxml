import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { TreeNodeModelDef } from "@btxml/model";
import {
  buildLocalBtDocumentView,
  findPortBindingAtPosition,
  findTreeNodeAtPosition,
  getAllTreeNodes,
  getSubTreeCalls,
} from "@btxml/semantic/ast-view";
import { parseBtXml, positionAt } from "@btxml/syntax";

const nodeModels: TreeNodeModelDef[] = [
  {
    id: "Move",
    kind: "Action",
    ports: [{ source: "config", direction: "input", name: "goal", required: true }],
  },
  {
    id: "Child",
    kind: "SubTree",
    ports: [{ source: "config", direction: "input", name: "target", required: true }],
  },
  {
    id: "SubTree",
    kind: "SubTree",
    ports: [{ source: "builtin", direction: "input", name: "_autoremap", required: false }],
  },
];

const config = getDefaultResolvedBtxmlConfig();

test("buildBtDocumentView builds semantic BT views and queries", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move goal="{target}" />
      <SubTree ID="Child" _autoremap="true" target="{goal}" />
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
</root>`,
    { uri: "test.xml" },
  );
  assert.ok(parsed.document);
  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });

  assert.equal(view.behaviorTrees.length, 2);
  assert.equal(view.behaviorTrees[0].id, "Main");
  assert.equal(view.behaviorTrees[0].rootNode?.tagName, "Sequence");
  assert.equal(getAllTreeNodes(view).length, 4);

  const subtreeCall = getSubTreeCalls(view)[0];
  assert.equal(subtreeCall.id, "Child");
  assert.equal(subtreeCall.target.status, "resolved");
  assert.deepEqual(subtreeCall.portRemaps.map((binding) => binding.name).sort(), [
    "_autoremap",
    "target",
  ]);

  const subtreePos = positionAt(
    parsed.document.originalText,
    parsed.document.originalText.indexOf('SubTree ID="Child"') + 2,
  );
  const portPos = positionAt(
    parsed.document.originalText,
    parsed.document.originalText.indexOf('target="{goal}"') + 2,
  );
  assert.equal(findTreeNodeAtPosition(view, subtreePos)?.tagName, "SubTree");
  assert.equal(findPortBindingAtPosition(view, portPos)?.name, "target");
});

test("buildBtDocumentView resolves ports and blackboard references", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move goal="{target}"/><Unknown foo="{bar"/></BehaviorTree></root>`,
    { uri: "test.xml" },
  );
  assert.ok(parsed.document);
  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });

  const moveNode = view.nodes.find((node) => node.tagName === "Move");
  assert.ok(moveNode);
  assert.equal(moveNode.model.status, "resolved");
  assert.equal(moveNode.portBindings.length, 1);
  assert.equal(moveNode.portBindings[0].declaredPort.status, "resolved");
  assert.equal(moveNode.portBindings[0].blackboardReferences[0]?.key, "target");

  const unknownNode = view.nodes.find((node) => node.tagName === "Unknown");
  assert.ok(unknownNode);
  assert.equal(unknownNode.kind, "unknown");
  assert.equal(unknownNode.portBindings[0].declaredPort.status, "unknown-node-model");
  assert.equal(unknownNode.portBindings[0].blackboardReferences[0]?.syntax, "invalid");
});
