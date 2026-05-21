import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import { buildLocalBtDocumentView } from "@btxml/semantic/ast-view";
import { parseBtXml } from "@btxml/syntax";

const config = getDefaultResolvedBtxmlConfig();

test("BlackboardReferenceView extracts multiple braced references with precise ranges", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Move goal="prefix {target} + {fallback}" />
  </BehaviorTree>
</root>`;
  const parsed = parseBtXml(text, { uri: "blackboard.xml" });
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config });
  const bindings = view.nodes[0]?.portBindings[0]?.blackboardReferences;

  assert.equal(bindings?.length, 2);
  assert.deepEqual(
    bindings?.map((reference) => ({
      raw: reference.raw,
      key: reference.key,
      text: text.slice(reference.range.start.offset, reference.range.end.offset),
    })),
    [
      { raw: "{target}", key: "target", text: "{target}" },
      { raw: "{fallback}", key: "fallback", text: "{fallback}" },
    ],
  );
});

test("BlackboardReferenceView ignores plain literals and marks malformed references invalid", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Move goal="plain-value" />
    <Move goal="{broken" />
  </BehaviorTree>
</root>`,
    { uri: "blackboard-invalid.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config });
  const plainBinding = view.nodes[0]?.portBindings[0];
  const invalidBinding = view.nodes[1]?.portBindings[0];

  assert.deepEqual(plainBinding?.blackboardReferences, []);
  assert.equal(invalidBinding?.blackboardReferences.length, 1);
  assert.equal(invalidBinding?.blackboardReferences[0]?.syntax, "invalid");
  assert.equal(invalidBinding?.blackboardReferences[0]?.raw, "{broken");
  assert.equal(invalidBinding?.blackboardReferences[0]?.key, "{broken");
});
