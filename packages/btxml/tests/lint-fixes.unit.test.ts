import assert from "node:assert/strict";
import test from "node:test";
import { applyTextEdits } from "@btxml/foundation";
import { parseBtXml } from "@btxml/syntax";
import {
  getLintFixCandidates,
  getSafeLintFixes,
  serializeTreeNodeModelDefinition,
} from "../src/repair/lint-fixes.ts";

function makeRange(start: number, end: number) {
  return {
    start: { line: 0, character: 0, offset: start },
    end: { line: 0, character: 0, offset: end },
  };
}

test("getLintFixCandidates classifies BT002 and BT122 as safe", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root><BehaviorTree ID="Main"><AlwaysSuccess/></BehaviorTree></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const candidates = getLintFixCandidates({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT002_MISSING_BTCPP_FORMAT",
        severity: "warning",
        message: "missing format",
        uri: "tree.xml",
      },
      {
        code: "BT122_DUPLICATE_MODEL_DEFINITION",
        severity: "error",
        message: "duplicate",
        uri: "models.xml",
        data: {
          fix: {
            kind: "delete-non-canonical-definitions",
            delete: [{ uri: "tree.xml", range: makeRange(10, 20) }],
          },
        },
      },
    ],
  });

  const bt002 = candidates.find((entry) => entry.diagnosticCode === "BT002_MISSING_BTCPP_FORMAT");
  const bt122 = candidates.find(
    (entry) => entry.diagnosticCode === "BT122_DUPLICATE_MODEL_DEFINITION",
  );
  assert.equal(bt002?.safety, "safe");
  assert.equal(bt122?.safety, "safe");
});

test("getLintFixCandidates classifies BT121 and BT123 as unsafe", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel/></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const candidates = getLintFixCandidates({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT121_UNUSED_MODEL_DEFINITION",
        severity: "error",
        message: "unused",
        uri: "tree.xml",
        data: {
          fix: {
            kind: "delete-definition",
            uri: "tree.xml",
            range: makeRange(10, 20),
          },
        },
      },
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: {
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

  const bt121 = candidates.find(
    (entry) => entry.diagnosticCode === "BT121_UNUSED_MODEL_DEFINITION",
  );
  const bt123 = candidates.find(
    (entry) => entry.diagnosticCode === "BT123_MISSING_LOCAL_MODEL_DEFINITION",
  );
  assert.equal(bt121?.safety, "unsafe");
  assert.equal(bt123?.safety, "unsafe");
});

test("getSafeLintFixes applies only safe candidates", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel/></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const safeEdits = getSafeLintFixes({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT002_MISSING_BTCPP_FORMAT",
        severity: "warning",
        message: "missing format",
        uri: "tree.xml",
      },
      {
        code: "BT121_UNUSED_MODEL_DEFINITION",
        severity: "error",
        message: "unused",
        uri: "tree.xml",
        data: {
          fix: {
            kind: "delete-definition",
            uri: "tree.xml",
            range: makeRange(10, 20),
          },
        },
      },
    ],
  });

  assert.equal(safeEdits.length, 1);
  const updated = applyTextEdits(parsed.document.originalText, safeEdits[0]?.edits ?? []);
  assert.equal(updated.includes('BTCPP_format="4"'), true);
});

test("serializeTreeNodeModelDefinition keeps XML escaping behavior", () => {
  assert.equal(
    serializeTreeNodeModelDefinition({
      id: "Move",
      kind: "Action",
      ports: [
        {
          direction: "input",
          name: "goal",
          defaultValue: 'a&b"c',
        },
      ],
    }),
    [
      '<Action ID="Move">',
      '  <input_port name="goal" default="a&amp;b&quot;c"/>',
      "</Action>",
    ].join("\n"),
  );
});

test("getLintFixCandidates ignores BT121/BT122/BT123 without fix metadata", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel/></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const candidates = getLintFixCandidates({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT121_UNUSED_MODEL_DEFINITION",
        severity: "error",
        message: "unused",
        uri: "tree.xml",
        data: { kind: "unused-model-definition" },
      },
      {
        code: "BT122_DUPLICATE_MODEL_DEFINITION",
        severity: "error",
        message: "duplicate",
        uri: "tree.xml",
        data: { kind: "duplicate-model-definition" },
      },
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: { kind: "missing-local-model-definition" },
      },
    ],
  });

  assert.equal(candidates.length, 0);
});

test("getLintFixCandidates dedupes BT123 local model additions by nodeId", () => {
  const parsed = parseBtXml(
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Move/></BehaviorTree><TreeNodesModel/></root>',
    { uri: "tree.xml" },
  );
  assert.ok(parsed.document);

  const candidates = getLintFixCandidates({
    documents: [parsed.document],
    diagnostics: [
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: {
          fix: {
            kind: "add-local-definition",
            uri: "tree.xml",
            nodeId: "Move",
            model: { id: "Move", kind: "Action", ports: [] },
          },
        },
      },
      {
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        severity: "error",
        message: "missing local",
        uri: "tree.xml",
        data: {
          fix: {
            kind: "add-local-definition",
            uri: "tree.xml",
            nodeId: "Move",
            model: { id: "Move", kind: "Action", ports: [] },
          },
        },
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.diagnosticCode, "BT123_MISSING_LOCAL_MODEL_DEFINITION");
});
