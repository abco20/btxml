import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { WorkspaceEdit } from "@btxml/foundation";
import { normalizeConfigNodeModel } from "@btxml/model";
import { buildSemanticIndex } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";
import { buildModelConflictRepairGroups } from "../src/repair/model-conflicts.ts";
import type { GroupRepairAction, ModelConflictGroup } from "../src/repair/types.ts";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

function jsonRepairDocument(uri: string, originalText: string) {
  return {
    uri,
    kind: "generic-xml" as const,
    isBtXml: false,
    nodes: [],
    diagnostics: [],
    originalText,
  };
}

function oneLineRange(start: number, end: number) {
  return {
    start: { line: 0, character: start, offset: start },
    end: { line: 0, character: end, offset: end },
  };
}

test("buildModelConflictRepairGroups groups BT012 conflicts by nodeId", () => {
  const docA = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`);
  const docB = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="CustomPayload"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(docA.document);
  assert.ok(docB.document);
  const docs = [docA.document, docB.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].nodeId, "MoveBase");
  assert.ok(groups[0].codes.includes("BT012_CONFLICTING_NODE_MODEL"));
  assert.equal(groups[0].signatures.length, 2);
  assert.ok(groups[0].actions.some((a: GroupRepairAction) => a.id === "match-signature-A"));
  assert.ok(groups[0].actions.some((a: GroupRepairAction) => a.id === "match-signature-B"));
});

test("buildModelConflictRepairGroups groups BT107 default-only conflicts", () => {
  const docA = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double" default="1.0"/>
    </Action>
  </TreeNodesModel>
</root>`);
  const docB = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double" default="2.0"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(docA.document);
  assert.ok(docB.document);
  const docs = [docA.document, docB.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].nodeId, "MoveBase");
  assert.ok(groups[0].codes.includes("BT107_CONFLICTING_PORT_DEFAULT"));
  assert.equal(groups[0].signatures.length, 2);
});

test("buildModelConflictRepairGroups produces BT006 for duplicate model ID in same document", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
    <Action ID="MoveBase">
      <input_port name="goal" type="CustomPayload"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  assert.ok(
    groups.some((g: ModelConflictGroup) => g.codes.includes("BT006_DUPLICATE_NODE_MODEL_ID")),
  );
  const bt006 = groups.find((g: ModelConflictGroup) =>
    g.codes.includes("BT006_DUPLICATE_NODE_MODEL_ID"),
  );
  assert.ok(bt006);
  assert.equal(bt006.nodeId, "MoveBase");
  assert.equal(bt006.kind, "duplicate-model-id");
  assert.ok(!bt006.actions.some((a: GroupRepairAction) => a.kind === "match-signature"));
  assert.ok(bt006.actions.some((a: GroupRepairAction) => a.kind === "keep-model-definition"));
});

test("buildModelConflictRepairGroups produces BT008 for duplicate port name in same model", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double" default="1.0"/>
      <input_port name="speed" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  assert.ok(groups.some((g: ModelConflictGroup) => g.codes.includes("BT008_DUPLICATE_PORT_NAME")));
  const bt008 = groups.find((g: ModelConflictGroup) =>
    g.codes.includes("BT008_DUPLICATE_PORT_NAME"),
  );
  assert.ok(bt008);
  assert.equal(bt008.nodeId, "MoveBase");
  assert.equal(bt008.portName, "speed");
  assert.equal(bt008.displayName, "MoveBase.speed");
  assert.equal(bt008.kind, "duplicate-port-name");
  assert.ok(!bt008.actions.some((a: GroupRepairAction) => a.kind === "match-signature"));
  assert.ok(bt008.actions.some((a: GroupRepairAction) => a.kind === "keep-port-definition"));
});

test("buildModelConflictRepairGroups suppresses BT012 when local duplicate exists", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
    <Action ID="MoveBase">
      <input_port name="goal" type="CustomPayload"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  assert.ok(groups.some((g: ModelConflictGroup) => g.kind === "duplicate-model-id"));
  assert.ok(!groups.some((g: ModelConflictGroup) => g.kind === "model-signature-conflict"));
});

test("buildModelConflictRepairGroups does not emit empty match-signature actions", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  for (const group of groups) {
    for (const action of group.actions) {
      if (action.kind === "match-signature") {
        assert.ok(action.workspaceEdits.length > 0, `action ${action.id} should have edits`);
      }
    }
  }
});

test("BT008 interleaved duplicate port keeps correct variant", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" />
      <input_port name="speed" type="double" />
      <input_port name="timeout" />
      <input_port name="speed" type="string" />
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const bt008 = groups.find((g) => g.codes.includes("BT008_DUPLICATE_PORT_NAME"));
  assert.ok(bt008, "expected BT008 group");
  assert.equal(bt008.nodeId, "MoveBase");
  assert.equal(bt008.portName, "speed");
  assert.equal(bt008.displayName, "MoveBase.speed");
  assert.equal(bt008.signatures.length, 2);
  const actionB = bt008.actions.find((a) => a.id === "keep-port-B");
  assert.ok(actionB, "expected keep-port-B action");
  const deletedRanges = actionB.workspaceEdits.flatMap((e: WorkspaceEdit) => e.edits);
  assert.equal(deletedRanges.length, 1);
  const keepDefB = bt008.signatures.find((s) => s.id === "B")?.definitions[0];
  assert.ok(keepDefB);
  assert.ok(keepDefB.range);
  const keepOffset = keepDefB.range.start.offset;
  assert.ok(
    !deletedRanges.some(
      (e: unknown) =>
        (e as { range?: { start?: { offset?: number } } })?.range?.start?.offset === keepOffset,
    ),
  );
});

test("BT008 three duplicate ports produces A/B/C variants", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double" />
      <input_port name="speed" type="string" />
      <input_port name="speed" type="float" />
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const bt008 = groups.find((g) => g.codes.includes("BT008_DUPLICATE_PORT_NAME"));
  assert.ok(bt008, "expected BT008 group");
  assert.equal(bt008.signatures.length, 3);
  assert.ok(bt008.actions.some((a) => a.id === "keep-port-A"));
  assert.ok(bt008.actions.some((a) => a.id === "keep-port-B"));
  assert.ok(bt008.actions.some((a) => a.id === "keep-port-C"));
});

test("BT008 identical duplicate ports shows single signature with multiple locations", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="speed" type="double" />
      <input_port name="speed" type="double" />
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const bt008 = groups.find((g) => g.codes.includes("BT008_DUPLICATE_PORT_NAME"));
  assert.ok(bt008, "expected BT008 group");
  assert.equal(bt008.signatures.length, 1);
  assert.ok(bt008.signatures[0]);
  assert.equal(bt008.signatures[0].definitions.length, 2);
  assert.ok(bt008.actions.some((a) => a.title.includes("Keep the first")));
});

test("usage 0 displays no usage evidence available", () => {
  const docA = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="SetTargetValue">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`);
  const docB = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="SetTargetValue">
      <input_port name="goal" type="CustomPayload"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(docA.document);
  assert.ok(docB.document);
  const docs = [docA.document, docB.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const group = groups.find((g) => g.nodeId === "SetTargetValue");
  assert.ok(group);
  assert.equal(group.usageEvidence.totalUsages, 0);
});

test("BT006 different duplicate model keep variant A deletes other", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
    <Action ID="MoveBase">
      <input_port name="goal" type="CustomPayload"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const bt006 = groups.find((g) => g.codes.includes("BT006_DUPLICATE_NODE_MODEL_ID"));
  assert.ok(bt006, "expected BT006 group");
  assert.equal(bt006.signatures.length, 2);
  const actionA = bt006.actions.find((a) => a.id === "keep-definition-A");
  assert.ok(actionA, "expected keep-definition-A action");
  assert.equal(actionA.applicable, true);
  const deletedRanges = actionA.workspaceEdits.flatMap((e: WorkspaceEdit) => e.edits);
  assert.equal(deletedRanges.length, 1);
  const keepDefA = bt006.signatures.find((s) => s.id === "A")?.definitions[0];
  assert.ok(keepDefA);
  assert.ok(keepDefA.range);
  const keepOffset = keepDefA.range.start.offset;
  assert.ok(
    !deletedRanges.some(
      (e: unknown) =>
        (e as { range?: { start?: { offset?: number } } })?.range?.start?.offset === keepOffset,
    ),
  );
});

test("BT006 identical duplicate model deletes duplicate copy", () => {
  const doc = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(doc.document);
  const docs = [doc.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const bt006 = groups.find((g) => g.codes.includes("BT006_DUPLICATE_NODE_MODEL_ID"));
  assert.ok(bt006, "expected BT006 group");
  assert.equal(bt006.signatures.length, 1);
  assert.ok(bt006.signatures[0]);
  assert.equal(bt006.signatures[0].definitions.length, 2);
  assert.ok(bt006.actions.some((a) => a.title.includes("Keep the first")));
});

test("repair actions set applicable correctly", () => {
  const docA = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="string"/>
    </Action>
  </TreeNodesModel>
</root>`);
  const docB = parseBtXml(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="CustomPayload"/>
    </Action>
  </TreeNodesModel>
</root>`);
  assert.ok(docA.document);
  assert.ok(docB.document);
  const docs = [docA.document, docB.document];
  const workspace = buildSemanticIndex(docs, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({ documents: docs, workspace });
  const group = groups[0];
  assert.ok(group);
  const writable = group.actions.filter((a) => a.applicable);
  const manualOrSkip = group.actions.filter((a) => !a.applicable);
  assert.ok(writable.length > 0, "expected writable actions");
  assert.ok(manualOrSkip.every((a) => a.kind === "skip"));
});

test("models.definitions conflicts are included in repair groups and actions", () => {
  const doc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal="x"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>`,
    { uri: "tree.xml" },
  );
  assert.ok(doc.document);
  const jsonText = `{"nodes":{"Move":{"kind":"Action","ports":{"goal":{"direction":"input","type":"CustomPayload"}}}}}`;
  const jsonStart = jsonText.indexOf(`{"kind"`);
  const jsonEnd = jsonText.lastIndexOf("}");
  const model = normalizeConfigNodeModel("Move", {
    kind: "Action",
    ports: { goal: { direction: "input", type: "CustomPayload" } },
  });
  const nodeDefinitionModel = {
    ...model,
    source: "node-definition-file" as const,
    editable: true,
    uri: "nodes.json",
    range: oneLineRange(jsonStart, jsonEnd),
  };
  const workspace = buildSemanticIndex([doc.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: [nodeDefinitionModel],
  }).index;

  const groups = buildModelConflictRepairGroups({
    documents: [doc.document, jsonRepairDocument("nodes.json", jsonText)],
    workspace,
  });
  const group = groups.find((g) => g.nodeId === "Move");
  assert.ok(group);
  assert.ok(group.definitions.some((d) => d.sourceKind === "node-definition-file"));
  assert.ok(group.actions.some((a) => a.workspaceEdits.some((e) => e.uri === "nodes.json")));
});

test("models.definitions without range stay in repair groups without write actions", () => {
  const doc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal="x"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>`,
    { uri: "tree.xml" },
  );
  assert.ok(doc.document);
  const model = normalizeConfigNodeModel("Move", {
    kind: "Action",
    ports: { goal: { direction: "input", type: "CustomPayload" } },
  });
  const nodeDefinitionModel = {
    ...model,
    source: "node-definition-file" as const,
    editable: true,
    uri: "nodes.json",
  };
  const workspace = buildSemanticIndex([doc.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: [nodeDefinitionModel],
  }).index;

  const groups = buildModelConflictRepairGroups({
    documents: [doc.document, jsonRepairDocument("nodes.json", "{}")],
    workspace,
  });
  const group = groups.find((g) => g.nodeId === "Move");
  assert.ok(group);
  assert.ok(group.definitions.some((d) => d.sourceKind === "node-definition-file"));
  assert.equal(
    group.actions.some((a) => a.workspaceEdits.some((e) => e.uri === "nodes.json")),
    false,
  );
});

test("config-inline conflicts are included in repair groups", () => {
  const doc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal="x"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>`,
    { uri: "tree.xml" },
  );
  assert.ok(doc.document);
  const workspace = buildSemanticIndex([doc.document], {
    config: {
      ...DEFAULT_RESOLVED_BTXML_CONFIG,
      models: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG.models,
        inline: {
          Move: {
            kind: "Action",
            ports: { goal: { direction: "input", type: "CustomPayload" } },
          },
        },
      },
    },
  }).index;

  const groups = buildModelConflictRepairGroups({
    documents: [doc.document],
    workspace,
  });
  const group = groups.find((g) => g.nodeId === "Move");
  assert.ok(group);
  assert.ok(group.definitions.some((d) => d.sourceKind === "config"));
});

test("generic SubTree ports do not create repair groups", () => {
  const doc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><SubTree ID="SubTree"><input_port name="_autoremap" type="bool" default="false"/></SubTree></TreeNodesModel></root>`,
  );
  assert.ok(doc.document);
  const workspace = buildSemanticIndex([doc.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({
    documents: [doc.document],
    workspace,
  });
  assert.equal(
    groups.some((g) => g.nodeId === "SubTree" || g.displayName.includes("SubTree._autoremap")),
    false,
  );
});

test("built-in models are not editable repair targets", () => {
  const doc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Control ID="Parallel"><input_port name="custom" type="int"/></Control></TreeNodesModel></root>`,
  );
  assert.ok(doc.document);
  const workspace = buildSemanticIndex([doc.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({
    documents: [doc.document],
    workspace,
  });
  for (const group of groups) {
    for (const action of group.actions) {
      for (const edit of action.workspaceEdits) {
        assert.equal(edit.uri.includes("btcpp_default_models.xml"), false);
        assert.equal(edit.uri.includes("generated/btcpp-v4-builtins.ts"), false);
      }
    }
  }
});

test("canonical model-files sync adds match-canonical action", () => {
  const inlineDoc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>`,
    { uri: "tree.xml" },
  );
  const canonicalDoc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>`,
    { uri: "models.xml", kind: "model-xml" },
  );

  assert.ok(inlineDoc.document);
  assert.ok(canonicalDoc.document);

  const documents = [inlineDoc.document, canonicalDoc.document];
  const workspace = buildSemanticIndex(documents, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({
    documents,
    workspace,
    options: {
      canonicalSource: "model-files",
      canonicalMode: "sync",
      includeConventionGroups: true,
    },
  });

  const group = groups.find((entry) => entry.nodeId === "Move");
  assert.ok(group);
  assert.ok(group.actions.some((action) => action.kind === "match-canonical-model-file"));
});

test("single-source equivalent duplicates are included with canonical dedupe action", () => {
  const inlineDoc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>`,
    { uri: "tree.xml" },
  );
  const canonicalDoc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"/></TreeNodesModel>`,
    { uri: "models.xml", kind: "model-xml" },
  );

  assert.ok(inlineDoc.document);
  assert.ok(canonicalDoc.document);

  const documents = [inlineDoc.document, canonicalDoc.document];
  const workspace = buildSemanticIndex(documents, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({
    documents,
    workspace,
    options: {
      includeConventionGroups: true,
      convention: "single-source",
      canonicalSource: "model-files",
      canonicalMode: "dedupe",
    },
  });

  const group = groups.find((entry) => entry.nodeId === "Move");
  assert.ok(group);
  assert.ok(group.codes.includes("BT122_DUPLICATE_MODEL_DEFINITION"));
  assert.ok(group.actions.some((action) => action.kind === "keep-canonical-model-file-definition"));
});

test("canonical source does not add canonical actions for kind conflicts", () => {
  const inlineDoc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Foo/></BehaviorTree><TreeNodesModel><Condition ID="Foo"/></TreeNodesModel></root>`,
    { uri: "tree.xml" },
  );
  const canonicalDoc = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Foo"/></TreeNodesModel>`,
    { uri: "models.xml", kind: "model-xml" },
  );

  assert.ok(inlineDoc.document);
  assert.ok(canonicalDoc.document);

  const documents = [inlineDoc.document, canonicalDoc.document];
  const workspace = buildSemanticIndex(documents, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  }).index;
  const groups = buildModelConflictRepairGroups({
    documents,
    workspace,
    options: {
      canonicalSource: "model-files",
      canonicalMode: "sync",
      includeConventionGroups: true,
    },
  });

  const group = groups.find((entry) => entry.nodeId === "Foo");
  assert.ok(group);
  assert.equal(
    group.actions.some(
      (action) =>
        action.kind === "match-canonical-model-file" ||
        action.kind === "keep-canonical-model-file-definition",
    ),
    false,
  );
});
