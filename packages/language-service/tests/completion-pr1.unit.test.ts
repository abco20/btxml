import assert from "node:assert/strict";
import test from "node:test";
import {
  createLanguageService,
  createTextDocument,
  defaultEffectiveConfig,
} from "./test-helpers.ts";

function createDoc(text: string, uri = "file:///test.xml") {
  return createTextDocument(uri, text);
}

test("node completion inserts only the node id for generic control nodes", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Control ID="RetryNode">
      <input_port name="num_attempts" type="int"/>
    </Control>
  </TreeNodesModel>
  <BehaviorTree ID="Main">
    <Ret
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <Ret\n") + "    <Ret".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "RetryNode");
  assert.ok(item);
  assert.equal(item?.insertTextFormat, undefined);
  assert.equal(item?.insertText, "RetryNode");
  assert.equal(
    result.items.some((candidate) => candidate.insertText?.includes("</RetryNode>")),
    false,
  );
});
