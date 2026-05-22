import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { createTextDocument } from "@btxml/foundation";
import { createLanguageService } from "@btxml/language-service";

const defaultEffectiveConfig = getEffectiveConfigForFile(
  getDefaultResolvedBtxmlConfig(),
  "test.xml",
);

function createDoc(text: string, uri = "file:///test.xml") {
  return createTextDocument(uri, text);
}

test("SubTree ID value completion suggests BehaviorTree IDs only", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID=""/></BehaviorTree><BehaviorTree ID="child"/></root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('ID=""') + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((i) => i.label === "child"));
  assert.equal(
    result.items.some((i) => i.detail === "SubTree model ID"),
    false,
  );
});

test("tag-name completion suggests SubTree as a built-in tag", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Sub
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <Sub\n") + "    <Sub".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "SubTree");
  assert.ok(item);
  assert.equal(item?.insertText, "SubTree");
  assert.equal(item?.insertTextFormat, undefined);
});

test("tag-name completion suggests generic node tags", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <\n") + "    <".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "Action"));
  assert.ok(result.items.some((item) => item.label === "Condition"));
  assert.ok(result.items.some((item) => item.label === "Control"));
  assert.ok(result.items.some((item) => item.label === "Decorator"));
});

test("attribute-name completion suggests ID for SubTree before target resolution", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree 
  </BehaviorTree>
  <BehaviorTree ID="RecoveryTree"/>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <SubTree \n") + "    <SubTree ".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "ID"));
});

test("attribute-name completion suggests ID for generic tags before target resolution", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action 
    <Condition 
    <Control 
    <Decorator 
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  for (const marker of ["<Action ", "<Condition ", "<Control ", "<Decorator "]) {
    const pos = doc.positionAt(text.indexOf(marker) + marker.length);
    const result = ls.getCompletions({ document: doc, position: pos });
    assert.ok(
      result.items.some((item) => item.label === "ID"),
      marker,
    );
  }
});

test("generic ID value completion filters node models by matching kind", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID=""/>
    <Condition ID=""/>
    <Control ID=""/>
    <Decorator ID=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
    <Condition ID="IsReady"/>
    <Control ID="PipelineSequence"/>
    <Decorator ID="Timeout"/>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const actionPos = doc.positionAt(text.indexOf('<Action ID=""/>') + '<Action ID="'.length);
  const actionResult = ls.getCompletions({ document: doc, position: actionPos });
  assert.ok(actionResult.items.some((item) => item.label === "MoveBase"));
  assert.equal(
    actionResult.items.some((item) => item.label === "PipelineSequence"),
    false,
  );

  const controlPos = doc.positionAt(text.indexOf('<Control ID=""/>') + '<Control ID="'.length);
  const controlResult = ls.getCompletions({ document: doc, position: controlPos });
  assert.ok(controlResult.items.some((item) => item.label === "PipelineSequence"));
  assert.equal(
    controlResult.items.some((item) => item.label === "MoveBase"),
    false,
  );

  const conditionPos = doc.positionAt(
    text.indexOf('<Condition ID=""/>') + '<Condition ID="'.length,
  );
  const conditionResult = ls.getCompletions({ document: doc, position: conditionPos });
  assert.ok(conditionResult.items.some((item) => item.label === "IsReady"));
  assert.equal(
    conditionResult.items.some((item) => item.label === "MoveBase"),
    false,
  );
  assert.equal(
    conditionResult.items.some((item) => item.label === "PipelineSequence"),
    false,
  );
  assert.equal(
    conditionResult.items.some((item) => item.label === "Timeout"),
    false,
  );

  const decoratorPos = doc.positionAt(
    text.indexOf('<Decorator ID=""/>') + '<Decorator ID="'.length,
  );
  const decoratorResult = ls.getCompletions({ document: doc, position: decoratorPos });
  assert.ok(decoratorResult.items.some((item) => item.label === "Timeout"));
  assert.equal(
    decoratorResult.items.some((item) => item.label === "MoveBase"),
    false,
  );
  assert.equal(
    decoratorResult.items.some((item) => item.label === "IsReady"),
    false,
  );
  assert.equal(
    decoratorResult.items.some((item) => item.label === "PipelineSequence"),
    false,
  );
});

test("generic tag attribute completion uses resolved node model ports", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" />
    <Decorator ID="CustomTimeout" />
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
    </Action>
    <Decorator ID="CustomTimeout">
      <input_port name="msec" type="int"/>
    </Decorator>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const actionPos = doc.positionAt(text.indexOf('ID="MoveBase" />') + 'ID="MoveBase" '.length);
  const actionResult = ls.getCompletions({ document: doc, position: actionPos });
  assert.ok(actionResult.items.some((item) => item.label === "goal"));

  const decoratorPos = doc.positionAt(
    text.indexOf('ID="CustomTimeout" />') + 'ID="CustomTimeout" '.length,
  );
  const decoratorResult = ls.getCompletions({ document: doc, position: decoratorPos });
  assert.ok(decoratorResult.items.some((item) => item.label === "msec"));
});

test("generic tag attribute completion does not suggest ports when ID is unresolved", () => {
  const genericTags = [
    { tag: "Action", portName: "action_port" },
    { tag: "Condition", portName: "condition_port" },
    { tag: "Control", portName: "control_port" },
    { tag: "Decorator", portName: "decorator_port" },
  ] as const;
  const scenarios = [
    {
      name: "missing ID",
      usage: ({ tag }: (typeof genericTags)[number]) => `<${tag} `,
      offset: ({ tag }: (typeof genericTags)[number]) => `<${tag} `.length,
    },
    {
      name: "empty ID",
      usage: ({ tag }: (typeof genericTags)[number]) => `<${tag} ID="" `,
      offset: ({ tag }: (typeof genericTags)[number]) => `<${tag} ID="" `.length,
    },
  ] as const;

  for (const scenario of scenarios) {
    const usageLines = genericTags.map((entry) => `    ${scenario.usage(entry)}/>`).join("\n");
    const modelLines = genericTags
      .map(
        ({ tag, portName }) =>
          `    <${tag} ID="${tag}">\n      <input_port name="${portName}" type="bool"/>\n    </${tag}>`,
      )
      .join("\n");
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
${usageLines}
  </BehaviorTree>
  <TreeNodesModel>
${modelLines}
  </TreeNodesModel>
</root>`;
    const doc = createDoc(text);
    const ls = createLanguageService({ config: defaultEffectiveConfig });

    for (const entry of genericTags) {
      const marker = scenario.usage(entry);
      const pos = doc.positionAt(text.indexOf(marker) + scenario.offset(entry));
      const result = ls.getCompletions({ document: doc, position: pos });
      assert.equal(
        result.items.some((item) => item.label === entry.portName),
        false,
        `${scenario.name}: ${entry.tag}`,
      );
    }
  }
});

test("generic tag port value completion resolves through ID", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Gate" enabled=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Gate">
      <input_port name="enabled" type="bool"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('enabled=""') + 'enabled="'.length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "true"));
  assert.ok(result.items.some((item) => item.label === "false"));
});

test("generic tag port value completion does not suggest values when ID is unresolved", () => {
  const genericTags = [
    { tag: "Action", portName: "action_port" },
    { tag: "Condition", portName: "condition_port" },
    { tag: "Control", portName: "control_port" },
    { tag: "Decorator", portName: "decorator_port" },
  ] as const;
  const scenarios = [
    {
      name: "missing ID",
      usage: ({ tag, portName }: (typeof genericTags)[number]) => `<${tag} ${portName}=""/>`,
      offset: ({ tag, portName }: (typeof genericTags)[number]) => `<${tag} ${portName}="`.length,
    },
    {
      name: "empty ID",
      usage: ({ tag, portName }: (typeof genericTags)[number]) => `<${tag} ID="" ${portName}=""/>`,
      offset: ({ tag, portName }: (typeof genericTags)[number]) =>
        `<${tag} ID="" ${portName}="`.length,
    },
  ] as const;

  for (const scenario of scenarios) {
    const usageLines = genericTags.map((entry) => `    ${scenario.usage(entry)}`).join("\n");
    const modelLines = genericTags
      .map(
        ({ tag, portName }) =>
          `    <${tag} ID="${tag}">\n      <input_port name="${portName}" type="bool"/>\n    </${tag}>`,
      )
      .join("\n");
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
${usageLines}
  </BehaviorTree>
  <TreeNodesModel>
${modelLines}
  </TreeNodesModel>
</root>`;
    const doc = createDoc(text);
    const ls = createLanguageService({ config: defaultEffectiveConfig });

    for (const entry of genericTags) {
      const marker = scenario.usage(entry);
      const pos = doc.positionAt(text.indexOf(marker) + scenario.offset(entry));
      const result = ls.getCompletions({ document: doc, position: pos });
      assert.equal(
        result.items.some((item) => item.label === "true"),
        false,
        `${scenario.name}: ${entry.tag}`,
      );
      assert.equal(
        result.items.some((item) => item.label === "false"),
        false,
        `${scenario.name}: ${entry.tag}`,
      );
    }
  }
});

test("attribute-value completion suggests BehaviorTree IDs for SubTree targets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="MainTree"/>
  <BehaviorTree ID="RecoveryTree"/>
  <BehaviorTree ID="DockingTree"/>
  <BehaviorTree ID="Main">
    <SubTree ID=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <SubTree ID="RecoveryTree">
      <input_port name="legacy_model_port" type="bool"/>
    </SubTree>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('ID=""') + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "MainTree"));
  assert.ok(result.items.some((item) => item.label === "RecoveryTree"));
  assert.ok(result.items.some((item) => item.label === "DockingTree"));
  assert.equal(
    result.items.some((item) => item.label === "legacy_model_port"),
    false,
  );
});

test("attribute-value completion suggests BehaviorTree IDs for unquoted SubTree targets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="RecoveryTree"/>
  <BehaviorTree ID="Main">
    <SubTree ID=/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("<SubTree ID=") + "<SubTree ID=".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "RecoveryTree"));
});

test("attribute-value completion keeps suggesting SubTree IDs after opening quote", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="RecoveryTree"/>
  <BehaviorTree ID="Main">
    <SubTree ID="/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('<SubTree ID="') + '<SubTree ID="'.length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "RecoveryTree"));
});

test("attribute-value completion inserts quoted SubTree IDs for unquoted targets", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="RecoveryTree"/>
  <BehaviorTree ID="Main">
    <SubTree ID=/>
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("<SubTree ID=") + "<SubTree ID=".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "RecoveryTree");
  assert.equal(item?.textEdit?.newText, '"RecoveryTree"');
});

test("completion suggests _autoremap from workspace generic ports when built-ins enabled", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" />
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('ID="Child"') + 11);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((i) => i.label === "_autoremap"));
});

test("completion does not suggest _autoremap when built-ins disabled and no external model", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" _autoremap="true"/>
  </BehaviorTree>
  <BehaviorTree ID="Child"><AlwaysSuccess/></BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({
    config: {
      ...defaultEffectiveConfig,
      models: { ...defaultEffectiveConfig.models, builtins: ["none"] },
    },
  });
  const pos = doc.positionAt(text.indexOf("<SubTree") + 8);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(
    result.items.some((i) => i.label === "_autoremap"),
    false,
  );
});

test("completion does not suggest BT.CPP built-ins when models.builtins is none", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({
    config: {
      ...defaultEffectiveConfig,
      models: { ...defaultEffectiveConfig.models, builtins: ["none"] },
    },
  });
  const pos = doc.positionAt(text.indexOf("    <") + 5);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(
    result.items.some((item) => item.label === "AlwaysSuccess"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "Parallel"),
    false,
  );
});

test("completion suggests BT.CPP built-ins when models.builtins includes btcpp-v4", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <") + 5);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "AlwaysSuccess"));
  assert.ok(result.items.some((item) => item.label === "Parallel"));
});

test("completion suggests SubTree model port names", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="Child" />
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
  const pos = doc.positionAt(text.indexOf('Child" />') + 7);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((i) => i.label === "target"));
});

test("completion suggests BehaviorTree remap ports after SubTree ID is resolved", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SubTree ID="RecoveryTree" />
  </BehaviorTree>
  <BehaviorTree ID="RecoveryTree">
    <Action ID="MoveBase" goal="{target}" result="{status}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D"/>
      <output_port name="result" type="std::string"/>
    </Action>
    <Action ID="RecoveryTree">
      <input_port name="wrong_model_port" type="Pose2D"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('" />') + 2);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "_autoremap"));
  assert.equal(
    result.items.some((item) => item.label === "goal"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "result"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "wrong_model_port"),
    false,
  );
});

test("completion suggests resolved subtree ports from local BehaviorTree definition", () => {
  const localUri = "file:///test.xml";
  const externalUri = "file:///external.xml";
  const mainText = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="SharedTree">
    <Action ID="UsePose" goal="{goal}"/>
  </BehaviorTree>
  <BehaviorTree ID="Main">
    <SubTree ID="SharedTree" />
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="UsePose">
      <input_port name="goal" type="Pose2D"/>
    </Action>
    <Action ID="SharedTree">
      <input_port name="legacy_model_port" type="bool"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const externalText = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="SharedTree">
    <Action ID="UseStatus" status="{status}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="UseStatus">
      <input_port name="status" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(mainText, localUri);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(mainText.indexOf('" />') + 2);
  const result = ls.getCompletions({
    document: doc,
    position: pos,
    workspace: {
      documents: [createDoc(mainText, localUri), createDoc(externalText, externalUri)],
    },
  } as Parameters<typeof ls.getCompletions>[0] & {
    workspace: { documents: ReturnType<typeof createDoc>[] };
  });
  assert.equal(
    result.items.some((item) => item.label === "goal"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "legacy_model_port"),
    false,
  );
});

test("attribute value completion suggests bool for SubTree model port", () => {
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
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('enabled=""') + 9);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((i) => i.label === "true"));
  assert.ok(result.items.some((i) => i.label === "false"));
});

test("attribute value completion suggests blackboard keys from semantic document view", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" output="{goal}"/>
    <Action ID="Reader" input="{"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="output" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input="{"') + 8);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((i) => i.label === "goal"));
});

test("blackboard completion detail uses effective node type for generic tags", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" output="{goal}"/>
    <Action ID="Reader" input=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="output" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input=""') + 7);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "{goal}");

  assert.equal(item?.detail, "std::string blackboard key from Writer.output");
});

test("blackboard completion filters empty and brace-only keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" ok="{goal}" empty="{}" nested="{{}}" spaced="{ }"/>
    <Action ID="Reader" input="{"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="ok" type="std::string"/>
      <output_port name="empty" type="std::string"/>
      <output_port name="nested" type="std::string"/>
      <output_port name="spaced" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input="{"') + 8);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "goal"));
  assert.equal(
    result.items.some((item) => item.label === "{}"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "{{}}"),
    false,
  );
});

test("blackboard completion inserts bare key inside braces", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" output="{goal}"/>
    <Action ID="Reader" input="{"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="output" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input="{"') + 8);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "goal");
  assert.equal(item?.insertText, "goal");
  assert.equal(item?.textEdit?.newText, "goal");
});

test("blackboard completion inserts bare key inside existing braces with prefix", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" output="{goal}"/>
    <Action ID="Reader" input="{go}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="output" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input="{go}"') + 10);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "goal");
  assert.equal(item?.insertText, "goal");
  assert.equal(item?.textEdit?.newText, "goal");
});

test("blackboard completion inserts wrapped key inside quotes without braces", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" output="{goal}"/>
    <Action ID="Reader" input=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="output" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input=""') + 7);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "{goal}");
  assert.equal(item?.insertText, "{goal}");
  assert.equal(item?.textEdit?.newText, "{goal}");
});

test("attribute value completion suggests shorthand equals remap keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" goal="="/>
    <Action ID="Reader" input="{"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="goal" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input="{"') + 8);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(result.items.some((item) => item.label === "goal"));
});

test("attribute value completion suggests scoped local and global blackboard keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" local_out="{goal}" global_out="{@value}"/>
    <Action ID="Reader" input=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="local_out" type="std::string"/>
      <output_port name="global_out" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input=""') + 'input="'.length);
  const result = ls.getCompletions({ document: doc, position: pos });

  assert.ok(result.items.some((item) => item.label === "{goal}"));
  assert.ok(result.items.some((item) => item.label === "{@value}"));
});

test("blackboard completion suggests bare scoped identifiers inside braces", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" local_out="{goal}" global_out="{@value}"/>
    <Action ID="Reader" local_input="{" global_input="{@}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="local_out" type="std::string"/>
      <output_port name="global_out" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="local_input" type="std::string"/>
      <input_port name="global_input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });

  const localPos = doc.positionAt(text.indexOf('local_input="{"') + 'local_input="{'.length);
  const localResult = ls.getCompletions({ document: doc, position: localPos });
  const localItem = localResult.items.find((item) => item.label === "goal");
  assert.ok(localItem);
  assert.equal(localItem?.textEdit?.newText, "goal");

  const globalPos = doc.positionAt(text.indexOf('global_input="{@}"') + 'global_input="{@'.length);
  const globalResult = ls.getCompletions({ document: doc, position: globalPos });
  const globalItem = globalResult.items.find((item) => item.label === "@value");
  assert.ok(globalItem);
  assert.equal(globalItem?.textEdit?.newText, "value");
});

test("typed blackboard completion excludes extracted keys that still contain braces", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SetName value="{{robot_name}}"/>
    <UseName target="{ro"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="SetName">
      <output_port name="value" type="const std::string&"/>
    </Action>
    <Action ID="UseName">
      <input_port name="target" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('target="{ro"') + 10);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(
    result.items.some((candidate) => candidate.label === "{robot_name}"),
    false,
  );
  assert.equal(
    result.items.some((candidate) => candidate.label === "{{robot_name}}"),
    false,
  );
});

test("attribute-name completion works at an empty slot inside an unfinished start tag", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
  <BehaviorTree ID="Main">
    <Reader${" "}
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <Reader ") + "    <Reader ".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "input"));
  assert.equal(
    result.items.some((item) => item.label === "AlwaysSuccess"),
    false,
  );
});

test("attribute-name completion keeps working on later lines of an unfinished start tag", () => {
  const gap = "            ";
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
      <output_port name="result" type="std::string"/>
    </Action>
  </TreeNodesModel>
  <BehaviorTree ID="Main">
    <Reader input="{goal}"
${gap}
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf(`${gap}\n`) + gap.length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "result"));
  assert.equal(
    result.items.some((item) => item.label === "input"),
    false,
  );
});

test("attribute value completion works for unfinished bool values", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="Gate">
      <input_port name="enabled" type="bool"/>
    </Action>
  </TreeNodesModel>
  <BehaviorTree ID="Main">
    <Gate enabled="
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('    <Gate enabled="') + '    <Gate enabled="'.length);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "true"));
  assert.ok(result.items.some((item) => item.label === "false"));
});

test("node completion inserts only the node id for action nodes with required ports", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <TreeNodesModel>
    <Action ID="GoToPose">
      <input_port name="target" type="Pose"/>
      <output_port name="status" type="std::string"/>
    </Action>
  </TreeNodesModel>
  <BehaviorTree ID="Main">
    <
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <\n") + "    <".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "GoToPose");
  assert.equal(item?.insertTextFormat, undefined);
  assert.equal(item?.insertText, "GoToPose");
});

test("node completion stops at the control node name", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Seq
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <Seq\n") + "    <Seq".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "Sequence");
  assert.ok(item);
  assert.equal(item?.insertTextFormat, undefined);
  assert.equal(item?.insertText, "Sequence");
  assert.equal(
    result.items.some((candidate) => candidate.label === "Sequence>"),
    false,
  );
  assert.equal(
    result.items.some((candidate) => candidate.insertText === "Sequence>\n  $0\n</Sequence>"),
    false,
  );
});

test("node completion stops at the decorator node name even with required ports", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <\n") + "    <".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "Delay");
  assert.ok(item);
  assert.equal(item?.insertTextFormat, undefined);
  assert.equal(item?.insertText, "Delay");
});

test("node completion for control nodes does not offer full-tag variants", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Par
  </BehaviorTree>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("    <Par\n") + "    <Par".length);
  const result = ls.getCompletions({ document: doc, position: pos });
  const item = result.items.find((candidate) => candidate.label === "Parallel");
  assert.ok(item);
  assert.equal(item?.insertText, "Parallel");
  assert.equal(
    result.items.some((candidate) => candidate.label === "Parallel>"),
    false,
  );
  assert.equal(
    result.items.some((candidate) => candidate.label === "Parallel/>"),
    false,
  );
});

test("typed blackboard completion suggests bool literals and matching keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SetBool value="{is_ready}"/>
    <UseBool flag=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="SetBool">
      <output_port name="value" type="bool"/>
    </Action>
    <Action ID="UseBool">
      <input_port name="flag" type="bool"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('flag=""') + 6);
  const result = ls.getCompletions({ document: doc, position: pos });
  const labels = result.items.map((item) => item.label);
  assert.deepEqual(labels.slice(0, 3), ["true", "false", "{is_ready}"]);
  const keyItem = result.items.find((item) => item.label === "{is_ready}");
  assert.equal(keyItem?.sortText, "2-is_ready");
});

test("typed blackboard completion places unknown-type keys after matching keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Known value="{is_ready}"/>
    <Unknown value="{maybe_ready}"/>
    <UseBool flag=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Known">
      <output_port name="value" type="bool"/>
    </Action>
    <Action ID="Unknown">
      <output_port name="value"/>
    </Action>
    <Action ID="UseBool">
      <input_port name="flag" type="bool"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('flag=""') + 6);
  const result = ls.getCompletions({ document: doc, position: pos });
  const labels = result.items.map((item) => item.label);
  assert.deepEqual(labels.slice(0, 4), ["true", "false", "{is_ready}", "{maybe_ready}"]);
  const unknownItem = result.items.find((item) => item.label === "{maybe_ready}");
  assert.equal(unknownItem?.sortText, "3-maybe_ready");
});

test("typed blackboard completion excludes mismatched types", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SetString value="{name}"/>
    <UseBool flag=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="SetString">
      <output_port name="value" type="std::string"/>
    </Action>
    <Action ID="UseBool">
      <input_port name="flag" type="bool"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('flag=""') + 6);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(
    result.items.some((item) => item.label === "{name}"),
    false,
  );
});

test("typed blackboard completion normalizes equivalent string types", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <SetName value="{robot_name}"/>
    <UseName target=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="SetName">
      <output_port name="value" type="const std::string&"/>
    </Action>
    <Action ID="UseName">
      <input_port name="target" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('target=""') + 8);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "{robot_name}"));
});

test("typed blackboard completion dedupes duplicate keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <A out="{target}"/>
    <B in="{target}"/>
    <C in=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="A">
      <output_port name="out" type="Pose"/>
    </Action>
    <Action ID="B">
      <input_port name="in" type="Pose"/>
    </Action>
    <Action ID="C">
      <input_port name="in" type="Pose"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('in=""/>\n  </BehaviorTree>') + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(result.items.filter((item) => item.label === "{target}").length, 1);
});

test("typed blackboard completion excludes conflicting key types", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <A bool_out="{x}"/>
    <B string_out="{x}"/>
    <C bool_in=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="A">
      <output_port name="bool_out" type="bool"/>
    </Action>
    <Action ID="B">
      <output_port name="string_out" type="std::string"/>
    </Action>
    <Action ID="C">
      <input_port name="bool_in" type="bool"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('bool_in=""') + 9);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(
    result.items.some((candidate) => candidate.label === "{x}"),
    false,
  );
});

test("blackboard completion excludes brace-containing extracted keys", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="Writer" ok="{goal}" nested="{{bad}}" half_open="{bad" half_close="bad}" just_open="{" just_close="}"/>
    <Action ID="Reader" input=""/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Writer">
      <output_port name="ok" type="std::string"/>
      <output_port name="nested" type="std::string"/>
      <output_port name="half_open" type="std::string"/>
      <output_port name="half_close" type="std::string"/>
      <output_port name="just_open" type="std::string"/>
      <output_port name="just_close" type="std::string"/>
    </Action>
    <Action ID="Reader">
      <input_port name="input" type="std::string"/>
    </Action>
  </TreeNodesModel>
</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf('input=""') + 7);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "{goal}"));
  assert.equal(
    result.items.some((item) => item.label === "{bad}"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "{{bad}}"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "{{}}"),
    false,
  );
});

test("closing tag completion suggests nearest parent for partial input", () => {
  const text = `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      </Se\n    </Sequence>\n  </BehaviorTree>\n</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("</Se") + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "Sequence>"));
});

test("closing tag completion prefers nested parent", () => {
  const text = `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Fallback>\n        </Fa\n      </Fallback>\n    </Sequence>\n  </BehaviorTree>\n</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("</Fa") + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "Fallback>"));
});

test("closing tag completion for generic tags uses the real XML tag name", () => {
  const text = `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Control ID="PipelineSequence">\n      </Co\n    </Control>\n  </BehaviorTree>\n</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("</Co") + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.ok(result.items.some((item) => item.label === "Control>"));
  assert.equal(
    result.items.some((item) => item.label === "PipelineSequence>"),
    false,
  );
});

test("closing tag completion does not suggest wrong parent for prefix", () => {
  const text = `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Fallback>\n        </Se\n      </Fallback>\n    </Sequence>\n  </BehaviorTree>\n</root>`;
  const doc = createDoc(text);
  const ls = createLanguageService({ config: defaultEffectiveConfig });
  const pos = doc.positionAt(text.indexOf("</Se") + 4);
  const result = ls.getCompletions({ document: doc, position: pos });
  assert.equal(
    result.items.some((item) => item.label === "Sequence>"),
    false,
  );
  assert.equal(
    result.items.some((item) => item.label === "Fallback>"),
    false,
  );
});
