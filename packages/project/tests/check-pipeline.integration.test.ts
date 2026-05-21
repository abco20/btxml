import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RuleCodes } from "@btxml/analyzer/rules";
import type { Diagnostic } from "@btxml/foundation";
import { checkProject, loadProjectDocuments } from "@btxml/project";
import {
  createNodeProjectHost,
  discoverNodeProject,
  getNodeProjectRootDir,
} from "@btxml/project/node";
import { diagnosticBaselineEntry } from "../src/baseline.js";
import { createCheckContext } from "../src/check/context.js";
import { checkFiles } from "../src/check/files.js";
import { runProjectCheck } from "../src/check/index.js";
import { summarizeResults } from "../src/check/summary.js";
import { applySuppressions } from "../src/check/suppressions.js";
import { getProjectNodeModelSources } from "../src/queries.js";

function makeProjectDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, ".git"));
  return dir;
}

async function loadInternalCheckInput(project: import("@btxml/project").BtxmlProject) {
  const loaded = await loadProjectDocuments(project);
  return {
    project,
    documents: loaded.documents,
    externalModelDocuments: loaded.externalModelDocuments,
    augmentations: loaded.augmentations,
    projectDiagnostics: loaded.diagnostics,
  };
}

async function checkSingleTree(config: unknown, xml: string) {
  const dir = makeProjectDir("btxml-pipeline-single-");
  fs.writeFileSync(path.join(dir, "btxml.config.json"), JSON.stringify(config), "utf8");
  fs.writeFileSync(path.join(dir, "tree.xml"), xml, "utf8");
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({
    project: project.project,
    projectDiagnostics: project.diagnostics,
  });
  return result.files[0].diagnostics;
}

test("project diagnostics are preserved", async () => {
  const dir = makeProjectDir("btxml-pipeline-proj-diag-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const customDiag: Diagnostic = {
    code: "CUSTOM001",
    severity: "error",
    message: "custom project error",
    uri: "",
  };
  const loaded = await loadInternalCheckInput(project.project);
  const result = await runProjectCheck({ ...loaded, projectDiagnostics: [customDiag] });
  assert.ok(result.projectDiagnostics.some((d) => d.code === "CUSTOM001"));
});

test("createCheckContext does not mutate input project diagnostics", async () => {
  const dir = makeProjectDir("btxml-pipeline-no-mutate-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["tree.xml"] }, models: { files: ["model.xml"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "model.xml"), "<TreeNodesModel>", "utf8");
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const customDiag: Diagnostic = {
    code: "CUSTOM001",
    severity: "error",
    message: "custom project error",
    uri: "",
  };
  const projectDiagnostics = [customDiag];

  const loaded = await loadInternalCheckInput(project.project);
  const ctx = await createCheckContext({
    ...loaded,
    projectDiagnostics: [...projectDiagnostics, ...loaded.projectDiagnostics],
  });

  assert.deepEqual(projectDiagnostics, [customDiag]);
  assert.notEqual(ctx.projectDiagnostics, projectDiagnostics);
  assert.ok(
    ctx.projectDiagnostics.some((diag) => diag.code === RuleCodes.ExternalModelXmlParseError),
  );
});

test("loaded external model diagnostics are not duplicated", async () => {
  const dir = makeProjectDir("btxml-pipeline-no-duplicate-model-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["tree.xml"] }, models: { files: ["model.xml"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "model.xml"), "<TreeNodesModel>", "utf8");
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadProjectDocuments(
    project.project,
    createNodeProjectHost(getNodeProjectRootDir(project.project)),
  );
  assert.equal(
    loaded.diagnostics.filter((diag) => diag.code === RuleCodes.ExternalModelXmlParseError).length,
    1,
  );

  const result = await checkProject({
    project: project.project,
    projectDiagnostics: project.diagnostics,
  });

  assert.equal(
    result.projectDiagnostics.filter((diag) => diag.code === RuleCodes.ExternalModelXmlParseError)
      .length,
    1,
  );
});

test("missing configured augmentation file is preserved in project diagnostics", async () => {
  const dir = makeProjectDir("btxml-pipeline-missing-augment-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { augmentations: ["missing-augment.xml"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>',
    "utf8",
  );

  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);

  const result = await checkProject({
    project: project.project,
    projectDiagnostics: project.diagnostics,
  });

  assert.ok(
    result.projectDiagnostics.some(
      (diag) =>
        diag.code === RuleCodes.AugmentationFileNotFound &&
        diag.message.includes("missing-augment.xml"),
    ),
  );
});

test("project check validates augmentation-refined port defaults and names end-to-end", async () => {
  const dir = makeProjectDir("btxml-pipeline-augment-port-name-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { augmentations: ["btxml.model-augment.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><MoveTo target="1;2;3"/></BehaviorTree><TreeNodesModel><Action ID="MoveTo"><input_port name="target" type="std::string"/><input_port name="request.name" type="string"/></Action></TreeNodesModel></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "btxml.model-augment.json"),
    JSON.stringify({
      version: 1,
      types: {
        Pose2D: {
          kind: "opaque",
          validate: {
            kind: "tuple",
            separator: ";",
            items: ["double", "double", "double"],
          },
        },
      },
      augment: {
        MoveTo: {
          ports: {
            target: {
              typeRefinement: {
                from: "std::string",
                to: "Pose2D",
              },
            },
          },
        },
      },
    }),
    "utf8",
  );

  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);

  const result = await checkProject({
    project: project.project,
    projectDiagnostics: project.diagnostics,
  });

  const diagnostics = result.files[0]?.diagnostics ?? [];
  assert.equal(
    diagnostics.some((diag) => diag.code === RuleCodes.CustomLiteralRequiresValidator),
    false,
  );
  assert.equal(
    diagnostics.some((diag) => diag.code === RuleCodes.InvalidPortValueType),
    false,
  );
  assert.ok(diagnostics.some((diag) => diag.code === RuleCodes.InvalidPortName));
});

test("file diagnostics are preserved", async () => {
  const dir = makeProjectDir("btxml-pipeline-file-diag-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.ok(result.files[0].diagnostics.some((d) => d.code === "BT105_UNKNOWN_NODE"));
});

test("node-definition-file source metadata is preserved in project index", async () => {
  const dir = makeProjectDir("btxml-pipeline-node-source-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["tree.xml"] }, models: { definitions: ["nodes.json"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({ nodes: { CustomAction: { kind: "Action", ports: {} } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><CustomAction/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadInternalCheckInput(project.project);
  const ctx = await createCheckContext(loaded);
  const sources = getProjectNodeModelSources(ctx.indexResult.index, "CustomAction");

  assert.ok(
    sources.some(
      (source: { sourceKind: string; file?: string }) =>
        source.sourceKind === "node-definition-file" && source.file === "nodes.json",
    ),
  );
  assert.equal(sources.length > 0, true);
});

test("entrypoint-mode check preserves node-definition-file model layers", async () => {
  const dir = makeProjectDir("btxml-pipeline-file-node-def-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      resolver: { entrypoints: ["tree.xml"] },
      models: { definitions: ["nodes.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({ nodes: { CustomAction: { kind: "Action", ports: {} } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><CustomAction/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadInternalCheckInput(project.project);
  const ctx = await createCheckContext(loaded);
  assert.ok(ctx.nodeDefinitionModels.some((model) => model.source === "node-definition-file"));
  const files = checkFiles(ctx);

  assert.equal(
    files[0].diagnostics.some((diag) => diag.code === RuleCodes.UnknownNode),
    false,
  );
});

test("suppressions are applied after diagnostics", async () => {
  const dir = makeProjectDir("btxml-pipeline-suppressions-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>\n<!-- btxml-disable-file BT105_UNKNOWN_NODE reason: test -->',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadInternalCheckInput(project.project);
  const ctx = await createCheckContext(loaded);
  const files = checkFiles(ctx);
  assert.ok(files[0].diagnostics.some((d) => d.code === "BT105_UNKNOWN_NODE"));
  const afterSuppression = applySuppressions(ctx, files[0].diagnostics, [ctx.documents[0]]);
  assert.equal(
    afterSuppression.diagnostics.some((d) => d.code === "BT105_UNKNOWN_NODE"),
    false,
  );
  assert.ok(afterSuppression.suppressedDiagnostics.length > 0);
});

test("suppression diagnostics obey linter severity", async () => {
  const dir = makeProjectDir("btxml-pipeline-suppression-severity-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      linter: {
        rules: { "suppression/no-unused": "error" },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n<!-- btxml-disable-file BT105_UNKNOWN_NODE -->',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.ok(result.files[0].diagnostics.some((d) => d.code === RuleCodes.UnusedSuppression));
});

test("missing suppression reason follows suppression/require-reason", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>\n<!-- btxml-disable-file BT105_UNKNOWN_NODE -->';

  const disabled = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: { rules: { "suppression/require-reason": "off" } },
    },
    xml,
  );
  assert.equal(
    disabled.some((d) => d.code === RuleCodes.MissingSuppressionReason),
    false,
  );

  const enabled = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: { rules: { "suppression/require-reason": "warn" } },
    },
    xml,
  );
  const diagnostic = enabled.find((d) => d.code === RuleCodes.MissingSuppressionReason);
  assert.equal(diagnostic?.severity, "warning");
});

test("missing suppression reason honors rule overrides", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>\n<!-- btxml-disable-file BT105_UNKNOWN_NODE -->';

  const error = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: {
        rules: { "suppression/require-reason": "error" },
      },
    },
    xml,
  );
  assert.equal(error.find((d) => d.code === RuleCodes.MissingSuppressionReason)?.severity, "error");

  const off = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: {
        rules: { "suppression/require-reason": "off" },
      },
    },
    xml,
  );
  assert.equal(
    off.some((d) => d.code === RuleCodes.MissingSuppressionReason),
    false,
  );
});

test("unused suppression follows suppression/no-unused", async () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>\n<!-- btxml-disable-file BT105_UNKNOWN_NODE reason: test -->';

  const off = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: { rules: { "suppression/no-unused": "off" } },
    },
    xml,
  );
  assert.equal(
    off.some((d) => d.code === RuleCodes.UnusedSuppression),
    false,
  );

  const warn = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: { rules: { "suppression/no-unused": "warn" } },
    },
    xml,
  );
  assert.equal(warn.find((d) => d.code === RuleCodes.UnusedSuppression)?.severity, "warning");

  const error = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: {
        rules: { "suppression/no-unused": "error" },
      },
    },
    xml,
  );
  assert.equal(error.find((d) => d.code === RuleCodes.UnusedSuppression)?.severity, "error");
});

test("suppression diagnostics are not suppressed by inline suppression", async () => {
  const diagnostics = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      linter: { rules: { "suppression/require-reason": "warn" } },
    },
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><!-- btxml-disable-next-line BT353_MISSING_SUPPRESSION_REASON --><AlwaysSuccess/></BehaviorTree></root>',
  );

  assert.ok(diagnostics.some((d) => d.code === RuleCodes.MissingSuppressionReason));
});

test("strict=true escalates unknown node to error", async () => {
  const diagnostics = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      strict: true,
    },
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
  );

  assert.equal(diagnostics.find((d) => d.code === RuleCodes.UnknownNode)?.severity, "error");
});

test("strict + user rule override downgrades unknown node", async () => {
  const diagnostics = await checkSingleTree(
    {
      files: { include: ["tree.xml"] },
      strict: true,
      linter: {
        rules: {
          "model/no-unknown-node": "warn",
        },
      },
    },
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
  );

  assert.equal(diagnostics.find((d) => d.code === RuleCodes.UnknownNode)?.severity, "warning");
});

test("strict + file override can disable unknown node", async () => {
  const dir = makeProjectDir("btxml-pipeline-strict-file-override-");
  fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["legacy/tree.xml"] },
      strict: true,
      overrides: [
        {
          files: ["legacy/**/*.xml"],
          linter: {
            rules: {
              "model/no-unknown-node": "off",
            },
          },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "legacy", "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );

  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files[0].diagnostics.some((d) => d.code === RuleCodes.UnknownNode),
    false,
  );
});

test("baseline is applied after suppressions", async () => {
  const dir = makeProjectDir("btxml-pipeline-baseline-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const first = await checkProject({ project: project.project });
  const diag = first.files[0].diagnostics.find((d) => d.code === "BT105_UNKNOWN_NODE");
  assert.ok(diag);
  const baseline = {
    version: 1 as const,
    diagnostics: [diagnosticBaselineEntry(diag)],
  };
  const loaded = await loadInternalCheckInput(project.project);
  const result = await runProjectCheck({ ...loaded, baseline });
  assert.equal(
    result.files[0].diagnostics.some((d) => d.code === "BT105_UNKNOWN_NODE"),
    false,
  );
  assert.ok((result.summary.baselineFiltered ?? 0) > 0);
  assert.ok(result.files[0].rawDiagnostics?.some((d) => d.code === "BT105_UNKNOWN_NODE"));
});

test("summary counts are correct", async () => {
  const dir = makeProjectDir("btxml-pipeline-summary-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadInternalCheckInput(project.project);
  const ctx = await createCheckContext(loaded);
  const files = checkFiles(ctx);
  const errors = files[0].diagnostics.filter((d) => d.severity === "error").length;
  const warnings = files[0].diagnostics.filter((d) => d.severity === "warning").length;
  const summary = summarizeResults(ctx, files, ctx.projectDiagnostics);
  assert.equal(summary.errors, errors);
  assert.equal(summary.warnings, warnings);
  assert.equal(summary.files, 1);
});

test("runtime fail policy does not mutate diagnostics", async () => {
  const dir = makeProjectDir("btxml-pipeline-runtime-");
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence unknownPort="1"/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const loaded = await loadInternalCheckInput(project.project);
  const result = await runProjectCheck({
    ...loaded,
    maxWarnings: 0,
  });
  assert.equal(result.ok, false);
  for (const file of result.files) {
    for (const diag of file.diagnostics) {
      if (diag.code === "BT105_UNKNOWN_NODE" || diag.code.startsWith("BT")) {
        assert.notEqual(diag.severity, "error", `diagnostic ${diag.code} was mutated to error`);
      }
    }
  }
});

test("effective config is used per file", async () => {
  const dir = makeProjectDir("btxml-pipeline-effective-");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["**/*.xml"] },
      overrides: [
        {
          files: ["legacy/*.xml"],
          linter: {
            rules: {
              "tree/no-unknown-subtree": "off",
            },
          },
        },
      ],
    }),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "legacy"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "legacy", "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  const legacyFile = result.files.find((f) => f.path === "legacy/tree.xml");
  const rootFile = result.files.find((f) => f.path === "tree.xml");
  assert.ok(legacyFile);
  assert.ok(rootFile);
  assert.equal(
    legacyFile.diagnostics.some((d) => d.code === "BT005_UNKNOWN_SUBTREE"),
    false,
    "legacy file should not have unknown subtree diagnostic because of effective config override",
  );
  assert.ok(
    rootFile.diagnostics.some((d) => d.code === "BT005_UNKNOWN_SUBTREE"),
    "root file should still have unknown subtree diagnostic",
  );
});
