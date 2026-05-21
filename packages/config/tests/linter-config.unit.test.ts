import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateBtXml } from "@btxml/analyzer";
import { RuleCodes, validateRawConfigRules } from "@btxml/analyzer/rules";
import {
  getDefaultResolvedBtxmlConfig,
  getEffectiveConfigForFile,
  normalizeBtxmlConfig,
} from "@btxml/config";
import { checkProject, getBaselinePath } from "@btxml/project";
import { discoverNodeProject } from "@btxml/project/node";

const DEFAULT_RESOLVED_BTXML_CONFIG = getDefaultResolvedBtxmlConfig();

test("linter.enabled = false skips diagnostics", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-linter-enabled-false-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ files: { include: ["tree.xml"] }, linter: { enabled: false } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><UnknownNode/></BehaviorTree></root>',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  assert.equal(
    result.files[0].diagnostics.some((diag) => diag.code === RuleCodes.UnknownNode),
    false,
  );
});

test("rule config via slug affects severity", () => {
  const input =
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Sequence unknownPort="1"/></BehaviorTree></root>';
  const config = getEffectiveConfigForFile(
    {
      ...DEFAULT_RESOLVED_BTXML_CONFIG,
      linter: {
        ...DEFAULT_RESOLVED_BTXML_CONFIG.linter,
        rules: {
          "model/no-unknown-port": "error" as const,
        },
      },
    },
    "tree.xml",
  );
  const result = validateBtXml(input, { config });
  const diag = result.diagnostics.find((d) => d.code === RuleCodes.UnknownPort);
  assert.ok(diag);
  assert.equal(diag.severity, "error");
});

test("include and suppression severities follow linter rules and suppression defaults", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-suppression-severity-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      linter: {
        rules: {
          "include/no-missing-file": "off",
          "include/no-cycle": "error",
          "suppression/no-unused": "warn",
          "suppression/require-reason": "error",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tree.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="missing.xml"/></root>\n<!-- btxml-disable-file BT105_UNKNOWN_NODE -->',
    "utf8",
  );
  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  const diagCodes = result.files[0].diagnostics.map((diag) => diag.code);
  assert.equal(diagCodes.includes(RuleCodes.IncludeNotFound), false);
  assert.equal(
    result.files[0].diagnostics.find((diag) => diag.code === RuleCodes.MissingSuppressionReason)
      ?.severity,
    "error",
  );
});

test("allowOutsideRoot reports external include through include rule", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-external-used-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-external-target-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["main.xml"] },
      resolver: { entrypoints: ["main.xml"], includes: { allowOutsideRoot: true } },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="${path.join(outside, "shared.xml")}"/><BehaviorTree ID="main"/></root>`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outside, "shared.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="shared"/></root>',
    "utf8",
  );

  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  const diagnostics = result.files.flatMap((file) => file.diagnostics);
  assert.equal(
    diagnostics.some((diag) => diag.code === RuleCodes.IncludeOutsideWorkspace),
    false,
  );
  assert.equal(
    diagnostics.some((diag) => diag.code === RuleCodes.ExternalIncludeUsed),
    true,
  );
  assert.equal(
    diagnostics.find((diag) => diag.code === RuleCodes.ExternalIncludeUsed)?.severity,
    "info",
  );
});

test("include fact rules can be disabled", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-include-fact-rules-off-"));
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["main.xml"] },
      resolver: {
        entrypoints: ["main.xml"],
        includes: { allowOutsideRoot: true, maxDepth: 1, maxFiles: 1 },
      },
      linter: {
        rules: {
          "include/report-external-used": "off",
          "include/no-unresolved-variable": "off",
          "include/no-depth-exceeded": "off",
          "include/no-too-many-files": "off",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "main.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><include path="${missing}.xml"/><include path="b.xml"/><include path="../outside.xml"/><BehaviorTree ID="main"/></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "b.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="b"/></root>',
    "utf8",
  );
  fs.writeFileSync(
    path.join(path.dirname(dir), "outside.xml"),
    '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="outside"/></root>',
    "utf8",
  );

  const project = await discoverNodeProject({ cwd: dir });
  assert.ok(project.project);
  const result = await checkProject({ project: project.project });
  const codes = new Set(result.files.flatMap((file) => file.diagnostics.map((diag) => diag.code)));
  assert.equal(codes.has(RuleCodes.ExternalIncludeUsed), false);
  assert.equal(codes.has(RuleCodes.UnresolvedIncludePathVariable), false);
  assert.equal(codes.has(RuleCodes.IncludeDepthExceeded), false);
  assert.equal(codes.has(RuleCodes.TooManyResolvedFiles), false);
});

test("model conflict rule severity controls conflict diagnostics", async () => {
  for (const [ruleSeverity, expectedSeverity] of [
    ["off", undefined],
    ["warn", "warning"],
    ["error", "error"],
  ] as const) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `btxml-conflict-severity-${ruleSeverity}-`));
    fs.writeFileSync(
      path.join(dir, "btxml.config.json"),
      JSON.stringify({
        files: { include: ["tree.xml"] },
        models: { files: ["a.xml", "b.xml"] },
        linter: { rules: { "model/no-conflicting-definition": ruleSeverity } },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "tree.xml"),
      '<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4"><BehaviorTree ID="main"><Move goal=""/></BehaviorTree></root>',
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "a.xml"),
      '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="string"/></Action></TreeNodesModel>',
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "b.xml"),
      '<?xml version="1.0" encoding="UTF-8"?><TreeNodesModel><Action ID="Move"><input_port name="goal" type="Pose2D"/></Action></TreeNodesModel>',
      "utf8",
    );
    const project = await discoverNodeProject({ cwd: dir });
    assert.ok(project.project);
    const result = await checkProject({ project: project.project });
    const conflicts = result.files.flatMap((file) =>
      file.diagnostics.filter((diag) => diag.code === RuleCodes.ConflictingNodeModel),
    );

    if (!expectedSeverity) {
      assert.equal(conflicts.length, 0);
      continue;
    }
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].severity, expectedSeverity);
  }
});

test("unknown rule slug is a config error", () => {
  const diagnostics = validateRawConfigRules({
    linter: {
      rules: {
        "model/unknown-rule": "error" as const,
      },
    },
  });
  assert.ok(diagnostics.some((d) => d.code === "CFG010_UNKNOWN_RULE"));
});

test("unknown rule option is a config error", () => {
  const diagnostics = validateRawConfigRules({
    linter: {
      rules: {
        "model/no-unknown-port": ["warn", { unknown: true }] as ["warn", Record<string, unknown>],
      },
    },
  });
  assert.ok(diagnostics.some((d) => d.code === "CFG011_INVALID_RULE_OPTION"));
});

test("suppression config reads from linter.suppressions", () => {
  const config = normalizeBtxmlConfig({
    linter: {
      suppressions: {
        inline: "deny",
      },
    },
  }).config;
  assert.equal(config.linter.suppressions.inline, "deny");
});

test("baseline path reads from linter.baseline", () => {
  const config = {
    linter: {
      baseline: "v1-baseline.json",
    },
  };
  assert.equal(
    getBaselinePath(config as import("@btxml/config").ResolvedBtxmlConfig),
    "v1-baseline.json",
  );
});
