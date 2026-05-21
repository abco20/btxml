import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { TreeNodeModelDef } from "@btxml/model";
import { buildLocalBtDocumentView } from "@btxml/semantic/ast-view";
import { parseBtXml } from "@btxml/syntax";

const nodeModels: TreeNodeModelDef[] = [
  {
    id: "Move",
    kind: "Action",
    ports: [],
  },
  {
    id: "Gate",
    kind: "Control",
    ports: [],
  },
  {
    id: "DecoratedMove",
    kind: "Decorator",
    ports: [],
  },
  {
    id: "MaybeMove",
    kind: "Action",
    ports: [],
  },
  {
    id: "MaybeMove",
    kind: "Condition",
    ports: [],
  },
];

const config = getDefaultResolvedBtxmlConfig();

test("TreeNodeView builds parent and child relationships", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move />
      <Fallback>
        <AlwaysSuccess />
      </Fallback>
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const sequence = view.behaviorTrees[0]?.rootNode;
  const fallback = sequence?.children[1];
  const alwaysSuccess = fallback?.children[0];

  assert.equal(sequence?.tagName, "Sequence");
  assert.equal(sequence?.parent, undefined);
  assert.equal(sequence?.behaviorTree, view.behaviorTrees[0]);
  assert.equal(sequence?.children.length, 2);
  assert.equal(fallback?.parent, sequence);
  assert.equal(alwaysSuccess?.parent, fallback);
  assert.deepEqual(
    view.nodes.map((node) => node.tagName),
    ["Sequence", "Move", "Fallback", "AlwaysSuccess"],
  );
});

test("TreeNodeView infers kinds from tag name and resolved model", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Control ID="Gate" />
      <Move />
      <DecoratedMove />
      <UnknownNode />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "kinds.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const gate = view.nodes.find((node) => node.tagName === "Control");
  const move = view.nodes.find((node) => node.tagName === "Move");
  const decoratedMove = view.nodes.find((node) => node.tagName === "DecoratedMove");
  const unknown = view.nodes.find((node) => node.tagName === "UnknownNode");

  assert.equal(gate?.kind, "Control");
  assert.equal(move?.kind, "Action");
  assert.equal(decoratedMove?.kind, "Decorator");
  assert.equal(unknown?.kind, "unknown");
});

test("TreeNodeView reports resolved unresolved and ambiguous model states", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move />
      <UnknownNode />
      <MaybeMove />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "models.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const move = view.nodes.find((node) => node.tagName === "Move");
  const unknown = view.nodes.find((node) => node.tagName === "UnknownNode");
  const maybeMove = view.nodes.find((node) => node.tagName === "MaybeMove");

  assert.equal(move?.model.status, "resolved");
  assert.equal(move?.model.model.id, "Move");
  assert.equal(unknown?.model.status, "unresolved");
  assert.equal(unknown?.model.nodeType, "UnknownNode");
  assert.equal(maybeMove?.model.status, "ambiguous");
  assert.equal(maybeMove?.model.nodeType, "MaybeMove");
  assert.equal(maybeMove?.model.candidates.length, 2);
});

test("buildBtDocumentView handles missing IDs and empty behavior trees", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree>
    <Move />
  </BehaviorTree>
  <BehaviorTree ID="Empty" />
</root>`,
    { uri: "empty.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });

  assert.equal(view.behaviorTrees.length, 2);
  assert.equal(view.behaviorTrees[0]?.id, undefined);
  assert.equal(view.behaviorTrees[0]?.rootNode?.tagName, "Move");
  assert.equal(view.behaviorTrees[1]?.id, "Empty");
  assert.equal(view.behaviorTrees[1]?.rootNode, undefined);
  assert.deepEqual(view.behaviorTrees[1]?.nodes, []);
});
