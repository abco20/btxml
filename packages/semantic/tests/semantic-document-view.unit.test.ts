import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { TreeNodeModelDef } from "@btxml/model";
import {
  buildSemanticDocumentView,
  buildSemanticIndex,
  buildSemanticNodeIdentityIndex,
  findSemanticNodeAtPosition,
  findSemanticPortBindingAtPosition,
  getAllSemanticTreeNodes,
  getSemanticSubTreeCalls,
  getSemanticTreeNodesForBehaviorTree,
  selectDefaultBehaviorTree,
} from "@btxml/semantic";
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

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

function normalizeSubTreeTarget(
  target: ReturnType<typeof buildSemanticDocumentView>["subtreeCalls"][number]["target"],
) {
  if (target.status === "unresolved") return target;
  if (target.status === "resolved" && target.kind === "node-model") {
    return {
      status: target.status,
      kind: target.kind,
      modelId: target.modelId,
      model: {
        id: target.model.id,
        kind: target.model.kind,
        ports: target.model.ports.map((port) => port.name),
      },
    };
  }
  if (target.status === "resolved") {
    return {
      status: target.status,
      kind: target.kind,
      treeId: target.treeId,
      behaviorTree: {
        id: target.behaviorTree.id,
        uri: target.behaviorTree.uri,
      },
    };
  }
  return {
    status: target.status,
    candidates: target.candidates,
    behaviorTrees: target.behaviorTrees.map((behaviorTree) => ({
      id: behaviorTree.id,
      uri: behaviorTree.uri,
    })),
    definitions: target.definitions.map((definition) => definition.id),
  };
}

function normalizeSemanticViewSnapshot(view: ReturnType<typeof buildSemanticDocumentView>) {
  return {
    uri: view.uri,
    kind: view.kind,
    mainTreeToExecute: view.mainTreeToExecute,
    mainTreeToExecuteRange: view.mainTreeToExecuteRange,
    behaviorTrees: view.behaviorTrees.map((behaviorTree) => ({
      id: behaviorTree.id,
      rootNodeId: behaviorTree.rootNodeId,
      nodeIds: behaviorTree.nodeIds,
    })),
    nodes: view.nodes.map((node) => ({
      nodeId: node.nodeId,
      path: node.path,
      instancePath: node.instancePath,
      tagName: node.tagName,
      nodeType: node.nodeType,
      usageTagForm: node.usage.tagForm,
      usageModelStatus: node.usage.model.status,
      name: node.name,
      idAttr: node.idAttr,
      parentNodeId: node.parentNodeId,
      childNodeIds: node.childNodeIds,
      behaviorTreeId: node.behaviorTreeId,
      attributes: node.attributes.map((attribute) => attribute.name),
      identityCandidates: node.identityCandidates,
      portBindings: node.portBindings.map((binding) => ({
        portName: binding.portName,
        resolutionStatus: binding.resolution.status,
        usageStatus: binding.usage.status,
      })),
    })),
    subtreeCalls: view.subtreeCalls.map((call) => ({
      nodeId: call.nodeId,
      callId: call.callId,
      target: normalizeSubTreeTarget(call.target),
      portBindings: call.portBindings.map((binding) => ({
        portName: binding.portName,
        resolutionStatus: binding.resolution.status,
        usageStatus: binding.usage.status,
      })),
    })),
  };
}

test("buildSemanticDocumentView builds AST-free serializable semantic DTOs", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move goal="{target}" />
      <SubTree ID="Child" _autoremap="true" target="{goal}" />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "main.xml" },
  );
  const child = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Child"><AlwaysSuccess /></BehaviorTree>
</root>`,
    { uri: "child.xml" },
  );
  assert.ok(main.document);
  assert.ok(child.document);

  const { index } = buildSemanticIndex([main.document, child.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(main.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });

  assert.equal(view.uri, "main.xml");
  assert.equal(view.kind, "bt-xml");
  assert.equal(view.mainTreeToExecute, undefined);
  assert.equal(view.mainTreeToExecuteRange, undefined);
  assert.equal(view.behaviorTrees.length, 1);
  assert.equal(getAllSemanticTreeNodes(view).length, 3);
  assert.equal("document" in view, false);
  assert.equal("element" in view.behaviorTrees[0], false);
  assert.equal("parent" in view.nodes[0], false);
  assert.equal(view.nodes[0]?.usage.tagName, view.nodes[0]?.tagName);
  assert.equal(
    view.nodes[0]?.portBindings[0]?.usage.attribute.name,
    view.nodes[0]?.portBindings[0]?.portName,
  );
  assert.doesNotThrow(() => JSON.stringify(view));

  const subtree = view.nodes.find((node) => node.tagName === "SubTree");
  assert.ok(subtree);
  assert.equal(subtree?.nodeId, "bt:0/node:0.1");
  assert.deepEqual(subtree?.path, [0, 1]);
  assert.deepEqual(subtree?.childNodeIds, []);
  assert.equal(subtree?.behaviorTreeId, "Main");
  assert.equal(subtree?.idAttr, "Child");
  assert.equal(subtree?.instancePath, "Main/0:Sequence/1:Child");
  assert.ok(subtree?.attributes.some((attribute) => attribute.name === "ID"));
  assert.equal(subtree?.usage.tagForm, "subtree");
  assert.equal(subtree?.usage.subtree?.target.status, "resolved");

  const goalBinding = view.nodes.find((node) => node.tagName === "Move")?.portBindings[0];
  assert.equal(goalBinding?.resolution.status, "resolved");
  assert.equal(goalBinding?.usage.status, "resolved");

  const subtreeCall = getSemanticSubTreeCalls(view)[0];
  assert.equal(subtreeCall?.callId, "Child");
  assert.equal(subtreeCall?.target.status, "resolved");
  assert.equal(
    subtreeCall?.target.status === "resolved" ? subtreeCall.target.kind : undefined,
    "behavior-tree",
  );
  assert.equal(
    subtreeCall?.target.status === "resolved" && subtreeCall.target.kind === "behavior-tree"
      ? subtreeCall.target.behaviorTree.uri
      : undefined,
    "child.xml",
  );
});

test("buildSemanticDocumentView preserves allowed-arbitrary subtree remaps", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="LooseChild" remap="{goal}" />
  </BehaviorTree>
</root>`,
    { uri: "allowed-arbitrary.xml" },
  );
  const child = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="LooseChild"><AlwaysSuccess /></BehaviorTree></root>`,
    { uri: "child.xml" },
  );
  assert.ok(main.document);
  assert.ok(child.document);

  const { index } = buildSemanticIndex([main.document, child.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(main.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  const binding = view.subtreeCalls[0]?.portBindings.find((port) => port.portName === "remap");

  assert.equal(binding?.usage.status, "allowed-arbitrary");
  assert.equal(binding?.resolution.status, "allowed-arbitrary");
});

test("buildSemanticDocumentView respects explicit subtree port policy", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="LooseChild" remap="{goal}" />
  </BehaviorTree>
</root>`,
    { uri: "strict-subtree-ports.xml" },
  );
  const child = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="LooseChild"><AlwaysSuccess /></BehaviorTree></root>`,
    { uri: "child.xml" },
  );
  assert.ok(main.document);
  assert.ok(child.document);

  const { index } = buildSemanticIndex([main.document, child.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(main.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    policy: { unknownSubTreePorts: "reject" },
  });
  const binding = view.subtreeCalls[0]?.portBindings.find((port) => port.portName === "remap");

  assert.equal(binding?.usage.status, "undeclared");
  assert.equal(binding?.resolution.status, "undeclared");
});

test("buildSemanticDocumentView emits GUI-friendly subtree target DTO snapshots", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <SubTree ID="LocalChild" />
      <SubTree ID="SharedChild" />
      <SubTree ID="ModelOnly" />
      <SubTree ID="Missing" />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "main.xml" },
  );
  const localChild = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="LocalChild"><AlwaysSuccess /></BehaviorTree>
  <BehaviorTree ID="SharedChild"><AlwaysSuccess /></BehaviorTree>
</root>`,
    { uri: "main.xml" },
  );
  const externalChild = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="SharedChild"><AlwaysFailure /></BehaviorTree>
</root>`,
    { uri: "shared.xml" },
  );
  assert.ok(main.document);
  assert.ok(localChild.document);
  assert.ok(externalChild.document);

  const { index } = buildSemanticIndex(
    [main.document, localChild.document, externalChild.document],
    {
      config: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG,
        resolver: { ...DEFAULT_RESOLVED_BTXML_CONFIG.resolver, behaviorTreeIds: "allow-ambiguous" },
      },
      models: [
        ...nodeModels,
        {
          id: "ModelOnly",
          kind: "SubTree",
          ports: [{ source: "config", direction: "input", name: "foo", required: false }],
        },
      ],
    },
  );

  const snapshot = normalizeSemanticViewSnapshot(
    buildSemanticDocumentView(main.document, index, {
      config: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG,
        resolver: { ...DEFAULT_RESOLVED_BTXML_CONFIG.resolver, behaviorTreeIds: "allow-ambiguous" },
      },
    }),
  );

  assert.deepEqual(snapshot, {
    uri: "main.xml",
    kind: "bt-xml",
    mainTreeToExecute: undefined,
    mainTreeToExecuteRange: undefined,
    behaviorTrees: [
      {
        id: "Main",
        rootNodeId: "bt:0/node:0",
        nodeIds: [
          "bt:0/node:0",
          "bt:0/node:0.0",
          "bt:0/node:0.1",
          "bt:0/node:0.2",
          "bt:0/node:0.3",
        ],
      },
    ],
    nodes: [
      {
        nodeId: "bt:0/node:0",
        path: [0],
        instancePath: "Main/0:Sequence",
        tagName: "Sequence",
        nodeType: "Sequence",
        usageTagForm: "concrete-node",
        usageModelStatus: "resolved",
        name: undefined,
        idAttr: undefined,
        parentNodeId: undefined,
        childNodeIds: ["bt:0/node:0.0", "bt:0/node:0.1", "bt:0/node:0.2", "bt:0/node:0.3"],
        behaviorTreeId: "Main",
        attributes: [],
        identityCandidates: ["Sequence", "Main/0:Sequence", "bt:0/node:0"],
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.0",
        path: [0, 0],
        instancePath: "Main/0:Sequence/0:LocalChild",
        tagName: "SubTree",
        nodeType: "LocalChild",
        usageTagForm: "subtree",
        usageModelStatus: "unresolved",
        name: undefined,
        idAttr: "LocalChild",
        parentNodeId: "bt:0/node:0",
        childNodeIds: [],
        behaviorTreeId: "Main",
        attributes: ["ID"],
        identityCandidates: [
          "LocalChild",
          "SubTree",
          "Main/0:Sequence/0:LocalChild",
          "bt:0/node:0.0",
        ],
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.1",
        path: [0, 1],
        instancePath: "Main/0:Sequence/1:SharedChild",
        tagName: "SubTree",
        nodeType: "SharedChild",
        usageTagForm: "subtree",
        usageModelStatus: "unresolved",
        name: undefined,
        idAttr: "SharedChild",
        parentNodeId: "bt:0/node:0",
        childNodeIds: [],
        behaviorTreeId: "Main",
        attributes: ["ID"],
        identityCandidates: [
          "SharedChild",
          "SubTree",
          "Main/0:Sequence/1:SharedChild",
          "bt:0/node:0.1",
        ],
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.2",
        path: [0, 2],
        instancePath: "Main/0:Sequence/2:ModelOnly",
        tagName: "SubTree",
        nodeType: "ModelOnly",
        usageTagForm: "subtree",
        usageModelStatus: "resolved",
        name: undefined,
        idAttr: "ModelOnly",
        parentNodeId: "bt:0/node:0",
        childNodeIds: [],
        behaviorTreeId: "Main",
        attributes: ["ID"],
        identityCandidates: [
          "ModelOnly",
          "SubTree",
          "Main/0:Sequence/2:ModelOnly",
          "bt:0/node:0.2",
        ],
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.3",
        path: [0, 3],
        instancePath: "Main/0:Sequence/3:Missing",
        tagName: "SubTree",
        nodeType: "Missing",
        usageTagForm: "subtree",
        usageModelStatus: "unresolved",
        name: undefined,
        idAttr: "Missing",
        parentNodeId: "bt:0/node:0",
        childNodeIds: [],
        behaviorTreeId: "Main",
        attributes: ["ID"],
        identityCandidates: ["Missing", "SubTree", "Main/0:Sequence/3:Missing", "bt:0/node:0.3"],
        portBindings: [],
      },
    ],
    subtreeCalls: [
      {
        nodeId: "bt:0/node:0.0",
        callId: "LocalChild",
        target: {
          status: "resolved",
          kind: "behavior-tree",
          treeId: "LocalChild",
          behaviorTree: { id: "LocalChild", uri: "main.xml" },
        },
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.1",
        callId: "SharedChild",
        target: {
          status: "resolved",
          kind: "behavior-tree",
          treeId: "SharedChild",
          behaviorTree: { id: "SharedChild", uri: "main.xml" },
        },
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.2",
        callId: "ModelOnly",
        target: {
          status: "resolved",
          kind: "node-model",
          modelId: "ModelOnly",
          model: { id: "ModelOnly", kind: "SubTree", ports: ["foo"] },
        },
        portBindings: [],
      },
      {
        nodeId: "bt:0/node:0.3",
        callId: "Missing",
        target: {
          status: "unresolved",
          id: "Missing",
        },
        portBindings: [],
      },
    ],
  });
});

test("semantic document view queries return nodes and bindings at positions", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move goal="{target}" />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "positions.xml" },
  );
  assert.ok(parsed.document);

  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(parsed.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  const nodePos = positionAt(
    parsed.document.originalText,
    parsed.document.originalText.indexOf("<Move") + 2,
  );
  const bindingPos = positionAt(
    parsed.document.originalText,
    parsed.document.originalText.indexOf('goal="{target}"') + 2,
  );

  assert.equal(findSemanticNodeAtPosition(view, nodePos)?.tagName, "Move");
  assert.equal(findSemanticPortBindingAtPosition(view, bindingPos)?.portName, "goal");
});

test("semantic tree helpers select a default tree and expose tree nodes", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4" main_tree_to_execute="Main">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move goal="{target}" />
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <Fallback>
      <Move goal="{backup}" />
    </Fallback>
  </BehaviorTree>
</root>`,
    { uri: "helpers.xml" },
  );
  assert.ok(parsed.document);

  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(parsed.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });

  assert.equal(view.mainTreeToExecute, "Main");
  assert.ok(view.mainTreeToExecuteRange);
  assert.deepEqual(selectDefaultBehaviorTree(view), {
    ok: true,
    treeId: "Main",
    reason: "main_tree_to_execute",
  });
  assert.deepEqual(selectDefaultBehaviorTree(view, "Child"), {
    ok: true,
    treeId: "Child",
    reason: "preferred",
  });
  assert.deepEqual(selectDefaultBehaviorTree(view, "Missing"), {
    ok: false,
    reason: "unknown-preferred-tree",
    diagnostics: [
      {
        code: "BTXML_SEMANTIC_TREE_SELECTION",
        severity: "error",
        message: "preferred tree `Missing` was not found",
        uri: "helpers.xml",
      },
    ],
  });
  assert.deepEqual(
    getSemanticTreeNodesForBehaviorTree(view, "Child").map((node) => node.tagName),
    ["Fallback", "Move"],
  );
});

test("semantic tree helpers report unknown main_tree_to_execute", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4" main_tree_to_execute="Missing">
  <BehaviorTree ID="Main">
    <Sequence />
  </BehaviorTree>
</root>`,
    { uri: "unknown-main.xml" },
  );
  assert.ok(parsed.document);

  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(parsed.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });

  assert.deepEqual(selectDefaultBehaviorTree(view), {
    ok: false,
    reason: "unknown-main-tree",
    diagnostics: [
      {
        code: "BTXML_SEMANTIC_TREE_SELECTION",
        severity: "error",
        message: "main_tree_to_execute references unknown BehaviorTree `Missing`",
        uri: "unknown-main.xml",
        range: view.mainTreeToExecuteRange,
      },
    ],
  });
});

test("semantic identity index exposes stable candidates for matching", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Move name="FirstMove" goal="{target}" />
      <Move goal="{target2}" />
      <SubTree ID="Child" />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "identity.xml" },
  );
  assert.ok(parsed.document);

  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    models: nodeModels,
  });
  const view = buildSemanticDocumentView(parsed.document, index, {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  const identityIndex = buildSemanticNodeIdentityIndex(view);

  assert.deepEqual(identityIndex.byCandidate.get("bt:0/node:0.1"), ["bt:0/node:0.1"]);
  assert.deepEqual(identityIndex.byCandidate.get("Move"), ["bt:0/node:0.0", "bt:0/node:0.1"]);
  assert.deepEqual(identityIndex.byCandidate.get("FirstMove"), ["bt:0/node:0.0"]);
  assert.deepEqual(identityIndex.byCandidate.get("Main/0:Sequence/2:Child"), ["bt:0/node:0.2"]);
  assert.ok(identityIndex.ambiguousCandidates.includes("Move"));
});
