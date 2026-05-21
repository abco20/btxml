import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

type PackageExportSnapshot = {
  packageName: string;
  exportSubpaths: string[];
};

function readIfExists(file: string): string | undefined {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
}

function assertNoExportedNames(source: string, forbidden: readonly string[], label: string): void {
  for (const name of forbidden) {
    const exportRegex = new RegExp(
      String.raw`export\s+(?:type\s+)?(?:\{[^}]*\b${name}\b[^}]*\}|(?:type|interface|const|function|class|enum)\s+${name}\b)`,
      "m",
    );

    assert.strictEqual(exportRegex.test(source), false, `${label} must not export ${name}`);
  }
}

function readPackageExportSnapshot(packageDir: string): PackageExportSnapshot {
  const packageJsonPath = join(process.cwd(), "packages", packageDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    name: string;
    exports?: Record<string, unknown>;
  };

  return {
    packageName: packageJson.name,
    exportSubpaths: Object.keys(packageJson.exports ?? {}).sort(),
  };
}

const coreForbiddenExports = [
  "parseBtXml",
  "ParseResult",
  "ParseOptions",
  "BtDocument",
  "BtDocumentKind",
  "BtXmlNode",
  "BtXmlElement",
  "BtXmlAttribute",
  "TreeNodeModelDef",
  "PortDef",
  "BtDocumentModel",
  "BtDocumentModelKind",
  "DocumentModel",
  "SemanticIndex",
  "SemanticIndexOptions",
  "SemanticIndexResult",
  "BuildSemanticIndexOptions",
  "buildSemanticIndex",
  "ProjectHost",
  "ProjectSnapshot",
  "checkBtWorkspace",
  "createLanguageService",
  "createWorkspaceService",
  "RuleContext",
  "RuleModule",
  "buildModelConflictRepairGroups",
  "diagnosticBaselineEntry",
  "diagnosticBaselineSchema",
  "formatEditSummary",
  "getBaselinePath",
  "getSafeLintFixes",
  "groupWorkspaceEditsByUri",
  "GroupRepairAction",
  "ModelConflictGroup",
  "UsageImpact",
];

const projectMainForbiddenExports = [
  "buildProjectIndex",
  "buildModelConflictRepairGroups",
  "CheckContext",
  "createCheckContext",
  "getSafeLintFixes",
  "formatEditSummary",
  "groupWorkspaceEditsByUri",
  "GroupRepairAction",
  "ProjectFacts",
  "ProjectIndex",
  "ProjectIndexResult",
  "ProjectHost",
  "resolveIncludeGraph",
  "ModelConflictGroup",
  "UsageImpact",
  "applyDiagnosticSuppressions",
  "buildWorkspaceIndex",
  "collectDiagnostics",
  "createIgnoreInstance",
  "createNodeProjectHost",
  "discoverModelFiles",
  "discoverProjectFiles",
  "discoverProjectRoot",
  "expandPatterns",
  "getSuppressionsConfig",
  "hasFailingDiagnostics",
  "loadGitignore",
  "loadProjectNodeModels",
  "matchGlob",
  "normalizeEntrypoints",
  "projectRelative",
  "toPosix",
  "validateEntrypoints",
  "workspaceLookupBehaviorTrees",
  "workspaceLookupNodeModel",
];

const packageExportSnapshots = [
  { packageName: "@btxml/foundation", exportSubpaths: ["."] },
  { packageName: "@btxml/script", exportSubpaths: ["."] },
  { packageName: "@btxml/syntax", exportSubpaths: ["."] },
  { packageName: "@btxml/model", exportSubpaths: [".", "./json-schema", "./zod"] },
  { packageName: "@btxml/config", exportSubpaths: [".", "./json-schema", "./zod"] },
  { packageName: "@btxml/semantic", exportSubpaths: [".", "./ast-view"] },
  { packageName: "@btxml/analyzer", exportSubpaths: [".", "./rules"] },
  { packageName: "@btxml/core", exportSubpaths: ["."] },
  { packageName: "@btxml/project", exportSubpaths: [".", "./node"] },
  { packageName: "@btxml/language-service", exportSubpaths: [".", "./node"] },
  {
    packageName: "@abco20/btxml",
    exportSubpaths: [
      ".",
      "./config",
      "./editor",
      "./editor/node",
      "./model",
      "./rules",
      "./schemas/btxml.config.schema.json",
      "./schemas/btxml.nodes.schema.json",
      "./semantic",
      "./syntax",
    ],
  },
] as const;

describe("Public API Surface", () => {
  const newCoreSrc = join(process.cwd(), "packages/core/src");

  const allowedValueExports = [
    "formatBtXml",
    "validateBtXml",
    "checkBtXml",
    "createInitConfig",
    "getEffectiveConfigForFile",
    "getEffectiveConfigForUri",
    "parseBtxmlConfig",
    "normalizeBtxmlConfig",
  ];

  it("should not leak internal types through the public @btxml/core barrel", () => {
    const newCoreIndexContent = readFileSync(join(newCoreSrc, "index.ts"), "utf-8");

    for (const name of allowedValueExports) {
      assert.ok(newCoreIndexContent.includes(name), `Expected public export: ${name}`);
    }

    assertNoExportedNames(newCoreIndexContent, coreForbiddenExports, "@btxml/core");
  });

  it("@btxml/project main does not export repair internals", () => {
    const source = readFileSync(join(process.cwd(), "packages/project/src/index.ts"), "utf-8");
    assertNoExportedNames(source, projectMainForbiddenExports, "@btxml/project");
  });

  it("new package public barrels do not export forbidden names when present", () => {
    const packageChecks = [
      {
        path: join(process.cwd(), "packages/foundation/src/index.ts"),
        label: "@btxml/foundation",
        forbidden: [
          "BtDocument",
          "BtXmlElement",
          "InternalTextDocument",
          "TreeNodeModelDef",
          "PortDef",
          "SemanticIndex",
          "ProjectHost",
        ],
      },
      {
        path: join(process.cwd(), "packages/script/src/index.ts"),
        label: "@btxml/script",
        forbidden: ["RuleContext", "RuleModule", "SemanticIndex", "ProjectHost", "BtDocument"],
      },
      {
        path: join(process.cwd(), "packages/syntax/src/index.ts"),
        label: "@btxml/syntax",
        forbidden: [
          "TreeNodeModelDef",
          "PortDef",
          "ResolvedBtxmlConfig",
          "EffectiveFileConfig",
          "SemanticIndex",
          "ProjectHost",
        ],
      },
      {
        path: join(process.cwd(), "packages/analyzer/src/index.ts"),
        label: "@btxml/analyzer",
        forbidden: [
          "AnalysisFacts",
          "buildSemanticIndex",
          "getDocumentModel",
          "getAllDocumentModels",
          "hasDocumentModel",
          "getBehaviorTrees",
          "getBehaviorTreeIds",
          "getAllBehaviorTreeDefinitions",
          "hasBehaviorTree",
          "getNodeModel",
          "getNodeModelDefinitions",
          "getAllNodeModels",
          "getAllNodeModelDefinitions",
          "getEffectiveNodeModels",
          "getNodeModelIds",
          "getGenericSubTreePorts",
          "getModelConflicts",
          "SemanticIndex",
          "SemanticIndexOptions",
          "SemanticIndexResult",
          "ModelConflictFact",
          "DocumentModel",
          "ExtractedDocumentModel",
          "IncludeIssue",
          "IncludeIssueKind",
          "RuleContext",
          "RuleModule",
          "RuleRunner",
          "resolveUsagePort",
          "resolveUsagePorts",
          "runSuppressionIssueRules",
          "SemanticIndexState",
          "ModelLayer",
          "SuppressionIssue",
          "SuppressionIssueKind",
          "UsagePortResolution",
          "getModelLayers",
          "WorkspaceIndex",
          "WorkspaceIndexOptions",
          "WorkspaceIndexResult",
          "WorkspaceModelConflict",
        ],
      },
      {
        path: join(process.cwd(), "packages/semantic/src/index.ts"),
        label: "@btxml/semantic",
        forbidden: [
          "ProjectHost",
          "ProjectIndex",
          "RuleContext",
          "RuleModule",
          "SemanticIndexState",
          "ModelLayer",
          "ModelLayerMergeResult",
          "buildSemanticIndexInternal",
          "getModelLayers",
          "buildBtDocumentView",
          "getAllTreeNodes",
          "getSubTreeCalls",
          "findTreeNodeAtPosition",
          "findPortBindingAtPosition",
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
        path: join(process.cwd(), "packages/language-service/src/index.ts"),
        label: "@btxml/language-service",
        forbidden: ["BtDocument", "SemanticIndex", "ProjectHost", "ProjectIndex", "ModelLayer"],
      },
      {
        path: join(process.cwd(), "packages/btxml/src/editor.ts"),
        label: "@abco20/btxml/editor",
        forbidden: ["WorkspaceService", "WorkspaceServiceOptions", "ProjectWorkspaceService"],
      },
      {
        path: join(process.cwd(), "packages/btxml/src/editor-node.ts"),
        label: "@abco20/btxml/editor/node",
        forbidden: ["WorkspaceService", "ProjectWorkspaceService"],
      },
      {
        path: join(process.cwd(), "packages/model/src/index.ts"),
        label: "@btxml/model",
        forbidden: [
          "DocumentModel",
          "buildBtModel",
          "ExtractedBehaviorTreeDef",
          "ExtractedBlackboardReference",
          "ExtractedDocumentModel",
          "ExtractedPortDef",
          "ExtractedSubTreeReference",
          "ExtractedTreeNodeModelDef",
          "BtModel",
          "BuiltinNodeRegistry",
          "builtinNodeRegistry",
        ],
      },
    ];

    for (const check of packageChecks) {
      const source = readIfExists(check.path);
      if (!source) continue;
      assertNoExportedNames(source, check.forbidden, check.label);
    }
  });

  it("@btxml/semantic public barrel exports semantic view DTO APIs", () => {
    const source = readFileSync(join(process.cwd(), "packages/semantic/src/index.ts"), "utf-8");
    for (const name of [
      "buildSemanticDocumentView",
      "buildSemanticNodeIdentityIndex",
      "findSemanticNodeAtPosition",
      "findSemanticPortBindingAtPosition",
      "getAllSemanticTreeNodes",
      "getSemanticSubTreeCalls",
      "getSemanticTreeNodesForBehaviorTree",
      "selectDefaultBehaviorTree",
      "SemanticDocumentView",
      "SemanticBehaviorTreeView",
      "SemanticTreeSelection",
      "SemanticNodeIdentityIndex",
      "SemanticTreeNodeView",
      "SemanticAttributeView",
      "SemanticPortBindingView",
      "SemanticSubTreeCallView",
      "BuildSemanticDocumentViewOptions",
    ]) {
      assert.ok(source.includes(name), `Expected semantic public export: ${name}`);
    }
  });

  it("@btxml/semantic public barrel exports usage resolution APIs", () => {
    const source = readFileSync(join(process.cwd(), "packages/semantic/src/index.ts"), "utf-8");
    for (const name of [
      "DEFAULT_NODE_USAGE_POLICY",
      "getGenericNodeKindFromTag",
      "resolveNodeUsage",
      "resolvePortUsage",
      "getUsagePorts",
      "getNodeTypeFromElement",
      "isGenericNodeTag",
      "GenericNodeKind",
      "NodeTagForm",
      "NodeUsagePolicy",
      "NodeUsageModelResolution",
      "NodeUsageResolution",
      "PortUsageResolution",
      "ResolveNodeUsageInput",
      "ResolvePortUsageInput",
      "UnknownSubTreePortMode",
      "UsageResolverConfig",
    ]) {
      assert.ok(source.includes(name), `Expected semantic usage export: ${name}`);
    }
  });

  it("@btxml/semantic/ast-view exports AST-backed view APIs", () => {
    const source = readFileSync(join(process.cwd(), "packages/semantic/src/ast-view.ts"), "utf-8");
    for (const name of [
      "buildBtDocumentView",
      "getAllTreeNodes",
      "getSubTreeCalls",
      "findTreeNodeAtPosition",
      "findPortBindingAtPosition",
      "BtDocumentView",
      "BehaviorTreeView",
      "TreeNodeView",
      "PortBindingView",
      "SubTreeCallView",
      "NodeModelResolution",
      "PortResolution",
      "BuildBtDocumentViewOptions",
      "BuildLocalBtDocumentViewOptions",
    ]) {
      assert.ok(source.includes(name), `Expected ast-view export: ${name}`);
    }
  });

  it("tracks package export subpaths as an API snapshot baseline", () => {
    const actual = [
      readPackageExportSnapshot("foundation"),
      readPackageExportSnapshot("script"),
      readPackageExportSnapshot("syntax"),
      readPackageExportSnapshot("model"),
      readPackageExportSnapshot("config"),
      readPackageExportSnapshot("semantic"),
      readPackageExportSnapshot("analyzer"),
      readPackageExportSnapshot("core"),
      readPackageExportSnapshot("project"),
      readPackageExportSnapshot("language-service"),
      readPackageExportSnapshot("btxml"),
    ];

    assert.deepStrictEqual(actual, packageExportSnapshots);
  });

  it("@btxml/language-service public barrel prefers BtEditorService names", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/language-service/src/index.ts"),
      "utf-8",
    );
    for (const name of ["BtEditorService", "BtEditorServiceOptions"]) {
      assert.ok(source.includes(name), `Expected language-service public export: ${name}`);
    }
  });

  it("@btxml/language-service/node public barrel prefers BtProjectEditorService names", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/language-service/src/node.ts"),
      "utf-8",
    );
    assert.ok(
      source.includes("BtProjectEditorService"),
      "Expected language-service/node public export: BtProjectEditorService",
    );

    const publicTypesSource = readFileSync(
      join(process.cwd(), "packages/language-service/src/public-types.ts"),
      "utf-8",
    );
    assert.ok(
      publicTypesSource.includes("export interface BtProjectEditorService extends BtEditorService"),
      "Expected BtProjectEditorService to include editor APIs",
    );
  });

  it("@abco20/btxml editor facades use canonical editor and semantic entry points", () => {
    const editorSource = readFileSync(join(process.cwd(), "packages/btxml/src/editor.ts"), "utf-8");
    const editorNodeSource = readFileSync(
      join(process.cwd(), "packages/btxml/src/editor-node.ts"),
      "utf-8",
    );
    const semanticSource = readFileSync(
      join(process.cwd(), "packages/btxml/src/semantic.ts"),
      "utf-8",
    );

    for (const name of ["BtEditorService", "BtEditorServiceOptions"]) {
      assert.ok(editorSource.includes(name), `Expected @abco20/btxml/editor export: ${name}`);
    }
    for (const name of ["BtProjectEditorService", "BtProjectEditorServiceOptions"]) {
      assert.ok(
        editorNodeSource.includes(name),
        `Expected @abco20/btxml/editor/node export: ${name}`,
      );
    }
    for (const name of [
      "getGenericNodeKindFromTag",
      "getNodeTypeFromElement",
      "isGenericNodeTag",
      "GenericNodeKind",
    ]) {
      assert.ok(semanticSource.includes(name), `Expected btxml/semantic export: ${name}`);
    }
  });

  it("does not publish ./internal export subpaths", () => {
    for (const packageDir of [
      "config",
      "semantic",
      "analyzer",
      "project",
      "language-service",
      "model",
    ]) {
      const snapshot = readPackageExportSnapshot(packageDir);
      assert.equal(snapshot.exportSubpaths.includes("./internal"), false);
    }
  });
});
