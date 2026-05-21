import assert from "node:assert/strict";
import test from "node:test";
import { formatBtXml } from "@btxml/syntax";

const groot = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="example_tree">
    <Sequence>
      <Sleep msec="300"/>
    </Sequence>
  </BehaviorTree>

  <!-- Description of Node Models (used by Groot) -->
  <TreeNodesModel>
    <Action ID="SetFlag">
      <input_port name="enabled"
                  type="bool">Enabled flag</input_port>
    </Action>
  </TreeNodesModel>

</root>
`;

const redhat = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="example_tree"><Sequence><Sleep msec="300"/></Sequence></BehaviorTree>

<!-- Description of Node Models (used by Groot) -->
<TreeNodesModel><Action ID="SetFlag"><input_port name="enabled" type="bool">Enabled flag</input_port></Action></TreeNodesModel></root>`;

test("formatter is idempotent for groot sample", () => {
  const result = formatBtXml(groot);
  assert.equal(result.ok, true);
  if (result.ok && !result.skipped) {
    assert.equal(result.text, groot);
  }
});

test("formatter converts redhat layout to groot layout", () => {
  const result = formatBtXml(redhat);
  assert.equal(result.ok, true);
  if (result.ok && !result.skipped) {
    assert.equal(result.text, groot);
  }
});

test("formatter preserves explicit empty element pairs", () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="A">
    <Sequence>

    </Sequence>
  </BehaviorTree>
</root>
`;
  const expected = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="A">
    <Sequence>
    </Sequence>
  </BehaviorTree>
</root>
`;

  const result = formatBtXml(input);
  assert.equal(result.ok, true);
  if (result.ok && !result.skipped) {
    assert.equal(result.text, expected);
  }
});

test("formatter preserves self-closing empty elements", () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="A"><Sequence/></BehaviorTree></root>`;
  const expected = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="A">
    <Sequence/>
  </BehaviorTree>
</root>
`;

  const result = formatBtXml(input);
  assert.equal(result.ok, true);
  if (result.ok && !result.skipped) {
    assert.equal(result.text, expected);
  }
});
