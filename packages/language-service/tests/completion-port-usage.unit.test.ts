import assert from "node:assert/strict";
import test from "node:test";
import {
  createLanguageService,
  createTextDocument,
  defaultEffectiveConfig,
} from "./test-helpers.js";

test("completion uses semantic subtree usage ports in strict mode", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" />
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({
    config: {
      ...defaultEffectiveConfig,
      linter: {
        ...defaultEffectiveConfig.linter,
        rules: {
          ...defaultEffectiveConfig.linter.rules,
          "model/no-unknown-port": ["error", { subTreePorts: "strict" }],
        },
      },
    },
  });
  const pos = doc.positionAt(text.indexOf('Child" />') + 7);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(result.items.some((item) => item.label === "_autoremap"));
  assert.equal(
    result.items.some((item) => item.label === "goal"),
    false,
  );
});

test("completion uses resolved semantic port usage for value completions", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" enabled=""/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="enabled" type="bool"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('enabled=""') + 'enabled="'.length);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(result.items.some((item) => item.label === "true"));
  assert.ok(result.items.some((item) => item.label === "false"));
});
