import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import type { EffectiveFileConfig } from "@btxml/config";
import { createTextDocument } from "@btxml/foundation";
import { createLanguageService } from "@btxml/language-service";

const defaultEffectiveConfig = getEffectiveConfigForFile(
  getDefaultResolvedBtxmlConfig(),
  "test.xml",
);

const allowAmbiguousConfig: EffectiveFileConfig = {
  ...defaultEffectiveConfig,
  resolver: {
    ...defaultEffectiveConfig.resolver,
    behaviorTreeIds: "allow-ambiguous",
  },
};

function createDoc(text: string, uri = "file:///test.xml") {
  return createTextDocument(uri, text);
}

test("v0.4 language service supports completion hover definition symbols and code actions", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><Action ID="A"/></Sequence></BehaviorTree></root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const completions = ls.getCompletions({
    document: doc,
    position: doc.positionAt(text.indexOf("<Sequence") + 1),
  });
  assert.ok(completions.items.length > 0);

  const hover = ls.getHover({
    document: doc,
    position: doc.positionAt(text.indexOf("Sequence") + 2),
  });
  assert.ok(hover.contents);

  const def = ls.getDefinition({
    document: doc,
    position: doc.positionAt(text.indexOf("Sequence") + 2),
  });
  // Sequence might not have a definition location if it's a built-in without a source file in this test setup
  assert.ok(Array.isArray(def.locations));

  const symbols = ls.getDocumentSymbols({ document: doc });
  assert.ok(symbols.symbols.length > 0);

  const actions = ls.getCodeActions({
    document: doc,
    range: { start: doc.positionAt(0), end: doc.positionAt(text.length) },
    diagnostics: [],
  });
  assert.ok(Array.isArray(actions.actions));
});

test("definition jumps to SubTree model port", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" target="{goal}"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const attrPos = doc.positionAt(text.indexOf("target") + 2);
  const result = ls.getDefinition({ document: doc, position: attrPos });
  assert.ok(result.locations.length > 0);
  assert.ok(result.locations.some((loc) => loc.range && loc.uri === doc.uri));
});

test("definition jumps to local BehaviorTree for SubTree target", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const attrPos = doc.positionAt(text.indexOf('ID="Child"') + 5);
  const result = ls.getDefinition({ document: doc, position: attrPos });
  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0]?.uri, doc.uri);
  assert.equal(doc.getText(result.locations[0]?.range), 'ID="Child"');
});

test("definition from runtime SubTree includes matching BehaviorTree and SubTree model", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const attrPos = doc.positionAt(text.indexOf('<SubTree ID="Child"/>') + '<SubTree ID="'.length);
  const result = ls.getDefinition({ document: doc, position: attrPos });

  assert.equal(result.locations.length, 2);
  assert.equal(result.locations[0]?.uri, doc.uri);
  assert.equal(result.locations[1]?.uri, doc.uri);
  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    'ID="Child"',
    'ID="Child"',
  ]);
  assert.deepEqual(
    result.locations
      .map((location) => location.range.start.offset)
      .sort((left, right) => left - right),
    [
      text.indexOf('<BehaviorTree ID="Child">') + "<BehaviorTree ".length,
      text.lastIndexOf('<SubTree ID="Child">') + "<SubTree ".length,
    ],
  );
});

test("definition jumps from generic Action ID usage to concrete model definition", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const idPos = doc.positionAt(text.indexOf('ID="MoveBase" goal') + 5);
  const result = ls.getDefinition({ document: doc, position: idPos });

  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0]?.uri, doc.uri);
  assert.equal(doc.getText(result.locations[0]?.range), 'ID="MoveBase"');
});

test("definition for generic Action ID uses the effective resolved model only", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Sequence"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Sequence">
      <input_port name="custom" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const idPos = doc.positionAt(text.indexOf('ID="Sequence"/>') + 5);
  const result = ls.getDefinition({ document: doc, position: idPos });

  assert.equal(result.locations.length, 1);
  assert.equal(doc.getText(result.locations[0]?.range), 'ID="Sequence"');
});

test("definition jumps from generic Action tag name to concrete model definition", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const tagPos = doc.positionAt(text.indexOf('<Action ID="MoveBase" goal') + 2);
  const result = ls.getDefinition({ document: doc, position: tagPos });

  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0]?.uri, doc.uri);
  assert.equal(doc.getText(result.locations[0]?.range), 'ID="MoveBase"');
});

test("definition jumps to SubTree model target when no BehaviorTree target exists", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const attrPos = doc.positionAt(text.indexOf('ID="Child"/>') + 5);
  const result = ls.getDefinition({ document: doc, position: attrPos });

  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0]?.uri, doc.uri);
  assert.equal(doc.getText(result.locations[0]?.range), 'ID="Child"');
});

test("definition jumps from SubTree model definition to matching BehaviorTree", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const idPos = doc.positionAt(text.lastIndexOf('<SubTree ID="Child">') + '<SubTree ID="'.length);
  const result = ls.getDefinition({ document: doc, position: idPos });
  const behaviorTreeIdOffset = text.indexOf('<BehaviorTree ID="Child">') + "<BehaviorTree ".length;

  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0]?.uri, doc.uri);
  assert.equal(doc.getText(result.locations[0]?.range), 'ID="Child"');
  assert.equal(result.locations[0]?.range.start.offset, behaviorTreeIdOffset);
});

test("definition returns behavior tree and subtree model candidates for ambiguous SubTree targets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysFailure/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: allowAmbiguousConfig });
  const attrPos = doc.positionAt(text.indexOf('<SubTree ID="Child"/>') + 13);
  const result = ls.getDefinition({ document: doc, position: attrPos });

  assert.equal(result.locations.length, 3);
  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    'ID="Child"',
    'ID="Child"',
    'ID="Child"',
  ]);
});

test("definition jumps from script local usage to earlier declaration", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Script code="ready:=true"/>
      <AlwaysSuccess _successIf="ready"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('_successIf="ready') + '_successIf="'.length + 2);
  const result = ls.getDefinition({ document: doc, position: pos });
  const location = result.locations[0];

  assert.equal(result.locations.length, 1);
  assert.equal(doc.getText(location?.range), "ready");
  assert.equal(location?.range.start.offset, text.indexOf("ready:=true"));
});

test("definition jumps from script remapped blackboard usage to source port definition", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <ReadPose pose="{target}"/>
      <MoveTo target="{target}" _successIf="target == 1"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ReadPose">
      <output_port name="pose" type="double"/>
    </Action>
    <Action ID="MoveTo">
      <input_port name="target" type="double"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('_successIf="target') + '_successIf="'.length + 2);
  const result = ls.getDefinition({ document: doc, position: pos });
  const location = result.locations[0];

  assert.equal(result.locations.length, 1);
  assert.equal(doc.getText(location?.range), 'name="pose"');
});

test("definition jumps from script subtree interface usage to SubTree model port definition", () => {
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
      <AlwaysSuccess _successIf="position &gt; 0"/>
      <Script code="done:=true"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('_successIf="position') + '_successIf="'.length + 2);
  const result = ls.getDefinition({ document: doc, position: pos });
  const location = result.locations[0];

  assert.equal(result.locations.length, 1);
  assert.equal(doc.getText(location?.range), 'name="position"');
});

test("definition maps decoded script identifier ranges back to raw XML offsets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Script code="ready:=true"/>
      <AlwaysSuccess _successIf="ready &amp;&amp; true"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(
    text.indexOf('_successIf="ready &amp;&amp; true"') + '_successIf="'.length + 2,
  );
  const result = ls.getDefinition({ document: doc, position: pos });
  const location = result.locations[0];

  assert.equal(result.locations.length, 1);
  assert.equal(doc.getText(location?.range), "ready");
  assert.equal(location?.range.start.offset, text.indexOf("ready:=true"));
});

test("definition keeps script locals scoped to the current behavior tree when IDs collide", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Script code="ready:=true"/>
      <AlwaysSuccess _successIf="ready"/>
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="Main">
    <Sequence>
      <AlwaysSuccess _successIf="ready"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const secondUsage = text.lastIndexOf('_successIf="ready"');
  const pos = doc.positionAt(secondUsage + '_successIf="'.length + 2);
  const result = ls.getDefinition({ document: doc, position: pos });

  assert.deepEqual(result.locations, []);
});
