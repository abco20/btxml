import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { TreeNodeModelDef } from "@btxml/model";
import { buildLocalBtDocumentView, getSubTreeCalls } from "@btxml/semantic/ast-view";
import { parseBtXml } from "@btxml/syntax";

const nodeModels: TreeNodeModelDef[] = [
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

test("SubTreeCallView reuses semantic subtree resolution and preserves port remaps", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" _autoremap="true" target="{goal}" />
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess />
  </BehaviorTree>
</root>`,
    { uri: "subtree.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const subtreeCall = getSubTreeCalls(view)[0];

  assert.equal(subtreeCall?.id, "Child");
  assert.equal(subtreeCall?.node.tagName, "SubTree");
  assert.equal(subtreeCall?.target.status, "resolved");
  assert.equal(subtreeCall?.target.kind, "behavior-tree");
  assert.equal(subtreeCall?.target.behaviorTree.id, "Child");
  assert.deepEqual(subtreeCall?.target, subtreeCall?.node.usage.subtree?.target);
  assert.deepEqual(subtreeCall?.portRemaps.map((binding) => binding.name).sort(), [
    "_autoremap",
    "target",
  ]);
});

test("SubTreeCallView marks missing targets unresolved", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Missing" target="x" />
    <SubTree _autoremap="true" />
  </BehaviorTree>
</root>`,
    { uri: "subtree-missing.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config, nodeModels });
  const [missingTarget, missingId] = getSubTreeCalls(view);

  assert.equal(missingTarget?.target.status, "unresolved");
  assert.equal(missingTarget?.target.id, "Missing");
  assert.deepEqual(missingTarget?.target, missingTarget?.node.usage.subtree?.target);
  assert.equal(missingId?.id, undefined);
  assert.equal(missingId?.target.status, "unresolved");
  assert.equal(missingId?.target.id, undefined);
  assert.deepEqual(missingId?.target, missingId?.node.usage.subtree?.target);
});
