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
      scope: reference.scope,
      identity: reference.identity,
      text: text.slice(reference.range.start.offset, reference.range.end.offset),
    })),
    [
      {
        raw: "{target}",
        key: "target",
        scope: "local",
        identity: "local:target",
        text: "{target}",
      },
      {
        raw: "{fallback}",
        key: "fallback",
        scope: "local",
        identity: "local:fallback",
        text: "{fallback}",
      },
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

test("BlackboardReferenceView extracts global and local references with separate identities", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <A x="{value}" />
      <B y="{@value}" />
    </Sequence>
  </BehaviorTree>
</root>`,
    { uri: "blackboard-scope.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config });
  const refs = view.nodes.flatMap((node) =>
    node.portBindings.flatMap((binding) => binding.blackboardReferences),
  );

  assert.equal(refs[0]?.scope, "local");
  assert.equal(refs[0]?.key, "value");
  assert.equal(refs[0]?.identity, "local:value");
  assert.equal(refs[1]?.scope, "global");
  assert.equal(refs[1]?.key, "value");
  assert.equal(refs[1]?.raw, "{@value}");
  assert.equal(refs[1]?.identity, "global:value");
  assert.deepEqual(
    refs.map((reference) => reference.identity),
    ["local:value", "global:value"],
  );
});

test("BlackboardReferenceView extracts shorthand substitution references", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <PrintNumber val="=" />
  </BehaviorTree>
</root>`,
    { uri: "blackboard-shorthand.xml" },
  );
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config });
  const binding = view.nodes[0]?.portBindings[0];
  const reference = binding?.blackboardReferences[0];

  assert.equal(reference?.syntax, "shorthand");
  assert.equal(reference?.key, "val");
  assert.equal(reference?.identity, "local:val");
});

test("BlackboardReferenceView trims shorthand raw and narrows range to '='", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <PrintNumber val=" = " />
  </BehaviorTree>
</root>`;
  const parsed = parseBtXml(text, { uri: "blackboard-shorthand-spaces.xml" });
  assert.ok(parsed.document);

  const view = buildLocalBtDocumentView(parsed.document, { config });
  const reference = view.nodes[0]?.portBindings[0]?.blackboardReferences[0];

  assert.equal(reference?.raw, "=");
  assert.equal(
    reference ? text.slice(reference.range.start.offset, reference.range.end.offset) : "",
    "=",
  );
});
