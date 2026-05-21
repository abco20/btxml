import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentModelResult } from "@btxml/model";
import { parseBtXml } from "@btxml/syntax";

test("buildDocumentModelResult separates generic SubTree ports", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><TreeNodesModel><SubTree ID="SubTree"><input_port name="_autoremap" type="bool" default="false"/></SubTree></TreeNodesModel></root>`,
  );
  assert.ok(parsed.document);
  if (!parsed.document) throw new Error("parsed.document is null");
  const result = buildDocumentModelResult(parsed.document);
  assert.equal(
    result.model.treeNodesModel.some((node) => node.id === "SubTree"),
    false,
  );
  assert.ok(result.model.genericSubTreePorts.some((p) => p.name === "_autoremap"));
});

test("buildDocumentModelResult separates generic SubTree ports when root is TreeNodesModel", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><SubTree ID="SubTree"><input_port name="_autoremap" type="bool" default="false"/></SubTree></TreeNodesModel>`,
  );
  assert.ok(parsed.document);
  if (!parsed.document) throw new Error("parsed.document is null");
  const result = buildDocumentModelResult(parsed.document);
  assert.equal(
    result.model.treeNodesModel.some((node) => node.id === "SubTree"),
    false,
  );
  assert.ok(result.model.genericSubTreePorts.some((p) => p.name === "_autoremap"));
});
