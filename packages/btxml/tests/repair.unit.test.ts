import assert from "node:assert/strict";
import test from "node:test";
import type { TreeNodeModelDef } from "@btxml/model";
import { parseBtXml } from "@btxml/syntax";
import { diffNodeModels } from "../src/repair/model-diff.ts";
import { collectNodeModelUsageEvidence } from "../src/repair/usage-evidence.ts";

test("diffNodeModels returns node-kind for Action vs Condition", () => {
  const action: TreeNodeModelDef = { id: "Test", kind: "Action", ports: [] };
  const condition: TreeNodeModelDef = { id: "Test", kind: "Condition", ports: [] };
  const diffs = diffNodeModels(action, condition);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "node-kind");
});

test("diffNodeModels returns port-type for string vs CustomPayload", () => {
  const a: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [
      {
        source: "inline-tree-nodes-model",
        direction: "input",
        name: "goal",
        type: "string",
        required: true,
      },
    ],
  };
  const b: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [
      {
        source: "inline-tree-nodes-model",
        direction: "input",
        name: "goal",
        type: "CustomPayload",
        required: true,
      },
    ],
  };
  const diffs = diffNodeModels(a, b);
  assert.ok(diffs.some((d) => d.kind === "port-type" && d.portName === "goal"));
});

test("diffNodeModels returns port-added and port-removed", () => {
  const a: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [{ source: "inline-tree-nodes-model", direction: "input", name: "a", required: true }],
  };
  const b: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [{ source: "inline-tree-nodes-model", direction: "input", name: "b", required: true }],
  };
  const diffs = diffNodeModels(a, b);
  assert.ok(diffs.some((d) => d.kind === "port-removed" && d.portName === "a"));
  assert.ok(diffs.some((d) => d.kind === "port-added" && d.portName === "b"));
});

test("diffNodeModels returns port-default for default value differences", () => {
  const a: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [
      {
        source: "inline-tree-nodes-model",
        direction: "input",
        name: "speed",
        required: false,
        defaultValue: "1.0",
      },
    ],
  };
  const b: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [
      {
        source: "inline-tree-nodes-model",
        direction: "input",
        name: "speed",
        required: false,
        defaultValue: "2.0",
      },
    ],
  };
  const diffs = diffNodeModels(a, b);
  assert.ok(diffs.some((d) => d.kind === "port-default" && d.portName === "speed"));
});

test("diffNodeModels includes description differences", () => {
  const a: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [
      {
        source: "inline-tree-nodes-model",
        direction: "input",
        name: "p",
        required: true,
        description: "first",
      },
    ],
  };
  const b: TreeNodeModelDef = {
    id: "Test",
    kind: "Action",
    ports: [
      {
        source: "inline-tree-nodes-model",
        direction: "input",
        name: "p",
        required: true,
        description: "second",
      },
    ],
  };
  const diffs = diffNodeModels(a, b);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "port-description");
});

test("collectNodeModelUsageEvidence excludes TreeNodesModel definitions", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main">
    <MoveBase goal="{target}" speed="1.0"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
      <input_port name="speed" type="double" default="1.0"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.equal(doc.ok, true);
  const evidence = collectNodeModelUsageEvidence({
    nodeId: "MoveBase",
    documents: doc.document ? [doc.document] : [],
    candidatePorts: ["goal", "speed"],
  });
  assert.equal(evidence.totalUsages, 1);
  assert.equal(evidence.byPort.goal.providedCount, 1);
  assert.equal(evidence.byPort.goal.blackboardReferenceCount, 1);
  assert.equal(evidence.byPort.speed.providedCount, 1);
  assert.equal(evidence.byPort.speed.literalValues["1.0"], 1);
});

test("collectNodeModelUsageEvidence counts SubTree ID attribute as usage", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main">
    <SubTree ID="SetTargetValue" prefix="target"/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="SetTargetValue">
      <input_port name="prefix" type="string"/>
    </SubTree>
  </TreeNodesModel>
</root>`);
  assert.equal(doc.ok, true);
  const evidence = collectNodeModelUsageEvidence({
    nodeId: "SetTargetValue",
    documents: doc.document ? [doc.document] : [],
    candidatePorts: ["prefix"],
  });
  assert.equal(evidence.totalUsages, 1);
  assert.equal(evidence.byPort.prefix.providedCount, 1);
});
