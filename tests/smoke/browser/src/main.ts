import { createWorkspaceService } from "@btxml/language-service";

const service = createWorkspaceService();

service.openDocument(
  "memory:///tree.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="Main">
    <Action ID="MoveBase" goal="{target}"/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveBase">
      <input_port name="goal" type="Pose2D">Navigation target</input_port>
    </Action>
  </TreeNodesModel>
</root>`,
);

const diagnostics = service.getDiagnostics("memory:///tree.xml");
const semantic = service.getSemanticDocumentView("memory:///tree.xml");

if (!semantic.view) {
  throw new Error("semantic view missing in browser smoke");
}

console.log(
  JSON.stringify({
    diagnostics: diagnostics.diagnostics.length,
    nodes: semantic.view.nodes.length,
  }),
);
