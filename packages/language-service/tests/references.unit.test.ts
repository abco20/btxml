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

test("references for BehaviorTree definition use semantic subtree references", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(
    text.lastIndexOf('<BehaviorTree ID="Child">') + '<BehaviorTree ID="'.length,
  );
  const result = ls.getReferences({ document: doc, position: pos });

  assert.equal(result.locations.length, 2);
  assert.ok(result.locations.every((location) => location.uri === doc.uri));
  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    'ID="Child"',
    'ID="Child"',
  ]);
});

test("references for SubTree model definition use semantic subtree references", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
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
  const pos = doc.positionAt(text.indexOf('<SubTree ID="Child">') + '<SubTree ID="'.length);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.equal(result.locations.length, 2);
  assert.ok(result.locations.every((location) => location.uri === doc.uri));
  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    'ID="Child"',
    'ID="Child"',
  ]);
});

test("references from a SubTree usage work without workspace context", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('<SubTree ID="Child"/>') + '<SubTree ID="'.length);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.equal(result.locations.length, 2);
  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    'ID="Child"',
    'ID="Child"',
  ]);
});

test("references union ambiguous subtree definition candidates", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysSuccess/>
  </BehaviorTree>
  <BehaviorTree ID="Child">
    <AlwaysFailure/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: allowAmbiguousConfig });
  const pos = doc.positionAt(text.indexOf('<SubTree ID="Child"/>') + '<SubTree ID="'.length);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.equal(result.locations.length, 2);
  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    'ID="Child"',
    'ID="Child"',
  ]);
});

test("references include flow-resolved script locals across later script-bearing nodes", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Script code="ready:=true"/>
      <AlwaysSuccess _successIf="ready"/>
      <Script code="ready = false"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('_successIf="ready') + '_successIf="'.length + 2);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    "ready",
    "ready",
    "ready",
  ]);
});

test("references include script occurrences for remapped blackboard symbols", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <ReadPose pose="{target}"/>
      <MoveTo target="{target}" _successIf="target == target"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ReadPose">
      <output_port name="pose" type="Pose2D"/>
    </Action>
    <Action ID="MoveTo">
      <input_port name="target" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('_successIf="target') + '_successIf="'.length + 2);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    "target",
    "target",
  ]);
});

test("references keep script locals scoped to the current behavior tree when IDs collide", () => {
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
  const result = ls.getReferences({ document: doc, position: pos });

  assert.deepEqual(result.locations, []);
});

test("references treat global script and port remap identifiers as the same identity", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <PrintNumber val="{@value}"/>
      <AlwaysSuccess _successIf="@value &gt; 0"/>
      <PrintNumber val="{value}"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="PrintNumber">
      <input_port name="val" type="double"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('_successIf="@value') + '_successIf="'.length + 3);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    "@value",
    "{@value}",
  ]);
});

test("references from a blackboard remap include matching script identifiers", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <PrintNumber val="{@value}"/>
      <AlwaysSuccess _successIf="@value &gt; 0"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="PrintNumber">
      <input_port name="val" type="double"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("{@value}") + 2);
  const result = ls.getReferences({ document: doc, position: pos });

  assert.deepEqual(result.locations.map((location) => doc.getText(location.range)).sort(), [
    "@value",
    "{@value}",
  ]);
});
