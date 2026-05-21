import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceHost } from "@btxml/language-service";
import { createWorkspaceService } from "@btxml/language-service";
import { createNodeWorkspaceService } from "@btxml/language-service/node";

function getGoalPortType(ws: ReturnType<typeof createWorkspaceService>, uri: string) {
  return ws
    .getNodeCatalog(uri)
    .models.find((model) => model.id === "MoveBase")
    ?.ports?.find((port) => port.name === "goal")?.type;
}

function createMemoryHost(files: Record<string, string>): WorkspaceHost {
  return {
    async readFile(uri: string) {
      const value = files[uri];
      if (value === undefined) throw new Error(`Missing file: ${uri}`);
      return value;
    },
    async exists(uri: string) {
      return uri in files || Object.keys(files).some((key) => key.startsWith(`${uri}/`));
    },
    async readDir(uri: string) {
      const names = new Map<string, "file" | "directory">();
      for (const key of Object.keys(files)) {
        if (!key.startsWith(`${uri}/`)) continue;
        const rest = key.slice(uri.length + 1);
        const [name, child] = rest.split("/");
        names.set(name, child ? "directory" : "file");
      }
      return [...names.entries()].map(([name, type]) => ({ name, type }));
    },
    async stat(uri: string) {
      if (uri in files) {
        return { type: "file" as const, size: files[uri]?.length };
      }
      if (Object.keys(files).some((key) => key.startsWith(`${uri}/`))) {
        return { type: "directory" as const };
      }
      return undefined;
    },
  };
}

test("v0.4 workspace service tracks open update close", () => {
  const ws = createWorkspaceService();
  const uri = "file:///test.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"/></root>`;

  ws.openDocument(uri, text);
  assert.ok(ws.getDocument(uri));
  assert.equal(ws.getDocument(uri)?.getText(), text);

  const updatedText = text.replace("main", "updated");
  ws.updateDocument(uri, updatedText);
  assert.equal(ws.getDocument(uri)?.getText(), updatedText);

  ws.closeDocument(uri);
  assert.equal(ws.getDocument(uri), undefined);
});

test("workspace service exposes semantic convenience APIs", () => {
  const uri = "memory:///main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const ws = createWorkspaceService();
  ws.openDocument(uri, text);

  const semantic = ws.getSemanticDocumentView(uri);
  assert.ok(semantic.view);
  assert.equal(semantic.view?.nodes.length, 1);

  const catalog = ws.getNodeCatalog(uri);
  assert.ok(catalog.models.some((model) => model.id === "MoveBase"));

  const nodeId = semantic.view?.nodes[0]?.nodeId;
  assert.ok(nodeId);
  const semanticNode = ws.getSemanticNode(uri, nodeId);
  assert.equal(semanticNode.node?.nodeType, "MoveBase");

  const nodeModel = ws.getNodeModelById("MoveBase", uri);
  assert.equal(nodeModel.model?.id, "MoveBase");

  const document = ws.getDocument(uri);
  assert.ok(document);

  const nodeUsage = ws.getNodeUsageAt(uri, document.positionAt(text.indexOf("goal=") + 2));
  assert.equal(nodeUsage.node?.nodeType, "MoveBase");
  assert.equal(nodeUsage.usage?.tagForm, "generic-node");

  const portInfo = ws.getPortInfoAt(uri, document.positionAt(text.indexOf("goal=") + 2));
  assert.equal(portInfo.port?.name, "goal");
  assert.equal(portInfo.usage?.status, "resolved");
  assert.equal(portInfo.usage?.name, "goal");
  assert.equal(portInfo.nodeUsage?.nodeType, "MoveBase");
});

test("workspace service resolves child capability from semantic node kinds", () => {
  const uri = "memory:///child-capability.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <CustomControl/>
      <CustomAction/>
      <SubTree ID="CustomSubTree"/>
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysFailure/>
  </BehaviorTree>
  <TreeNodesModel>
    <Control ID="CustomControl"/>
    <Action ID="CustomAction"/>
    <SubTree ID="CustomSubTree"/>
  </TreeNodesModel>
</root>`;
  const ws = createWorkspaceService();
  ws.openDocument(uri, text);

  assert.deepEqual(ws.getChildCapability(uri, "BehaviorTree"), {
    capable: true,
    reason: "behavior-tree",
  });
  assert.deepEqual(ws.getChildCapability(uri, "Control", { ID: "CustomControl" }), {
    capable: true,
    reason: "generic-control",
  });
  assert.deepEqual(ws.getChildCapability(uri, "Decorator", { ID: "Delay" }), {
    capable: true,
    reason: "generic-decorator",
  });
  assert.deepEqual(ws.getChildCapability(uri, "Action", { ID: "CustomAction" }), {
    capable: false,
    reason: "generic-leaf",
  });
  assert.deepEqual(ws.getChildCapability(uri, "Condition", { ID: "IsReady" }), {
    capable: false,
    reason: "generic-leaf",
  });

  assert.deepEqual(ws.getChildCapability(uri, "Sequence"), {
    capable: true,
    reason: "model-kind",
    modelId: "Sequence",
    kind: "Control",
  });
  assert.deepEqual(ws.getChildCapability(uri, "AlwaysSuccess"), {
    capable: false,
    reason: "model-kind",
    modelId: "AlwaysSuccess",
    kind: "Action",
  });
  assert.deepEqual(ws.getChildCapability(uri, "CustomControl"), {
    capable: true,
    reason: "model-kind",
    modelId: "CustomControl",
    kind: "Control",
  });
  assert.deepEqual(ws.getChildCapability(uri, "CustomAction"), {
    capable: false,
    reason: "model-kind",
    modelId: "CustomAction",
    kind: "Action",
  });
  assert.deepEqual(ws.getChildCapability(uri, "SubTree", { ID: "CustomSubTree" }), {
    capable: false,
    reason: "model-kind",
    modelId: "CustomSubTree",
    kind: "SubTree",
  });
  assert.deepEqual(ws.getChildCapability(uri, "DoesNotExist"), {
    capable: false,
    reason: "unknown-model",
    modelId: "DoesNotExist",
  });
});

test("workspace service suppresses diagnostics completion and formatting for ordinary xml", () => {
  const uri = "file:///package.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<package format="3">
  <name>demo</name>
  <version>0.1.0</version>
</package>`;
  const ws = createWorkspaceService();
  ws.openDocument(uri, text);

  const document = ws.getDocument(uri);
  assert.ok(document);

  assert.deepEqual(ws.getDiagnostics(uri), { diagnostics: [] });
  assert.deepEqual(ws.getCompletions(uri, document.positionAt(text.indexOf("<name") + 1)), {
    items: [],
  });
  assert.deepEqual(ws.getFormattingEdits(uri), { edits: [], diagnostics: [] });
  assert.deepEqual(ws.getDocumentSymbols(uri), { symbols: [] });
});

test("workspace service keeps btcpp language documents active even without root markers", () => {
  const uri = "file:///main.bt.xml";
  const text = "<Sequence><AlwaysSuccess/></Sequence>";
  const ws = createWorkspaceService();
  ws.openDocument(uri, text, 1, "btcpp-xml");

  const document = ws.getDocument(uri);
  assert.ok(document);

  const completions = ws.getCompletions(uri, document.positionAt(1));
  assert.ok(completions.items.some((item) => item.label === "BehaviorTree"));
});

test("node workspace service keeps config-included xml active without bt root markers", async () => {
  const uri = "file:///workspace/behavior_trees/main.xml";
  const text = "<Sequence><AlwaysSuccess/></Sequence>";
  const ws = createNodeWorkspaceService({
    cwd: "/workspace",
    host: createMemoryHost({
      "file:///workspace/btxml.config.json": JSON.stringify({
        files: { include: ["behavior_trees/**/*.xml"] },
      }),
      [uri]: text,
    }),
  });

  assert.equal((await ws.loadProject()).ok, true);
  ws.openDocument(uri, text);

  const document = ws.getDocument(uri);
  assert.ok(document);

  const completions = ws.getCompletions(uri, document.positionAt(1));
  assert.ok(completions.items.some((item) => item.label === "BehaviorTree"));
});

test("workspace service resolves relative paths from Windows and percent-encoded file URIs", () => {
  const ws = createWorkspaceService({
    getRuntimeState: () => ({
      version: 1,
      workspace: {
        rootDir: "C:/workspace",
        documents: [],
      },
      resolvedConfig: {
        files: {
          include: ["behavior trees/**/*.xml"],
          ignore: [],
        },
        resolver: {
          behaviorTreeIds: "workspace-unique",
          includePaths: [],
          packageMap: {},
        },
        models: {
          builtin: "btcpp-v4",
          nodeDefinitions: [],
        },
        linter: {
          enabled: true,
          rules: {},
          suppressions: [],
        },
        formatter: {
          indentWidth: 2,
          lineWidth: 100,
          xmlDeclaration: "always",
          trailingNewline: true,
          spaceBeforeEmptyCloseTag: true,
          attributeOrder: "preserve",
        },
        overrides: [],
      },
      diagnostics: [],
    }),
  } as Parameters<typeof createWorkspaceService>[0]);
  const uri = "file:///C:/workspace/behavior%20trees/main.xml";
  ws.openDocument(uri, "<Sequence><AlwaysSuccess/></Sequence>", 1, "xml");

  const effective = ws.getEffectiveConfigForDocument(uri);
  assert.ok(effective);
  const document = ws.getDocument(uri);
  assert.ok(document);
  const completions = ws.getCompletions(uri, document.positionAt(1));
  assert.ok(completions.items.some((item) => item.label === "BehaviorTree"));
});

test("workspace service returns no runtime port info inside TreeNodesModel definitions", () => {
  const uri = "memory:///main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const ws = createWorkspaceService();
  ws.openDocument(uri, text);

  const document = ws.getDocument(uri);
  assert.ok(document);
  const portInfo = ws.getPortInfoAt(
    uri,
    document.positionAt(text.indexOf('<input_port name="goal"') + 15),
  );

  assert.equal(portInfo.node, undefined);
  assert.equal(portInfo.usage, undefined);
});

test("workspace service reuses one semantic snapshot across diagnostics and semantic helpers", () => {
  const uri = "memory:///main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const ws = createWorkspaceService();
  ws.openDocument(uri, text, 1);

  const semantic = ws.getSemanticDocumentView(uri);
  const diagnostics = ws.getDiagnostics(uri);
  const catalog = ws.getNodeCatalog(uri);
  const semanticAgain = ws.getSemanticDocumentView(uri);
  const catalogAgain = ws.getNodeCatalog(uri);

  assert.ok(semantic.view);
  assert.strictEqual(semantic.view, semanticAgain.view);
  assert.strictEqual(semantic.diagnostics, diagnostics.diagnostics);
  assert.strictEqual(catalog.models, catalogAgain.models);

  const document = ws.getDocument(uri);
  assert.ok(document);
  const portInfo = ws.getPortInfoAt(uri, document.positionAt(text.indexOf("goal=") + 2));

  assert.strictEqual(portInfo.node, semantic.view?.nodes[0]);
  assert.equal(portInfo.binding?.portName, semantic.view?.nodes[0]?.portBindings[0]?.portName);
  assert.equal(
    portInfo.binding?.resolution.status,
    semantic.view?.nodes[0]?.portBindings[0]?.resolution.status,
  );
  assert.equal(portInfo.usage?.status, semantic.view?.nodes[0]?.portBindings[0]?.usage.status);
});

test("workspace service semantic view respects strict subtree port policy", () => {
  const uri = "memory:///strict-subtree.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" remap="{goal}"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
</root>`;
  const ws = createWorkspaceService({
    config: {
      linter: {
        rules: {
          "model/no-unknown-port": ["error", { subTreePorts: "strict" }],
        },
      },
    },
  });
  ws.openDocument(uri, text);

  const semantic = ws.getSemanticDocumentView(uri);
  const subtreeBinding = semantic.view?.subtreeCalls[0]?.portBindings.find(
    (binding) => binding.portName === "remap",
  );

  assert.equal(subtreeBinding?.usage.status, "undeclared");
  assert.equal(subtreeBinding?.resolution.status, "undeclared");
});

test("workspace service port info reports the same usage status as semantic view bindings", () => {
  const uri = "memory:///port-info-status.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" remap="{goal}"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
</root>`;
  const ws = createWorkspaceService({
    config: {
      linter: {
        rules: {
          "model/no-unknown-port": ["error", { subTreePorts: "strict" }],
        },
      },
    },
  });
  ws.openDocument(uri, text);

  const document = ws.getDocument(uri);
  assert.ok(document);

  const semantic = ws.getSemanticDocumentView(uri);
  const portInfo = ws.getPortInfoAt(uri, document.positionAt(text.indexOf("remap=") + 2));
  const semanticBinding = semantic.view?.subtreeCalls[0]?.portBindings.find(
    (binding) => binding.portName === "remap",
  );

  assert.equal(semanticBinding?.usage.status, "undeclared");
  assert.equal(portInfo.binding?.portName, semanticBinding?.portName);
  assert.equal(portInfo.binding?.resolution.status, semanticBinding?.resolution.status);
  assert.equal(portInfo.usage?.status, semanticBinding?.usage.status);
  assert.equal(
    portInfo.nodeUsage?.subtree?.target.status,
    portInfo.node?.usage.subtree?.target.status,
  );
});

test("workspace service invalidates cached semantic snapshot when document version changes", () => {
  const uri = "memory:///main.xml";
  const initial = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const updated = initial.replace("Navigation target", "Updated target");
  const ws = createWorkspaceService();
  ws.openDocument(uri, initial, 1);

  const first = ws.getSemanticDocumentView(uri);
  const firstDiagnostics = ws.getDiagnostics(uri);

  ws.updateDocument(uri, updated, 2);

  const second = ws.getSemanticDocumentView(uri);
  const secondDiagnostics = ws.getDiagnostics(uri);

  assert.ok(first.view);
  assert.ok(second.view);
  assert.notStrictEqual(first.view, second.view);
  assert.notStrictEqual(firstDiagnostics.diagnostics, secondDiagnostics.diagnostics);
});

test("workspace service invalidates diagnostics and semantic view when document content changes", () => {
  const uri = "memory:///main.xml";
  const initial = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const updated = initial.replace('goal="{target}"', 'missing="{target}"');
  const ws = createWorkspaceService();
  ws.openDocument(uri, initial, 1);

  const firstSemantic = ws.getSemanticDocumentView(uri);
  const firstDiagnostics = ws.getDiagnostics(uri);

  ws.updateDocument(uri, updated, 2);

  const secondSemantic = ws.getSemanticDocumentView(uri);
  const secondDiagnostics = ws.getDiagnostics(uri);

  assert.ok(firstSemantic.view);
  assert.ok(secondSemantic.view);
  assert.equal(firstDiagnostics.diagnostics.length, 0);
  assert.notStrictEqual(firstSemantic.view, secondSemantic.view);
  assert.notStrictEqual(firstDiagnostics.diagnostics, secondDiagnostics.diagnostics);
  assert.ok(secondDiagnostics.diagnostics.length > 0);
});

test("node workspace service loads project-aware documents", async () => {
  const uri = "file:///workspace/main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
</root>`;
  const ws = createNodeWorkspaceService({
    cwd: "/workspace",
    host: createMemoryHost({
      "file:///workspace/btxml.config.json": JSON.stringify({
        files: { include: ["main.xml"] },
        models: { definitions: ["nodes.json"] },
      }),
      "file:///workspace/main.xml": text,
      "file:///workspace/nodes.json": JSON.stringify({
        nodes: {
          MoveBase: {
            kind: "Action",
            ports: {
              goal: { direction: "input", type: "Pose2D" },
            },
          },
        },
      }),
    }),
  });

  const loaded = await ws.loadProject();
  assert.equal(loaded.ok, true);

  ws.openDocument(uri, text);
  const nodeModel = ws.getNodeModelById("MoveBase", uri);
  assert.equal(nodeModel.model?.id, "MoveBase");
});

test("workspace service applies config includes relative to configBasePath", () => {
  const uri = "file:///workspace/config/plain.xml";
  const ws = createWorkspaceService({
    configBasePath: "/workspace",
    config: {
      files: { include: ["config/**/*.xml"] },
    },
  });

  ws.openDocument(uri, "<note/>");

  assert.deepEqual(ws.getDiagnostics(uri).diagnostics, []);
  assert.equal(ws.getDocumentSymbols(uri).symbols.length, 1);
});

test("node workspace service invalidates cached semantic snapshot after workspace refresh", async () => {
  const uri = "file:///workspace/main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
</root>`;
  const files: Record<string, string> = {
    "file:///workspace/btxml.config.json": JSON.stringify({
      files: { include: ["main.xml"] },
      models: { definitions: ["nodes.json"] },
    }),
    "file:///workspace/main.xml": text,
    "file:///workspace/nodes.json": JSON.stringify({
      nodes: {
        MoveBase: {
          kind: "Action",
          ports: {
            goal: { direction: "input", type: "Pose2D" },
          },
        },
      },
    }),
  };
  const host = createMemoryHost(files);
  const ws = createNodeWorkspaceService({
    cwd: "/workspace",
    host,
  });

  assert.equal((await ws.loadProject()).ok, true);
  ws.openDocument(uri, text, 1);

  const firstSemantic = ws.getSemanticDocumentView(uri);
  const firstCatalog = ws.getNodeCatalog(uri);

  files["file:///workspace/nodes.json"] = JSON.stringify({
    nodes: {
      MoveBase: {
        kind: "Action",
        ports: {
          goal: { direction: "input", type: "PoseStamped" },
          tolerance: { direction: "input", type: "number" },
        },
      },
    },
  });

  assert.equal((await ws.refreshProject()).ok, true);

  const secondSemantic = ws.getSemanticDocumentView(uri);
  const secondCatalog = ws.getNodeCatalog(uri);

  assert.ok(firstSemantic.view);
  assert.ok(secondSemantic.view);
  assert.notStrictEqual(firstSemantic.view, secondSemantic.view);
  assert.notStrictEqual(firstCatalog.models, secondCatalog.models);
  assert.deepEqual(
    secondCatalog.models.find((model) => model.id === "MoveBase")?.ports?.map((port) => port.name),
    ["goal", "tolerance"],
  );
});

test("node workspace service invalidates semantic snapshot when effective config changes", async () => {
  const uri = "file:///workspace/main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const files: Record<string, string> = {
    "file:///workspace/btxml.config.json": JSON.stringify({
      files: { include: ["main.xml"] },
      models: { definitions: ["nodes.json"] },
    }),
    "file:///workspace/main.xml": text,
    "file:///workspace/nodes.json": JSON.stringify({
      nodes: {
        MoveBase: {
          kind: "Action",
          ports: {
            goal: { direction: "input", type: "Pose2D" },
          },
        },
      },
    }),
  };
  const ws = createNodeWorkspaceService({
    cwd: "/workspace",
    host: createMemoryHost(files),
  });

  assert.equal((await ws.loadProject()).ok, true);
  ws.openDocument(uri, text, 1);

  const firstSemantic = ws.getSemanticDocumentView(uri);
  const firstDiagnostics = ws.getDiagnostics(uri);
  const firstGoalPortType = getGoalPortType(ws, uri);

  files["file:///workspace/btxml.config.json"] = JSON.stringify({
    files: { include: ["main.xml"] },
    models: { definitions: ["nodes-alt.json"] },
  });
  files["file:///workspace/nodes-alt.json"] = JSON.stringify({
    nodes: {
      MoveBase: {
        kind: "Action",
        ports: {
          goal: { direction: "input", type: "PoseStamped" },
        },
      },
    },
  });

  assert.equal((await ws.refreshProject()).ok, true);

  const secondSemantic = ws.getSemanticDocumentView(uri);
  const secondDiagnostics = ws.getDiagnostics(uri);
  const secondGoalPortType = getGoalPortType(ws, uri);

  assert.ok(firstSemantic.view);
  assert.ok(secondSemantic.view);
  assert.notStrictEqual(firstSemantic.view, secondSemantic.view);
  assert.notStrictEqual(firstDiagnostics.diagnostics, secondDiagnostics.diagnostics);
  assert.equal(firstGoalPortType, "Pose2D");
  assert.equal(secondGoalPortType, "PoseStamped");
});

test("node workspace service refreshes open-document diagnostics after watched config changes", async () => {
  const uri = "file:///workspace/main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Missing"/>
  </BehaviorTree>
</root>`;
  const files: Record<string, string> = {
    "file:///workspace/btxml.config.json": JSON.stringify({
      files: { include: ["main.xml"] },
      linter: { rules: { "tree/no-unknown-subtree": "error" } },
    }),
    [uri]: text,
  };
  const ws = createNodeWorkspaceService({
    cwd: "/workspace",
    host: createMemoryHost(files),
  });

  assert.equal((await ws.loadProject()).ok, false);
  ws.openDocument(uri, text, 1);
  assert.ok(
    ws
      .getDiagnostics(uri)
      .diagnostics.some((diagnostic) => diagnostic.code === "BT005_UNKNOWN_SUBTREE"),
  );

  files["file:///workspace/btxml.config.json"] = JSON.stringify({
    files: { include: ["main.xml"] },
    linter: { rules: { "tree/no-unknown-subtree": "off" } },
  });

  const reload = await ws.notifyWatchedFileChanged("file:///workspace/btxml.config.json");

  assert.equal(reload?.ok, true);
  assert.deepEqual(ws.getDiagnostics(uri), { diagnostics: [] });
});

test("node workspace service invalidates semantic snapshot when runtime config changes without workspace object changes", async () => {
  const uri = "file:///workspace/main.xml";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const nodes = JSON.stringify({
    nodes: {
      MoveBase: {
        kind: "Action",
        ports: {
          goal: { direction: "input", type: "Pose2D" },
        },
      },
    },
  });
  const files = {
    "file:///workspace/main.xml": text,
    "file:///workspace/primary.config.json": JSON.stringify({
      files: { include: ["main.xml"] },
      models: { definitions: ["nodes.json"] },
    }),
    "file:///workspace/secondary.config.json": JSON.stringify({
      files: { include: ["main.xml"] },
      models: { definitions: ["nodes.json"] },
      linter: { rules: { "model/no-unknown-port": "off" } },
    }),
    "file:///workspace/nodes.json": nodes,
  };
  const host = createMemoryHost(files);
  const ws = createNodeWorkspaceService({
    cwd: "/workspace",
    host,
    configPath: "primary.config.json",
  });

  assert.equal((await ws.loadProject()).ok, true);
  ws.openDocument(uri, text, 1);

  const firstSemantic = ws.getSemanticDocumentView(uri);
  const firstDiagnostics = ws.getDiagnostics(uri);

  assert.equal((await ws.refreshProject({ configPath: "secondary.config.json" })).ok, true);

  const secondSemantic = ws.getSemanticDocumentView(uri);
  const secondDiagnostics = ws.getDiagnostics(uri);

  assert.ok(firstSemantic.view);
  assert.ok(secondSemantic.view);
  assert.notStrictEqual(firstSemantic.view, secondSemantic.view);
  assert.notStrictEqual(firstDiagnostics.diagnostics, secondDiagnostics.diagnostics);
});
