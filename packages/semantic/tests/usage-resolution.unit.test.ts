import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import type { TreeNodeModelDef } from "@btxml/model";
import {
  buildSemanticIndex,
  getModelConflicts,
  getUsagePorts,
  resolveNodeUsage,
  resolvePortUsage,
} from "@btxml/semantic";
import { type BtDocument, type BtXmlElement, parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

const nodeModels: TreeNodeModelDef[] = [
  {
    id: "CustomSleep",
    kind: "Action",
    ports: [{ source: "config", direction: "input", name: "msec", required: true }],
  },
  {
    id: "WithPorts",
    kind: "Action",
    ports: [
      { source: "config", direction: "input", name: "goal", required: true },
      { source: "config", direction: "output", name: "result", required: false },
      { source: "config", direction: "inout", name: "state", required: true },
    ],
  },
  {
    id: "Defaulted",
    kind: "Action",
    ports: [{ source: "config", direction: "input", name: "timeout", required: false }],
  },
  {
    id: "ModelChild",
    kind: "SubTree",
    ports: [{ source: "config", direction: "input", name: "target", required: true }],
  },
  {
    id: "SubTree",
    kind: "SubTree",
    ports: [{ source: "config", direction: "input", name: "_autoremap", required: false }],
  },
];

function parseDocument(text: string, uri: string): BtDocument {
  const parsed = parseBtXml(text, { uri });
  assert.ok(parsed.document, `expected parsed document for ${uri}`);
  return parsed.document;
}

function findFirstElement(document: BtDocument, name: string): BtXmlElement {
  const queue = document.root ? [document.root] : [];

  while (queue.length > 0) {
    const element = queue.shift();
    if (!element) continue;
    if (element.name === name) return element;

    for (const child of element.children) {
      if (child.kind === "element") {
        queue.push(child);
      }
    }
  }

  throw new Error(`element not found: ${name}`);
}

function findChildElements(element: BtXmlElement): BtXmlElement[] {
  return element.children.filter((child): child is BtXmlElement => child.kind === "element");
}

function createIndex(
  documents: readonly BtDocument[],
  options?: {
    models?: readonly TreeNodeModelDef[];
    config?: typeof DEFAULT_RESOLVED_BTXML_CONFIG;
    augmentations?: Parameters<typeof buildSemanticIndex>[1]["augmentations"];
  },
) {
  return buildSemanticIndex([...documents], {
    config: options?.config ?? DEFAULT_RESOLVED_BTXML_CONFIG,
    models: [...(options?.models ?? nodeModels)],
    augmentations: options?.augmentations,
  }).index;
}

function usageInput(document: BtDocument, element: BtXmlElement) {
  return {
    element,
    documentRoot: document.root,
    uri: document.uri,
  } as const;
}

test("resolveNodeUsage classifies concrete, generic, and unknown nodes", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence />
    <Action ID="CustomSleep" msec="10" />
    <Action />
    <Foo />
  </BehaviorTree>
</root>`,
    "nodes.xml",
  );
  const index = createIndex([document]);
  const sequence = findFirstElement(document, "Sequence");
  const sleep = findFirstElement(document, "Action");
  const missingId = findFirstElement(
    parseDocument(
      `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Main"><Action /></BehaviorTree></root>`,
      "missing-id.xml",
    ),
    "Action",
  );
  const unknown = findFirstElement(document, "Foo");

  const concreteUsage = resolveNodeUsage(index, usageInput(document, sequence));
  assert.equal(concreteUsage.tagForm, "concrete-node");
  assert.equal(concreteUsage.nodeType, "Sequence");
  assert.equal(concreteUsage.model.status, "resolved");

  const genericUsage = resolveNodeUsage(index, usageInput(document, sleep));
  assert.equal(genericUsage.tagForm, "generic-node");
  assert.equal(genericUsage.nodeType, "CustomSleep");
  assert.equal(genericUsage.model.status, "resolved");
  assert.equal(
    resolvePortUsage(index, {
      ...usageInput(document, sleep),
      attributeName: "msec",
    })?.status,
    "resolved",
  );

  const missingIdUsage = resolveNodeUsage(index, {
    element: missingId,
    documentRoot: undefined,
    uri: "missing-id.xml",
  });
  assert.equal(missingIdUsage.tagForm, "generic-node");
  assert.equal(missingIdUsage.nodeType, undefined);
  assert.deepEqual(missingIdUsage.model, { status: "unresolved", nodeType: undefined });

  const unknownUsage = resolveNodeUsage(index, usageInput(document, unknown));
  assert.equal(unknownUsage.tagForm, "concrete-node");
  assert.deepEqual(unknownUsage.model, { status: "unresolved", nodeType: "Foo" });
});

test("resolveNodeUsage treats model definitions and non-node XML as not-a-node", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="Sleep">
      <input_port name="msec" type="int" />
    </Action>
  </TreeNodesModel>
</root>`,
    "model.xml",
  );
  const index = createIndex([document]);
  const actionDefinition = findFirstElement(document, "Action");
  const inputPort = findFirstElement(document, "input_port");

  const definitionUsage = resolveNodeUsage(index, {
    element: actionDefinition,
    documentRoot: document.root,
    uri: document.uri,
    isModelDefinition: true,
  });
  assert.equal(definitionUsage.tagForm, "model-definition");
  assert.deepEqual(definitionUsage.model, { status: "not-a-node" });

  const inputPortUsage = resolveNodeUsage(index, usageInput(document, inputPort));
  assert.equal(inputPortUsage.tagForm, "unknown-xml");
  assert.deepEqual(inputPortUsage.model, { status: "not-a-node" });
});

test("resolveNodeUsage uses the effective merged model for builtin overrides", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence custom="ok" />
  </BehaviorTree>
</root>`,
    "override.xml",
  );
  const index = createIndex([document], {
    models: [
      ...nodeModels,
      {
        id: "Sequence",
        kind: "Control",
        ports: [{ source: "config", direction: "input", name: "custom", required: false }],
      },
    ],
  });
  const sequence = findFirstElement(document, "Sequence");

  const usage = resolveNodeUsage(index, usageInput(document, sequence));

  assert.equal(usage.model.status, "resolved");
  assert.equal(usage.model.status === "resolved" ? usage.model.model.kind : undefined, "Control");
  assert.ok(usage.ports.some((port) => port.name === "custom"));
  assert.equal(
    resolvePortUsage(index, { ...usageInput(document, sequence), attributeName: "custom" })?.status,
    "resolved",
  );
});

test("resolveNodeUsage returns ambiguous only for real model conflicts", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Conflicted" foo="bar" />
  </BehaviorTree>
</root>`,
    "conflict.xml",
  );
  const index = createIndex([document], {
    models: [
      ...nodeModels,
      { id: "Conflicted", kind: "Action", ports: [] },
      { id: "Conflicted", kind: "Condition", ports: [] },
    ],
  });
  const conflicted = findFirstElement(document, "Action");

  const usage = resolveNodeUsage(index, usageInput(document, conflicted));

  assert.equal(usage.model.status, "ambiguous");
  assert.equal(
    getModelConflicts(index).some(
      (fact) => fact.id === "Conflicted" && fact.code === "BT012_CONFLICTING_NODE_MODEL",
    ),
    true,
  );
});

test("resolveNodeUsage treats lowercase custom tags as concrete nodes", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <my_action goal="home" />
  </BehaviorTree>
</root>`,
    "lowercase.xml",
  );
  const index = createIndex([document], {
    models: [
      ...nodeModels,
      {
        id: "my_action",
        kind: "Action",
        ports: [{ source: "config", direction: "input", name: "goal", required: true }],
      },
    ],
  });
  const lowercaseNode = findFirstElement(document, "my_action");

  const usage = resolveNodeUsage(index, usageInput(document, lowercaseNode));

  assert.equal(usage.tagForm, "concrete-node");
  assert.equal(usage.nodeType, "my_action");
  assert.equal(usage.model.status, "resolved");
  assert.equal(
    resolvePortUsage(index, {
      ...usageInput(document, lowercaseNode),
      attributeName: "goal",
    })?.status,
    "resolved",
  );
});

test("resolveNodeUsage resolves generic node IDs to concrete models", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Foo" goal="home" />
  </BehaviorTree>
</root>`,
    "generic-id.xml",
  );
  const index = createIndex([document], {
    models: [
      ...nodeModels,
      {
        id: "Foo",
        kind: "Action",
        ports: [{ source: "config", direction: "input", name: "goal", required: true }],
      },
    ],
  });
  const action = findFirstElement(document, "Action");

  const usage = resolveNodeUsage(index, usageInput(document, action));

  assert.equal(usage.tagForm, "generic-node");
  assert.equal(usage.nodeType, "Foo");
  assert.equal(usage.model.status, "resolved");
});

test("resolveNodeUsage resolves subtree targets to behavior trees and explicit subtree models", () => {
  const main = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" target="{goal}" />
    <SubTree ID="ModelChild" target="{goal}" />
    <SubTree />
  </BehaviorTree>
</root>`,
    "main.xml",
  );
  const child = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Child"><AlwaysSuccess /></BehaviorTree></root>`,
    "child.xml",
  );
  const index = createIndex([main, child]);
  const behaviorTreeChildren = findChildElements(findFirstElement(main, "BehaviorTree"));

  const behaviorTreeUsage = resolveNodeUsage(index, {
    element: behaviorTreeChildren[0],
    documentRoot: main.root,
    uri: main.uri,
  });
  assert.equal(behaviorTreeUsage.tagForm, "subtree");
  assert.equal(behaviorTreeUsage.subtree?.target.status, "resolved");
  assert.equal(
    behaviorTreeUsage.subtree?.target.status === "resolved"
      ? behaviorTreeUsage.subtree.target.kind
      : undefined,
    "behavior-tree",
  );
  assert.equal(behaviorTreeUsage.allowsArbitraryAttributes, true);
  assert.equal(
    resolvePortUsage(index, {
      element: behaviorTreeChildren[0],
      documentRoot: main.root,
      attributeName: "target",
      uri: main.uri,
    })?.status,
    "allowed-arbitrary",
  );

  const explicitModelUsage = resolveNodeUsage(index, {
    element: behaviorTreeChildren[1],
    documentRoot: main.root,
    uri: main.uri,
  });
  assert.equal(explicitModelUsage.subtree?.target.status, "resolved");
  assert.equal(
    explicitModelUsage.subtree?.target.status === "resolved"
      ? explicitModelUsage.subtree.target.kind
      : undefined,
    "node-model",
  );
  assert.equal(explicitModelUsage.model.status, "resolved");
  assert.equal(
    resolvePortUsage(index, {
      element: behaviorTreeChildren[1],
      documentRoot: main.root,
      attributeName: "target",
      uri: main.uri,
    })?.status,
    "resolved",
  );

  const noIdUsage = resolveNodeUsage(index, {
    element: behaviorTreeChildren[2],
    documentRoot: main.root,
    uri: main.uri,
  });
  assert.equal(noIdUsage.nodeType, "SubTree");
  assert.deepEqual(noIdUsage.subtree?.target, { status: "unresolved", id: undefined });
  assert.ok(
    getUsagePorts(index, {
      element: behaviorTreeChildren[2],
      documentRoot: main.root,
      uri: main.uri,
    }).some((port) => port.name === "_autoremap"),
  );
});

test("resolveNodeUsage handles ambiguous subtree targets", () => {
  const main = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" target="x" /></BehaviorTree></root>`,
    "main.xml",
  );
  const childA = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Child"><AlwaysSuccess /></BehaviorTree></root>`,
    "child-a.xml",
  );
  const childB = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Child"><AlwaysFailure /></BehaviorTree></root>`,
    "child-b.xml",
  );
  const index = createIndex([main, childA, childB], {
    config: {
      ...DEFAULT_RESOLVED_BTXML_CONFIG,
      resolver: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG.resolver,
        behaviorTreeIds: "allow-ambiguous",
      },
    },
  });
  const subtree = findFirstElement(main, "SubTree");

  const usage = resolveNodeUsage(index, {
    element: subtree,
    documentRoot: main.root,
    uri: main.uri,
    config: { resolver: { behaviorTreeIds: "allow-ambiguous" } },
  });
  assert.equal(usage.subtree?.target.status, "ambiguous");
  assert.equal(
    usage.subtree?.target.status === "ambiguous" ? usage.subtree.target.behaviorTrees.length : 0,
    2,
  );
  assert.equal(
    resolvePortUsage(index, {
      element: subtree,
      documentRoot: main.root,
      attributeName: "target",
      uri: main.uri,
      config: { resolver: { behaviorTreeIds: "allow-ambiguous" } },
    })?.status,
    "allowed-arbitrary",
  );
});

test("resolveNodeUsage respects subtree port policy allow and reject", () => {
  const main = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" target="{goal}" /></BehaviorTree></root>`,
    "main.xml",
  );
  const child = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Child"><AlwaysSuccess /></BehaviorTree></root>`,
    "child.xml",
  );
  const index = createIndex([main, child]);
  const subtree = findFirstElement(main, "SubTree");

  assert.equal(
    resolvePortUsage(index, {
      element: subtree,
      documentRoot: main.root,
      attributeName: "target",
      uri: main.uri,
    })?.status,
    "allowed-arbitrary",
  );
  assert.equal(
    resolvePortUsage(index, {
      element: subtree,
      documentRoot: main.root,
      attributeName: "target",
      uri: main.uri,
      policy: { unknownSubTreePorts: "reject" },
    })?.status,
    "undeclared",
  );
});

test("resolveNodeUsage distinguishes loose and strict subtree remaps", () => {
  const main = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Main"><SubTree ID="Child" remap="{goal}" /></BehaviorTree></root>`,
    "subtree-remap.xml",
  );
  const child = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="Child"><AlwaysSuccess /></BehaviorTree></root>`,
    "subtree-child.xml",
  );
  const index = createIndex([main, child]);
  const subtree = findFirstElement(main, "SubTree");

  assert.equal(
    resolvePortUsage(index, {
      element: subtree,
      documentRoot: main.root,
      attributeName: "remap",
      uri: main.uri,
    })?.status,
    "allowed-arbitrary",
  );
  assert.equal(
    resolvePortUsage(index, {
      element: subtree,
      documentRoot: main.root,
      attributeName: "remap",
      uri: main.uri,
      policy: { unknownSubTreePorts: "reject" },
    })?.status,
    "undeclared",
  );
});

test("resolvePortUsage distinguishes reserved attributes from subtree generic ports", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="WithPorts" name="Alias" goal="home" result="{status}" state="busy" _skipIf="done" />
    <SubTree ID="ModelChild" _autoremap="true" target="{goal}" />
  </BehaviorTree>
</root>`,
    "reserved.xml",
  );
  const index = createIndex([document]);
  const elements = findChildElements(findFirstElement(document, "BehaviorTree"));

  assert.equal(
    resolvePortUsage(index, { ...usageInput(document, elements[0]), attributeName: "ID" })?.status,
    "reserved-attribute",
  );
  assert.equal(
    resolvePortUsage(index, { ...usageInput(document, elements[0]), attributeName: "name" })
      ?.status,
    "reserved-attribute",
  );
  assert.equal(
    resolvePortUsage(index, { ...usageInput(document, elements[0]), attributeName: "_skipIf" })
      ?.status,
    "reserved-attribute",
  );
  assert.equal(
    resolvePortUsage(index, {
      element: elements[1],
      documentRoot: document.root,
      attributeName: "_autoremap",
      uri: document.uri,
    })?.status,
    "resolved",
  );
});

test("getUsagePorts preserves port directions and requiredness", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="WithPorts" />
    <Action ID="Defaulted" />
  </BehaviorTree>
</root>`,
    "ports.xml",
  );
  const index = createIndex([document]);
  const elements = findChildElements(findFirstElement(document, "BehaviorTree"));

  const ports = getUsagePorts(index, usageInput(document, elements[0]));
  assert.deepEqual(
    ports.map((port) => ({ name: port.name, direction: port.direction, required: port.required })),
    [
      { name: "goal", direction: "input", required: true },
      { name: "result", direction: "output", required: false },
      { name: "state", direction: "inout", required: true },
    ],
  );

  const defaultedPorts = getUsagePorts(index, usageInput(document, elements[1]));
  assert.deepEqual(
    defaultedPorts.map((port) => ({ name: port.name, required: port.required })),
    [{ name: "timeout", required: false }],
  );
});

test("resolvePortUsage exposes augmented effective port metadata", () => {
  const document = parseDocument(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveTo" target="1;2;3" />
  </BehaviorTree>
</root>`,
    "usage-augment.xml",
  );
  const index = createIndex([document], {
    models: [
      ...nodeModels,
      {
        id: "MoveTo",
        kind: "Action",
        ports: [
          {
            source: "config",
            direction: "input",
            name: "target",
            type: "string",
            required: false,
            description: "Base description",
          },
        ],
      },
    ],
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
                required: true,
                enum: ["1;2;3"],
                description: "Augmented description",
              },
            },
          },
        },
      },
    ],
  });
  const action = findFirstElement(document, "Action");
  const resolution = resolvePortUsage(index, {
    ...usageInput(document, action),
    attributeName: "target",
  });

  assert.equal(resolution?.status, "resolved");
  if (!resolution || resolution.status !== "resolved") {
    throw new Error("expected resolved port usage");
  }

  assert.equal(resolution.port.originalType, "string");
  assert.equal(resolution.port.effectiveType, "Pose2D");
  assert.equal(resolution.port.type, "Pose2D");
  assert.equal(resolution.port.typeSource, "model-augmentation");
  assert.deepEqual(resolution.port.typeRefinement, {
    from: "std::string",
    to: "Pose2D",
  });
  assert.equal(resolution.port.required, true);
  assert.deepEqual(resolution.port.enum, ["1;2;3"]);
  assert.equal(resolution.port.description, "Augmented description");
});
