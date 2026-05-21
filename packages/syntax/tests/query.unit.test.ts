import assert from "node:assert/strict";
import test from "node:test";
import {
  findElementAt,
  getAttribute,
  getElementChildren,
  getElementText,
  parseBtXml,
  walkElements,
} from "@btxml/syntax";

test("query helpers: attribute/children/text extraction works", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Action ID="Say" message="hello">text</Action></BehaviorTree></root>`,
  );
  assert.ok(parsed.document?.root);
  const root = parsed.document.root;

  const behaviorTree = getElementChildren(root).find((element) => element.name === "BehaviorTree");
  assert.ok(behaviorTree);

  const action = getElementChildren(behaviorTree).find((element) => element.name === "Action");
  assert.ok(action);

  assert.equal(getAttribute(action, "ID")?.value, "Say");
  assert.equal(getAttribute(action, "message")?.value, "hello");
  assert.equal(getElementText(action), "text");
});

test("query helpers: walkElements traverses all elements in document order", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree></root>`,
  );
  assert.ok(parsed.document);

  const names: string[] = [];
  walkElements(parsed.document, (element) => {
    names.push(element.name);
  });

  assert.deepEqual(names, ["root", "BehaviorTree", "Sequence", "AlwaysSuccess"]);
});

test("query helpers: findElementAt returns innermost element", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="Main"><Sequence><AlwaysSuccess/></Sequence></BehaviorTree></root>`;
  const parsed = parseBtXml(xml);
  assert.ok(parsed.document?.root);

  const offset = xml.indexOf("AlwaysSuccess") + 1;
  const found = findElementAt(parsed.document.root, offset);
  assert.equal(found?.name, "AlwaysSuccess");
});
