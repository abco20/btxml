import assert from "node:assert/strict";
import test from "node:test";
import {
  createLanguageService,
  createTextDocument,
  defaultEffectiveConfig,
} from "./test-helpers.ts";

test("script attribute completion suggests blackboard locals booleans and operators", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <ReadPose pose="{target}"/>
      <Script code="local := 1; "/>
      <AlwaysSuccess _successIf="target "/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ReadPose">
      <output_port name="pose" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({
    config: {
      ...defaultEffectiveConfig,
    },
  });

  const identifierPos = doc.positionAt(
    text.indexOf('code="local := 1; ') + 'code="local := 1; '.length,
  );
  const identifierResult = ls.getCompletions({
    document: doc,
    position: identifierPos,
  });
  assert.ok(
    identifierResult.items.some(
      (item) => item.label === "target" && item.detail === "Pose2D from ReadPose.pose",
    ),
  );
  assert.ok(identifierResult.items.some((item) => item.label === "local"));
  assert.ok(identifierResult.items.some((item) => item.label === "true"));
  assert.ok(identifierResult.items.some((item) => item.label === "false"));

  const operatorPos = doc.positionAt(
    text.indexOf('_successIf="target ') + '_successIf="target '.length,
  );
  const operatorResult = ls.getCompletions({
    document: doc,
    position: operatorPos,
  });
  assert.ok(operatorResult.items.some((item) => item.label === "=="));
  assert.ok(operatorResult.items.some((item) => item.label === ".."));
  assert.ok(operatorResult.items.some((item) => item.label === ":="));
});

test("script code completion suggests assignment operators and snippets at statement start", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Script code="value "/>
    <Script code=""/>
  </BehaviorTree>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const operatorPos = doc.positionAt(text.indexOf('code="value ') + 'code="value '.length);
  const operatorResult = ls.getCompletions({
    document: doc,
    position: operatorPos,
  });
  assert.ok(operatorResult.items.some((item) => item.label === ":="));
  assert.ok(operatorResult.items.some((item) => item.label === "="));
  assert.ok(operatorResult.items.some((item) => item.label === "+="));
  assert.ok(operatorResult.items.some((item) => item.label === "-="));
  assert.ok(operatorResult.items.some((item) => item.label === "*="));
  assert.ok(operatorResult.items.some((item) => item.label === "/="));

  const snippetPos = doc.positionAt(text.indexOf('code=""') + 'code="'.length);
  const snippetResult = ls.getCompletions({
    document: doc,
    position: snippetPos,
  });
  assert.ok(
    snippetResult.items.some((item) => item.label === "name := value" && item.kind === "Snippet"),
  );
  assert.ok(
    snippetResult.items.some((item) => item.label === "name = value" && item.kind === "Snippet"),
  );
});

test("script completion reuses BT.CPP-compatible remap parsing", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <ReadPose pose=" {=} "/>
      <WriteText text="prefix {embedded} suffix"/>
      <AlwaysSuccess _successIf="po"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ReadPose">
      <output_port name="pose" type="Pose2D"/>
    </Action>
    <Action ID="WriteText">
      <output_port name="text" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const pos = doc.positionAt(text.indexOf('_successIf="po') + '_successIf="'.length + 2);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.equal(
    result.items.some((item) => item.label === "pose"),
    true,
  );
  assert.equal(
    result.items.some((item) => item.label === "embedded"),
    false,
  );
});

test("script completion maps decoded ranges back to raw XML offsets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <AlwaysSuccess _successIf="A &amp;&amp; ta"/>
  </BehaviorTree>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const pos = doc.positionAt(text.indexOf('ta"') + 1);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((entry) => entry.label === "true");

  assert.equal(item?.textEdit?.newText, "true");
  assert.equal(doc.getText(item?.textEdit?.range), "ta");
});

test("script completion includes matching SubTree interface ports", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="position" type="float"/>
      <output_port name="done" type="bool"/>
    </SubTree>
  </TreeNodesModel>
  <BehaviorTree ID="Main">
    <SubTree ID="Child" position="{robot_position}" done="{done}"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <Sequence>
      <AlwaysSuccess _successIf="po"/>
      <Script code="do"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const readPos = doc.positionAt(text.indexOf('_successIf="po') + '_successIf="'.length + 2);
  const readResult = ls.getCompletions({ document: doc, position: readPos });
  assert.ok(readResult.items.some((item) => item.label === "position"));

  const writePos = doc.positionAt(text.indexOf('code="do') + 'code="'.length + 2);
  const writeResult = ls.getCompletions({ document: doc, position: writePos });
  assert.ok(writeResult.items.some((item) => item.label === "done"));
});

test("script completion includes global blackboard identifiers", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <PrintNumber val="{@value}"/>
      <AlwaysSuccess _successIf="@v"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="PrintNumber">
      <input_port name="val" type="double"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const pos = doc.positionAt(text.indexOf('_successIf="@v') + '_successIf="'.length + 2);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(
    result.items.some(
      (item) =>
        item.label === "@value" && item.detail === "number from global blackboard PrintNumber.val",
    ),
  );
});

test("script completion replays global assignment in the same script", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Script code="@x := 1; @"/>
  </BehaviorTree>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const pos = doc.positionAt(text.indexOf('code="@x := 1; @') + 'code="@x := 1; @'.length);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(result.items.some((item) => item.label === "@x"));
});

test("script completion includes global remaps from other behavior trees", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Writer">
    <ReadInt value="{@count}"/>
  </BehaviorTree>
  <BehaviorTree ID="Checker">
    <AlwaysSuccess _successIf="@c"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ReadInt">
      <output_port name="value" type="int"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createTextDocument("file:///test.xml", text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const pos = doc.positionAt(text.indexOf('_successIf="@c') + '_successIf="'.length + 2);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(result.items.some((item) => item.label === "@count"));
});
