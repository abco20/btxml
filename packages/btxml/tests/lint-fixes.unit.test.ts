import assert from "node:assert/strict";
import test from "node:test";
import { applyTextEdits } from "@btxml/foundation";
import { parseBtXml } from "@btxml/syntax";
import { getSafeLintFixes, serializeTreeNodeModelDefinition } from "../src/repair/lint-fixes.ts";

function makeRange(start: number, end: number) {
  return {
    start: { line: 0, character: 0, offset: start },
    end: { line: 0, character: 0, offset: end },
  };
}

test("getSafeLintFixes keeps BT002_MISSING_BTCPP_FORMAT behavior", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const fixes = getSafeLintFixes({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT002_MISSING_BTCPP_FORMAT",
        severity: "warning",
        message: "missing format",
        uri: "tree.xml",
      },
    ],
  });

  assert.equal(fixes.length, 1);
  const updated = applyTextEdits(parsed.document.originalText, fixes[0]?.edits ?? []);
  assert.equal(updated.includes('BTCPP_format="4"'), true);
});

test("getSafeLintFixes applies BT121 delete-definition fix metadata", () => {
  const fixes = getSafeLintFixes({
    documents: [],
    diagnostics: [
      {
        code: "BT121_UNUSED_MODEL_DEFINITION",
        severity: "error",
        message: "unused",
        uri: "tree.xml",
        data: {
          kind: "unused-model-definition",
          nodeId: "UnusedAction",
          modelKind: "Action",
          sourceKind: "inline-tree-nodes-model",
          fix: {
            kind: "delete-definition",
            uri: "tree.xml",
            range: makeRange(10, 20),
          },
        },
      },
    ],
  });

  assert.equal(fixes.length, 1);
  assert.equal(fixes[0]?.uri, "tree.xml");
  assert.equal(fixes[0]?.edits.length, 1);
  assert.equal(fixes[0]?.edits[0]?.newText, "");
  assert.deepEqual(fixes[0]?.edits[0]?.range, makeRange(10, 20));
});

test("getSafeLintFixes applies BT122 delete-non-canonical-definitions metadata", () => {
  const fixes = getSafeLintFixes({
    documents: [],
    diagnostics: [
      {
        code: "BT122_DUPLICATE_MODEL_DEFINITION",
        severity: "error",
        message: "duplicate",
        uri: "models.xml",
        data: {
          kind: "duplicate-model-definition",
          nodeId: "Move",
          modelKind: "Action",
          definitions: [],
          fix: {
            kind: "delete-non-canonical-definitions",
            keep: { uri: "models.xml", range: makeRange(0, 10) },
            delete: [
              { uri: "tree-a.xml", range: makeRange(20, 30) },
              { uri: "tree-a.xml", range: makeRange(40, 50) },
              { uri: "tree-b.xml", range: makeRange(15, 25) },
            ],
          },
        },
      },
    ],
  });

  assert.equal(fixes.length, 2);
  const treeA = fixes.find((fix) => fix.uri === "tree-a.xml");
  const treeB = fixes.find((fix) => fix.uri === "tree-b.xml");

  assert.ok(treeA);
  assert.equal(treeA?.edits.length, 2);
  assert.equal(
    (treeA?.edits[0]?.range.start.offset ?? 0) > (treeA?.edits[1]?.range.start.offset ?? 0),
    true,
  );

  assert.ok(treeB);
  assert.equal(treeB?.edits.length, 1);
  assert.deepEqual(treeA?.edits[0]?.range, makeRange(40, 50));
  assert.deepEqual(treeA?.edits[1]?.range, makeRange(20, 30));
  assert.deepEqual(treeB?.edits[0]?.range, makeRange(15, 25));
});

test("getSafeLintFixes ignores BT121/BT122/BT120 when fix metadata is missing", () => {
  const fixes = getSafeLintFixes({
    documents: [],
    diagnostics: [
      {
        code: "BT121_UNUSED_MODEL_DEFINITION",
        severity: "error",
        message: "unused",
        uri: "tree.xml",
        data: {
          kind: "unused-model-definition",
          nodeId: "UnusedAction",
          modelKind: "Action",
          sourceKind: "inline-tree-nodes-model",
        },
      },
      {
        code: "BT122_DUPLICATE_MODEL_DEFINITION",
        severity: "error",
        message: "duplicate",
        uri: "tree.xml",
        data: {
          kind: "duplicate-model-definition",
          nodeId: "Move",
          modelKind: "Action",
          definitions: [],
        },
      },
      {
        code: "BT120_CONFLICTING_MODEL_KIND",
        severity: "error",
        message: "conflicting kind",
        uri: "tree.xml",
      },
    ],
  });

  assert.equal(fixes.length, 0);
});

test("serializeTreeNodeModelDefinition serializes builtin-style and ported models", () => {
  assert.equal(
    serializeTreeNodeModelDefinition({
      id: "Sequence",
      kind: "Control",
      ports: [],
    }),
    '<Control ID="Sequence"/>',
  );

  assert.equal(
    serializeTreeNodeModelDefinition({
      id: "Move",
      kind: "Action",
      ports: [
        {
          direction: "input",
          name: "goal",
          type: "Pose2D",
          defaultValue: "a&b",
          description: 'g"oal',
          enum: ["auto", "manual"],
        },
      ],
    }),
    [
      '<Action ID="Move">',
      '  <input_port name="goal" type="Pose2D" default="a&amp;b" description="g&quot;oal" enum="auto;manual"/>',
      "</Action>",
    ].join("\n"),
  );
});

test("getSafeLintFixes appends BT123 definitions to existing TreeNodesModel", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move goal="{goal}"/></BehaviorTree><TreeNodesModel></TreeNodesModel></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const fixes = getSafeLintFixes({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: {
          kind: "missing-local-model-definition",
          nodeId: "Move",
          sourceKind: "inline-tree-nodes-model",
          fix: {
            kind: "add-local-definition",
            uri: "tree.xml",
            nodeId: "Move",
            model: {
              id: "Move",
              kind: "Action",
              ports: [{ direction: "input", name: "goal", type: "Pose2D" }],
            },
          },
        },
      },
    ],
  });

  assert.equal(fixes.length, 1);
  const updated = applyTextEdits(parsed.document.originalText, fixes[0]?.edits ?? []);
  assert.ok(updated.includes('<Action ID="Move">'));
  assert.ok(updated.includes('<input_port name="goal" type="Pose2D"/>'));
});

test("getSafeLintFixes creates TreeNodesModel block for BT123 when missing", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const fixes = getSafeLintFixes({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: {
          kind: "missing-local-model-definition",
          nodeId: "Sequence",
          sourceKind: "inline-tree-nodes-model",
          fix: {
            kind: "add-local-definition",
            uri: "tree.xml",
            nodeId: "Sequence",
            model: {
              id: "Sequence",
              kind: "Control",
              ports: [],
            },
          },
        },
      },
    ],
  });

  assert.equal(fixes.length, 1);
  const updated = applyTextEdits(parsed.document.originalText, fixes[0]?.edits ?? []);
  assert.ok(updated.includes("<TreeNodesModel>"));
  assert.ok(updated.includes('<Control ID="Sequence"/>'));
});

test("getSafeLintFixes expands self-closing TreeNodesModel for BT123", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree><TreeNodesModel/></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const fixes = getSafeLintFixes({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: {
          kind: "missing-local-model-definition",
          nodeId: "Sequence",
          sourceKind: "inline-tree-nodes-model",
          fix: {
            kind: "add-local-definition",
            uri: "tree.xml",
            nodeId: "Sequence",
            model: {
              id: "Sequence",
              kind: "Control",
              ports: [],
            },
          },
        },
      },
    ],
  });

  assert.equal(fixes.length, 1);
  const updated = applyTextEdits(parsed.document.originalText, fixes[0]?.edits ?? []);
  assert.equal((updated.match(/<TreeNodesModel/g) ?? []).length, 1);
  assert.ok(updated.includes("<TreeNodesModel>"));
  assert.ok(updated.includes("</TreeNodesModel>"));
  assert.ok(updated.includes('<Control ID="Sequence"/>'));
});
