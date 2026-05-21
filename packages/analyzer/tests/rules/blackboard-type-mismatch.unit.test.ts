import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentDiagnostics } from "@btxml/analyzer";
import { validateBtXml } from "@btxml/analyzer";
import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { buildSemanticIndex } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();
const defaultEffectiveConfig = getEffectiveConfigForFile(DEFAULT_RESOLVED_BTXML_CONFIG, "test.xml");

test("blackboard-type-mismatch ignores std::string by default for BT.CPP compatibility", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><ReadPose pose="{target}"/><UseString text="{target}"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="ReadPose"><input_port name="pose" type="Pose2D"/></Action><Action ID="UseString"><input_port name="text" type="std::string"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT111_BLACKBOARD_TYPE_MISMATCH"),
    false,
  );
});

test("blackboard-type-mismatch reports std::string mismatches when compatibility is disabled", () => {
  const config = getEffectiveConfigForFile(
    {
      ...DEFAULT_RESOLVED_BTXML_CONFIG,
      linter: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG.linter,
        rules: {
          "model/no-blackboard-type-mismatch": ["error", { allowStringEntryCompatibility: false }],
        },
      },
    },
    "test.xml",
  );

  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><ReadPose pose="{target}"/><UseString text="{target}"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="ReadPose"><input_port name="pose" type="Pose2D"/></Action><Action ID="UseString"><input_port name="text" type="std::string"/></Action></TreeNodesModel></root>`,
    { config },
  );

  const diagnostic = result.diagnostics.find(
    (diag) => diag.code === "BT111_BLACKBOARD_TYPE_MISMATCH",
  );
  assert.ok(diagnostic);
  assert.match(
    diagnostic.message,
    /blackboard entry `target` is used with incompatible port types: `Pose2D`, `std::string`/,
  );
  assert.deepEqual(diagnostic.details?.notes, [
    "ReadPose.pose declares Pose2D",
    "UseString.text declares std::string",
  ]);
});

test("blackboard-type-mismatch accepts exact custom-type matches", () => {
  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><ReadPose pose="{target}"/><UsePose pose="{target}"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="ReadPose"><input_port name="pose" type="Pose2D"/></Action><Action ID="UsePose"><input_port name="pose" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { config: defaultEffectiveConfig },
  );

  assert.equal(
    result.diagnostics.some((diag) => diag.code === "BT111_BLACKBOARD_TYPE_MISMATCH"),
    false,
  );
});

test("blackboard-type-mismatch accepts compatibleWith relations from augmentations", () => {
  const parsed = parseBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><ReadStamped pose="{target}"/><UsePose pose="{target}"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="ReadStamped"><input_port name="pose" type="StampedPose2D"/></Action><Action ID="UsePose"><input_port name="pose" type="Pose2D"/></Action></TreeNodesModel></root>`,
    { uri: "test.xml" },
  );
  assert.ok(parsed.document);

  const semantic = buildSemanticIndex([parsed.document], {
    config: DEFAULT_RESOLVED_BTXML_CONFIG,
    augmentations: [
      {
        version: 1,
        types: {
          Pose2D: {
            kind: "opaque",
            canonical: "my_robot/Pose2D",
          },
          StampedPose2D: {
            kind: "opaque",
            canonical: "my_robot/StampedPose2D",
            compatibleWith: ["Pose2D"],
          },
        },
      },
    ],
  }).index;

  const result = getDocumentDiagnostics(parsed.document, semantic, {
    config: defaultEffectiveConfig,
  });

  assert.equal(
    result.some((diag) => diag.code === "BT111_BLACKBOARD_TYPE_MISMATCH"),
    false,
  );
});

test("blackboard-type-mismatch ignores Any while still reporting concrete mismatches", () => {
  const config = getEffectiveConfigForFile(
    {
      ...DEFAULT_RESOLVED_BTXML_CONFIG,
      linter: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG.linter,
        rules: {
          "model/no-blackboard-type-mismatch": ["error", { allowStringEntryCompatibility: false }],
        },
      },
    },
    "test.xml",
  );

  const result = validateBtXml(
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence><AcceptAny anything="{shared}"/><UseInt value="{shared}"/><UseString text="{shared}"/></Sequence></BehaviorTree><TreeNodesModel><Action ID="AcceptAny"><input_port name="anything" type="Any"/></Action><Action ID="UseInt"><input_port name="value" type="int"/></Action><Action ID="UseString"><input_port name="text" type="std::string"/></Action></TreeNodesModel></root>`,
    { config },
  );

  const diagnostic = result.diagnostics.find(
    (diag) => diag.code === "BT111_BLACKBOARD_TYPE_MISMATCH",
  );
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /`int32`, `std::string`/);
  assert.deepEqual(diagnostic.details?.notes, [
    "UseInt.value declares int",
    "UseString.text declares std::string",
  ]);
});
