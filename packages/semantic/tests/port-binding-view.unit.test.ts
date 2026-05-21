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
    ports: [
      { source: "config", direction: "input", name: "goal", required: true },
      { source: "config", direction: "output", name: "result", required: false },
    ],
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
  {
    id: "AmbiguousNode",
    kind: "Action",
    ports: [],
  },
  {
    id: "AmbiguousNode",
    kind: "Condition",
    ports: [],
  },
];

const config = getDefaultResolvedBtxmlConfig();

test("PortBindingView excludes structural attributes and keeps declared ports", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Move ID="Alias" goal="home" result="{status}" _skipIf="done" />
  </BehaviorTree>
</root>`,
    { uri: "ports.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const move = view.nodes[0];

  assert.equal(move?.portBindings.length, 2);
  assert.deepEqual(move?.portBindings.map((binding) => binding.name).sort(), ["goal", "result"]);
  assert.equal(move?.portBindings[0]?.declaredPort.status, "resolved");
  assert.equal(move?.portBindings[1]?.declaredPort.status, "resolved");
});

test("PortBindingView marks undeclared ports on resolved models", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Move goal="home" extra="unused" />
  </BehaviorTree>
</root>`,
    { uri: "undeclared.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const extra = view.nodes[0]?.portBindings.find((binding) => binding.name === "extra");

  assert.equal(extra?.declaredPort.status, "undeclared");
  assert.equal(extra?.declaredPort.name, "extra");
});

test("PortBindingView marks unknown node model when model is unresolved or ambiguous", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <UnknownNode foo="bar" />
    <AmbiguousNode foo="bar" />
  </BehaviorTree>
</root>`,
    { uri: "unknown-model.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });

  assert.equal(view.nodes[0]?.portBindings[0]?.declaredPort.status, "unknown-node-model");
  assert.equal(view.nodes[1]?.portBindings[0]?.declaredPort.status, "unknown-node-model");
});

test("PortBindingView distinguishes arbitrary subtree remaps from undeclared ports", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="LooseChild" _autoremap="true" target="{goal}" extra="unused" />
  </BehaviorTree>
</root>`,
    { uri: "subtree-ports.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const subtree = view.nodes[0];
  const autoremap = subtree?.portBindings.find((binding) => binding.name === "_autoremap");
  const target = subtree?.portBindings.find((binding) => binding.name === "target");
  const extra = subtree?.portBindings.find((binding) => binding.name === "extra");

  assert.equal(autoremap?.declaredPort.status, "resolved");
  assert.equal(target?.declaredPort.status, "allowed-arbitrary");
  assert.equal(extra?.declaredPort.status, "allowed-arbitrary");
});
