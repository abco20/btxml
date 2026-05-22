import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import {
  buildSemanticIndex,
  getAllNodeUsages,
  getBehaviorTreeIds,
  getDocumentModel,
  getModelConflicts,
  getNodeModel,
  getNodeUsagesByUri,
  getTypeDefinition,
  normalizeTypeName,
} from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

test("buildSemanticIndex indexes behavior trees from multiple files", () => {
  const main = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree></root>`,
    { uri: "main.xml" },
  );
  const child = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="child"><AlwaysSuccess/></BehaviorTree></root>`,
    { uri: "child.xml" },
  );
  assert.ok(main.document);
  assert.ok(child.document);
  const { index } = buildSemanticIndex([main.document, child.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  const ids = getBehaviorTreeIds(index);
  assert.ok(ids.includes("main"), "main tree indexed");
  assert.ok(ids.includes("child"), "child tree indexed");
});

test("buildSemanticIndex stores AST-free document models", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="child"/></BehaviorTree><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>`,
    { uri: "main.xml" },
  );
  assert.ok(parsed.document);
  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  const model = getDocumentModel(index, "main.xml");
  assert.ok(model);
  assert.equal(model?.kind, "bt-xml");
  assert.equal("root" in (model ?? {}), false);
  assert.equal("element" in (model?.treeNodesModel[0] ?? {}), false);
  assert.equal("attributes" in (model?.subtreeReferences[0] ?? {}), false);
});

test("buildSemanticIndex resolves SubTree node model from TreeNodesModel", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="SetTargetValue" value="bad"/></BehaviorTree><TreeNodesModel><SubTree ID="SetTargetValue"><input_port name="value" type="bool"/></SubTree></TreeNodesModel></root>`,
  );
  assert.ok(parsed.document);
  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  const model = getNodeModel(index, "SetTargetValue");
  assert.ok(model, "SetTargetValue model present in index");
  assert.ok(
    model?.ports.some((p) => p.name === "value"),
    "value port found",
  );
});

test("different files identical model does not report conflict", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    !getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files port order differs only does not report conflict", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/><input_port name="speed" type="double"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="speed" type="double"/><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    !getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files description only differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string">target pose</input_port></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string">goal name</input_port></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files kind differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"/></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Condition ID="Move"/></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files port type differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="CustomPayload"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files port direction differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><output_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files port set differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/><input_port name="speed" type="double"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files requiredness differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string" default="home"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files default value differs reports BT107", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="speed" type="double" default="1.0"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Move"><input_port name="speed" type="double" default="2.0"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT107_CONFLICTING_PORT_DEFAULT"),
  );
});

test("different files enum differs reports BT012", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="SetMode"><input_port name="mode" type="string" enum="auto;manual"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="SetMode"><input_port name="mode" type="string" enum="auto;manual;disabled"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("different files enum order differs only does not report conflict", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="SetMode"><input_port name="mode" type="string" enum="auto;manual"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="SetMode"><input_port name="mode" type="string" enum="manual;auto"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    !getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("equivalent decoded default values do not report conflict", () => {
  const a = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Check"><input_port name="expr" type="string" default="a &amp;&amp; b"/></Action></TreeNodesModel></root>',
    { uri: "a.xml" },
  );
  const b = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="Check"><input_port name="expr" type="string" default="a &#38;&#38; b"/></Action></TreeNodesModel></root>',
    { uri: "b.xml" },
  );
  assert.ok(a.document);
  assert.ok(b.document);
  const result = buildSemanticIndex([a.document, b.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });
  assert.ok(
    !getModelConflicts(result.index).some((fact) => fact.code === "BT012_CONFLICTING_NODE_MODEL"),
  );
});

test("buildSemanticIndex exposes augmentation-backed type registry", () => {
  const result = buildSemanticIndex([], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        types: {
          Pose2D: {
            kind: "opaque",
            canonical: "my_robot/Pose2D",
            aliases: ["my_robot::Pose2D"],
          },
          MyAny: {
            kind: "any",
          },
        },
      },
    ],
  });

  assert.equal(normalizeTypeName(result.index, "my_robot::Pose2D"), "my_robot/Pose2D");
  assert.equal(getTypeDefinition(result.index, "Pose2D")?.canonical, "my_robot/Pose2D");
  assert.equal(getTypeDefinition(result.index, "MyAny")?.kind, "any");
});

test("buildSemanticIndex applies augmentations to effective node models", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="string">Base target</input_port></Action></TreeNodesModel></root>`,
    { uri: "move-to.xml" },
  );
  assert.ok(parsed.document);

  const result = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        types: {
          Pose2D: {
            kind: "opaque",
            validate: {
              kind: "tuple",
              separator: ";",
              items: ["double", "double", "double"],
            },
          },
        },
        augment: {
          MoveTo: {
            ports: {
              target: {
                typeRefinement: {
                  from: "std::string",
                  to: "Pose2D",
                },
                validate: {
                  kind: "pattern",
                  pattern: "^[-0-9.]+;[-0-9.]+;[-0-9.]+$",
                },
                required: true,
                enum: ["home", "dock"],
                description: "Augmented target",
              },
            },
          },
        },
      },
    ],
  });

  const model = getNodeModel(result.index, "MoveTo");
  const port = model?.ports.find((candidate) => candidate.name === "target");

  assert.ok(port);
  assert.equal(port?.originalType, "string");
  assert.equal(port?.effectiveType, "Pose2D");
  assert.equal(port?.type, "Pose2D");
  assert.equal(port?.typeSource, "model-augmentation");
  assert.deepEqual(port?.typeRefinement, { from: "std::string", to: "Pose2D" });
  assert.deepEqual(port?.validate, {
    kind: "pattern",
    pattern: "^[-0-9.]+;[-0-9.]+;[-0-9.]+$",
  });
  assert.equal(port?.required, true);
  assert.deepEqual(port?.enum, ["home", "dock"]);
  assert.equal(port?.description, "Augmented target");
  assert.equal(result.diagnostics.length, 0);
});

test("buildSemanticIndex matches typeRefinement.from through registry aliases and canonicals", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { uri: "move-to.xml" },
  );
  assert.ok(parsed.document);

  const result = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        types: {
          Pose2D: {
            kind: "opaque",
            canonical: "my_robot/Pose2D",
            aliases: ["my_robot::Pose2D"],
          },
          PoseStamped: {
            kind: "opaque",
            canonical: "my_robot/PoseStamped",
            aliases: ["my_robot::PoseStamped"],
          },
        },
        augment: {
          MoveTo: {
            ports: {
              target: {
                typeRefinement: {
                  from: "my_robot::Pose2D",
                  to: "my_robot/PoseStamped",
                },
              },
            },
          },
        },
      },
    ],
  });

  const model = getNodeModel(result.index, "MoveTo");
  const port = model?.ports.find((candidate) => candidate.name === "target");

  assert.ok(port);
  assert.equal(port?.originalType, "Pose2D");
  assert.equal(port?.effectiveType, "my_robot/PoseStamped");
  assert.equal(port?.type, "my_robot/PoseStamped");
  assert.equal(port?.typeSource, "model-augmentation");
  assert.deepEqual(port?.typeRefinement, {
    from: "my_robot::Pose2D",
    to: "my_robot/PoseStamped",
  });
  assert.equal(
    result.diagnostics.some((candidate) => candidate.code === "BT119_INVALID_TYPE_REFINEMENT"),
    false,
  );
});

test("buildSemanticIndex reports BT117 when augmentation target is missing", () => {
  const result = buildSemanticIndex([], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        path: "btxml.model-augment.json",
        augment: {
          MissingNode: {
            ports: {},
          },
        },
      },
    ],
  });

  const diagnostic = result.diagnostics.find(
    (candidate) => candidate.code === "BT117_AUGMENT_TARGET_NOT_FOUND",
  );
  assert.ok(diagnostic);
  assert.match(diagnostic?.message ?? "", /MissingNode/);
});

test("buildSemanticIndex reports BT118 when augmentation port is missing", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="string"/></Action></TreeNodesModel></root>`,
    { uri: "move-to.xml" },
  );
  assert.ok(parsed.document);

  const result = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        augment: {
          MoveTo: {
            ports: {
              missing: {},
            },
          },
        },
      },
    ],
  });

  const diagnostic = result.diagnostics.find(
    (candidate) => candidate.code === "BT118_AUGMENT_PORT_NOT_FOUND",
  );
  assert.ok(diagnostic);
  assert.match(diagnostic?.message ?? "", /missing/);
});

test("buildSemanticIndex reports BT119 when type refinement from does not match", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="int"/></Action></TreeNodesModel></root>`,
    { uri: "move-to.xml" },
  );
  assert.ok(parsed.document);

  const result = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        augment: {
          MoveTo: {
            ports: {
              target: {
                typeRefinement: {
                  from: "std::string",
                  to: "Pose2D",
                },
              },
            },
          },
        },
      },
    ],
  });

  const diagnostic = result.diagnostics.find(
    (candidate) => candidate.code === "BT119_INVALID_TYPE_REFINEMENT",
  );
  assert.ok(diagnostic);

  const model = getNodeModel(result.index, "MoveTo");
  const port = model?.ports.find((candidate) => candidate.name === "target");
  assert.equal(port?.originalType, "int");
  assert.equal(port?.effectiveType, "int");
  assert.equal(port?.type, "int");
  assert.equal(port?.typeSource, "external-tree-nodes-model");
  assert.equal(port?.typeRefinement, undefined);
});

test("semantic queries expose all node usages", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><MoveBase/><SubTree ID="Child"/></Sequence></BehaviorTree></root>`,
    { uri: "main.xml" },
  );
  assert.ok(parsed.document);

  const { index } = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });

  assert.deepEqual(
    getAllNodeUsages(index).map((usage) => ({
      id: usage.id,
      kind: usage.kind,
    })),
    [
      { id: "Sequence", kind: "node" },
      { id: "MoveBase", kind: "node" },
      { id: "Child", kind: "SubTree" },
    ],
  );
});

test("semantic queries group node usages by URI", () => {
  const first = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="A"><Tick/></BehaviorTree></root>`,
    { uri: "a.xml" },
  );
  const second = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="B"><SubTree ID="CallB"/></BehaviorTree></root>`,
    { uri: "b.xml" },
  );
  assert.ok(first.document);
  assert.ok(second.document);

  const { index } = buildSemanticIndex([first.document, second.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
  });

  const grouped = getNodeUsagesByUri(index);
  assert.deepEqual(
    grouped.get("a.xml")?.map((usage) => usage.id),
    ["Tick"],
  );
  assert.deepEqual(
    grouped.get("b.xml")?.map((usage) => ({ id: usage.id, kind: usage.kind })),
    [{ id: "CallB", kind: "SubTree" }],
  );
});
