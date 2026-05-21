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

test("hover for _autoremap uses workspace generic port info", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" _autoremap="true"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const attrPos = doc.positionAt(text.indexOf("_autoremap") + 2);
  const result = ls.getHover({ document: doc, position: attrPos });
  assert.ok(result.contents);
  assert.ok((result.contents ?? "").includes("bool"));
});

test("hover shows SubTree model port info", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" target="{goal}"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string">Target goal</input_port>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const attrPos = doc.positionAt(text.indexOf("target") + 2);
  const result = ls.getHover({ document: doc, position: attrPos });
  assert.ok(result.contents);
  assert.ok((result.contents ?? "").includes("std::string"));
  assert.ok((result.contents ?? "").includes("Target goal"));
});

test("hover shows concrete node model info for Action tag names", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const tagPos = doc.positionAt(text.indexOf('<Action ID="MoveBase" goal') + 2);
  const result = ls.getHover({ document: doc, position: tagPos });
  assert.ok(result.contents);
  assert.ok((result.contents ?? "").includes("MoveBase"));
  assert.ok((result.contents ?? "").includes("goal"));
});

test("hover shows concrete node model info for generic Action ID attributes", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const idPos = doc.positionAt(text.indexOf('ID="MoveBase" goal') + 5);
  const result = ls.getHover({ document: doc, position: idPos });
  assert.ok(result.contents);
  assert.ok((result.contents ?? "").includes("MoveBase"));
  assert.ok((result.contents ?? "").includes("goal"));
});

test("hover reports ambiguous subtree targets explicitly", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysFailure/></BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="Child">
      <input_port name="target" type="std::string"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: allowAmbiguousConfig });
  const idPos = doc.positionAt(text.indexOf('<SubTree ID="Child"/>') + 13);
  const result = ls.getHover({ document: doc, position: idPos });

  assert.ok(result.contents);
  assert.ok((result.contents ?? "").includes("ambiguously"));
  assert.ok((result.contents ?? "").includes("3 candidates"));
});

test("hover shows script symbol info for remapped blackboard variables", () => {
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
  const result = ls.getHover({ document: doc, position: pos });

  assert.ok((result.contents ?? "").includes("Pose2D"));
  assert.ok((result.contents ?? "").includes("ReadPose.pose"));
});

test("hover shows earlier script declaration info for local variables", () => {
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
  const result = ls.getHover({ document: doc, position: pos });

  assert.ok((result.contents ?? "").includes("bool"));
  assert.ok((result.contents ?? "").includes("earlier code declaration"));
});

test("hover shows enum values for script identifiers", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <AlwaysSuccess _successIf="READY == 1"/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({
    config: defaultEffectiveConfig,
    augmentations: [{ version: 1, script: { enums: { READY: 1 } } }],
  });
  const pos = doc.positionAt(text.indexOf('_successIf="READY') + '_successIf="'.length + 2);
  const result = ls.getHover({ document: doc, position: pos });

  assert.ok((result.contents ?? "").includes("Enum"));
  assert.ok((result.contents ?? "").includes("1"));
});

test("hover keeps script locals scoped to the current behavior tree when IDs collide", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sequence>
      <Script code="left:=true"/>
      <AlwaysSuccess _successIf="left"/>
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="Main">
    <Sequence>
      <AlwaysSuccess _successIf="left"/>
    </Sequence>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const secondUsage = text.lastIndexOf('_successIf="left"');
  const pos = doc.positionAt(secondUsage + '_successIf="'.length + 2);
  const result = ls.getHover({ document: doc, position: pos });

  assert.equal((result.contents ?? "").includes("**Script Symbol**"), false);
  assert.equal((result.contents ?? "").includes("earlier code declaration"), false);
});
