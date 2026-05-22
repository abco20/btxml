import assert from "node:assert/strict";
import test from "node:test";
import type { TextEdit } from "@btxml/foundation";
import {
  createLanguageService,
  createTextDocument,
  defaultEffectiveConfig,
} from "./test-helpers.js";

function applyTextEdits(text: string, edits: readonly TextEdit[]) {
  const sorted = [...edits].sort(
    (left, right) => right.range.start.offset - left.range.start.offset,
  );
  let output = text;
  for (const edit of sorted) {
    output =
      output.slice(0, edit.range.start.offset) + edit.newText + output.slice(edit.range.end.offset);
  }
  return output;
}

test("code action adds missing required port from semantic usage", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const diagnostics = ls.getDiagnostics({ document: doc }).diagnostics;
  const actions = ls.getCodeActions({ document: doc, diagnostics });

  assert.ok(actions.actions.some((action) => action.title === "Add missing port goal"));
});

test("code action removes only undeclared ports from semantic usage", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" extra="value"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
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
  const diagnostics = ls.getDiagnostics({ document: doc }).diagnostics;
  const actions = ls.getCodeActions({ document: doc, diagnostics });

  assert.ok(actions.actions.some((action) => action.title === "Remove unknown port extra"));
});

test("code action adds missing output remap attribute", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Foo/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Foo">
      <output_port name="result" type="int"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const diagnostics = ls.getDiagnostics({ document: doc }).diagnostics;
  const actions = ls.getCodeActions({ document: doc, diagnostics });

  const action = actions.actions.find(
    (candidate) => candidate.title === "Remap output port result",
  );
  assert.ok(action);

  const actual = applyTextEdits(text, action.edits);
  const expected = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Foo result="{result}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Foo">
      <output_port name="result" type="int"/>
    </Action>
  </TreeNodesModel>
</root>`;
  assert.equal(actual, expected);
});

test("code action rewrites literal output binding to blackboard remap", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Foo result="123"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Foo">
      <output_port name="result" type="int"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const diagnostics = ls.getDiagnostics({ document: doc }).diagnostics;
  const actions = ls.getCodeActions({ document: doc, diagnostics });

  const action = actions.actions.find(
    (candidate) => candidate.title === "Remap output port result",
  );
  assert.ok(action);

  const actual = applyTextEdits(text, action.edits);
  const expected = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Foo result="{result}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Foo">
      <output_port name="result" type="int"/>
    </Action>
  </TreeNodesModel>
</root>`;
  assert.equal(actual, expected);
});
