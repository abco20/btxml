import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const packagePolicies = [
  {
    packageName: "@btxml/foundation",
    entries: [
      {
        subpath: ".",
        file: "packages/foundation/dist/index.d.ts",
        forbidden: ["InternalTextDocument"],
      },
    ],
  },
  {
    packageName: "@btxml/model",
    entries: [
      {
        subpath: ".",
        file: "packages/model/dist/index.d.ts",
        forbidden: ["Extracted", "BtModel", "BuiltinNodeRegistry", "builtinNodeRegistry"],
      },
    ],
  },
  {
    packageName: "@btxml/semantic",
    entries: [
      {
        subpath: ".",
        file: "packages/semantic/dist/index.d.ts",
        forbidden: [
          "SemanticIndexState",
          "ModelLayer",
          "ModelLayerMergeResult",
          "BtDocumentView",
          "BehaviorTreeView",
          "TreeNodeView",
          "PortBindingView",
          "SubTreeCallView",
          "NodeModelResolution",
          "PortResolution",
          "BuildBtDocumentViewOptions",
          "BuildLocalBtDocumentViewOptions",
        ],
      },
      {
        subpath: "./ast-view",
        file: "packages/semantic/dist/ast-view.d.ts",
        forbidden: ["SemanticIndexState", "ModelLayer", "ModelLayerMergeResult"],
      },
    ],
  },
  {
    packageName: "@btxml/analyzer",
    entries: [
      {
        subpath: ".",
        file: "packages/analyzer/dist/index.d.ts",
        forbidden: ["AnalysisFacts", "RuleContext", "RuleModule", "runSuppressionIssueRules"],
      },
    ],
  },
  {
    packageName: "@btxml/project",
    entries: [
      {
        subpath: ".",
        file: "packages/project/dist/index.d.ts",
        forbidden: [
          "ProjectIndex",
          "CheckContext",
          "IncludeGraph",
          "ModelConflictGroup",
          "GroupRepairAction",
          "UsageImpact",
          "buildWorkspaceIndex",
          "workspaceLookupBehaviorTrees",
          "workspaceLookupNodeModel",
          "createNodeProjectHost",
        ],
      },
      {
        subpath: "./node",
        file: "packages/project/dist/node.d.ts",
        forbidden: [],
      },
    ],
  },
  {
    packageName: "@btxml/language-service",
    entries: [
      {
        subpath: ".",
        file: "packages/language-service/dist/index.d.ts",
        forbidden: [
          "NodeWorkspaceServiceOptions",
          "WorkspaceService",
          "ProjectWorkspaceService",
          "ProjectLoadResult",
          "LoadProjectOptions",
          "ProjectIndex",
          "SemanticIndexState",
          "ModelLayer",
        ],
      },
      {
        subpath: "./node",
        file: "packages/language-service/dist/node.d.ts",
        forbidden: ["ProjectIndex", "SemanticIndexState", "ModelLayer"],
      },
    ],
  },
  {
    packageName: "@abco20/btxml",
    entries: [
      {
        subpath: ".",
        file: "packages/btxml/dist/index.d.ts",
        forbidden: [],
      },
      {
        subpath: "./editor",
        file: "packages/btxml/dist/editor.d.ts",
        forbidden: [
          "NodeWorkspaceServiceOptions",
          "WorkspaceService",
          "ProjectWorkspaceService",
          "ProjectLoadResult",
          "LoadProjectOptions",
        ],
      },
    ],
  },
];

const checks = packagePolicies.flatMap((policy) =>
  policy.entries.map((entry) => ({
    label: formatEntryLabel(policy.packageName, entry.subpath),
    file: entry.file,
    forbidden: entry.forbidden,
  })),
);

let failed = false;

for (const check of checks) {
  const filePath = path.join(root, check.file);
  if (!fs.existsSync(filePath)) {
    console.error(`[${check.label}] dist declaration file missing: ${check.file}`);
    failed = true;
    continue;
  }

  const source = fs.readFileSync(filePath, "utf8");
  for (const forbidden of check.forbidden) {
    const exportRegex = new RegExp(String.raw`\b${escapeRegExp(forbidden)}\b`, "m");
    if (exportRegex.test(source)) {
      console.error(`[${check.label}] forbidden public declaration leak: ${forbidden}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("dist .d.ts leakage verification passed.");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatEntryLabel(packageName, subpath) {
  return subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
}
