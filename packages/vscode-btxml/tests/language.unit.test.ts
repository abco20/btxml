import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAutoPromotionTracker } from "../src/auto-promotion-tracker.ts";
import {
  BTCPP_XML_LANGUAGE_ID,
  hasBtCppXmlDetectionSignals,
  isBehaviorTreePath,
  isLikelyBtCppXml,
  shouldTreatAsBtCppXmlDocument,
} from "../src/btcpp-xml-classifier.ts";
import {
  collectBtCppConfigPaths,
  collectExternalBtCppConfigPaths,
  isBtCppConfigPath,
  resolveBtCppConfigPath,
} from "../src/btcpp-xml-config-path.ts";
import { getBtCppXmlLanguageAction } from "../src/btcpp-xml-language-state.ts";
import { readBtCppXmlConfigFromDisk } from "../src/config-disk-reader.ts";
import { shouldRefreshDetectionForConfigDocument } from "../src/config-refresh-policy.ts";
import { getFileUriRelativeWorkspacePath } from "../src/file-uri.ts";
import {
  FILE_CHANGE_TYPE,
  collectBtCppConfigWatchTargets,
  refreshDetectionForWatchedConfigChange,
} from "../src/language-config-watch.ts";

test("shouldTreatAsBtCppXmlDocument keeps config-included plain xml active", () => {
  assert.equal(
    shouldTreatAsBtCppXmlDocument({
      includedByConfig: true,
      languageId: "xml",
      fsPath: "/workspace/misc/plain.xml",
      text: "<Sequence><AlwaysSuccess/></Sequence>",
    }),
    true,
  );
});

test("shouldTreatAsBtCppXmlDocument does not claim ordinary xml without BT signals", () => {
  assert.equal(
    shouldTreatAsBtCppXmlDocument({
      includedByConfig: false,
      languageId: "xml",
      fsPath: "/workspace/misc/plain.xml",
      text: "<note><to>User</to></note>",
    }),
    false,
  );
});

test("shouldTreatAsBtCppXmlDocument keeps explicit btcpp-xml documents active", () => {
  assert.equal(
    shouldTreatAsBtCppXmlDocument({
      includedByConfig: false,
      languageId: BTCPP_XML_LANGUAGE_ID,
      fsPath: "/workspace/misc/plain.xml",
      text: "<note/>",
    }),
    true,
  );
});

test("isBehaviorTreePath recognizes BT-oriented xml locations", () => {
  assert.equal(isBehaviorTreePath("/workspace/behavior_trees/main.xml"), false);
  assert.equal(isBehaviorTreePath("/workspace/main.bt.xml"), true);
  assert.equal(isBehaviorTreePath("/workspace/main.tree.xml"), true);
  assert.equal(isBehaviorTreePath("/workspace/main.xml"), false);
});

test("hasBtCppXmlDetectionSignals ignores ordinary xml under behavior_trees path", () => {
  assert.equal(
    hasBtCppXmlDetectionSignals({
      includedByConfig: false,
      fsPath: "/workspace/behavior_trees/plain.xml",
      text: "<note><to>User</to></note>",
    }),
    false,
  );
});

test("isLikelyBtCppXml recognizes root and model markers", () => {
  assert.equal(isLikelyBtCppXml('<root BTCPP_format="4"><BehaviorTree/></root>'), true);
  assert.equal(isLikelyBtCppXml("<TreeNodesModel/>"), true);
  assert.equal(isLikelyBtCppXml("<note/>"), false);
});

test("isLikelyBtCppXml ignores BT markers in comments, CDATA, and processing instructions", () => {
  assert.equal(isLikelyBtCppXml('<!-- <BehaviorTree ID="Main"/> --><note/>'), false);
  assert.equal(
    isLikelyBtCppXml('<![CDATA[<root BTCPP_format="4"><BehaviorTree/></root>]]><note/>'),
    false,
  );
  assert.equal(isLikelyBtCppXml('<?xml-stylesheet href="<TreeNodesModel/>"?><note/>'), false);
});

test("isLikelyBtCppXml still recognizes structural BT tags after non-element markup", () => {
  assert.equal(isLikelyBtCppXml('<!-- comment --><BehaviorTree ID="Main"/>'), true);
  assert.equal(isLikelyBtCppXml("<![CDATA[ignored]]><TreeNodesModel/>"), true);
});

test("hasBtCppXmlDetectionSignals ignores ordinary xml without BT markers", () => {
  assert.equal(
    hasBtCppXmlDetectionSignals({
      includedByConfig: false,
      fsPath: "/workspace/plain.xml",
      text: "<note><to>User</to></note>",
    }),
    false,
  );
});

test("getBtCppXmlLanguageAction promotes plain xml when BT detection succeeds", () => {
  assert.deepEqual(
    getBtCppXmlLanguageAction({
      languageId: "xml",
      detectedAsBtCppXml: true,
    }),
    {
      type: "promote",
      fromLanguageId: "xml",
      toLanguageId: BTCPP_XML_LANGUAGE_ID,
    },
  );
});

test("getBtCppXmlLanguageAction demotes only auto-promoted documents", () => {
  assert.deepEqual(
    getBtCppXmlLanguageAction({
      languageId: BTCPP_XML_LANGUAGE_ID,
      detectedAsBtCppXml: false,
      autoPromotedFromLanguageId: "xml",
    }),
    {
      type: "demote",
      fromLanguageId: BTCPP_XML_LANGUAGE_ID,
      toLanguageId: "xml",
    },
  );
});

test("getBtCppXmlLanguageAction keeps explicit btcpp-xml documents pinned", () => {
  assert.deepEqual(
    getBtCppXmlLanguageAction({
      languageId: BTCPP_XML_LANGUAGE_ID,
      detectedAsBtCppXml: false,
    }),
    { type: "none" },
  );
});

test("getBtCppXmlLanguageAction does not demote BT-oriented paths after auto-promotion", () => {
  assert.deepEqual(
    getBtCppXmlLanguageAction({
      languageId: BTCPP_XML_LANGUAGE_ID,
      detectedAsBtCppXml: hasBtCppXmlDetectionSignals({
        includedByConfig: false,
        fsPath: "/workspace/main.bt.xml",
        text: "<note/>",
      }),
      autoPromotedFromLanguageId: "xml",
    }),
    { type: "none" },
  );
});

test("getBtCppXmlLanguageAction still demotes after setTextDocumentLanguage close/reopen", () => {
  const uri = "file:///workspace/tree.xml";
  const tracker = createAutoPromotionTracker();

  tracker.markLanguageSwitch(uri);
  tracker.setPromotedFromLanguage(uri, "xml");

  assert.equal(tracker.preserveOnClose(uri), true);
  tracker.finishReopen(uri);

  assert.deepEqual(
    getBtCppXmlLanguageAction({
      languageId: BTCPP_XML_LANGUAGE_ID,
      detectedAsBtCppXml: false,
      autoPromotedFromLanguageId: tracker.get(uri),
    }),
    {
      type: "demote",
      fromLanguageId: BTCPP_XML_LANGUAGE_ID,
      toLanguageId: "xml",
    },
  );
});

test("auto-promotion tracker clears provenance for ordinary closes", () => {
  const uri = "file:///workspace/tree.xml";
  const tracker = createAutoPromotionTracker();

  tracker.setPromotedFromLanguage(uri, "xml");

  assert.equal(tracker.preserveOnClose(uri), false);
  tracker.clear(uri);
  assert.equal(tracker.get(uri), undefined);
});

test("shouldRefreshDetectionForConfigDocument only refreshes on save", () => {
  assert.equal(
    shouldRefreshDetectionForConfigDocument({ isConfigDocument: true, reason: "change" }),
    false,
  );
  assert.equal(
    shouldRefreshDetectionForConfigDocument({ isConfigDocument: true, reason: "save" }),
    true,
  );
  assert.equal(
    shouldRefreshDetectionForConfigDocument({ isConfigDocument: false, reason: "save" }),
    false,
  );
});

test("resolveBtCppConfigPath keeps absolute config paths outside the workspace", () => {
  assert.equal(
    resolveBtCppConfigPath("/workspace/project", "/configs/shared/btxml.config.json"),
    "/configs/shared/btxml.config.json",
  );
});

test("collectBtCppConfigPaths de-duplicates shared absolute config files", () => {
  assert.deepEqual(
    collectBtCppConfigPaths(
      ["/workspace/project-a", "/workspace/project-b"],
      "/configs/shared/btxml.config.json",
    ),
    ["/configs/shared/btxml.config.json"],
  );
});

test("collectExternalBtCppConfigPaths keeps only resolved config files outside workspaces", () => {
  assert.deepEqual(
    collectExternalBtCppConfigPaths(
      ["/workspace/project-a", "/workspace/project-b"],
      "/configs/shared/btxml.config.json",
    ),
    ["/configs/shared/btxml.config.json"],
  );
  assert.deepEqual(
    collectExternalBtCppConfigPaths(
      ["/workspace/project-a", "/workspace/project-b"],
      "configs/shared/btxml.config.json",
    ),
    [],
  );
});

test("isBtCppConfigPath matches absolute config files outside the workspace", () => {
  assert.equal(
    isBtCppConfigPath({
      documentPath: "/configs/shared/btxml.config.json",
      workspacePaths: ["/workspace/project-a", "/workspace/project-b"],
      configuredPath: "/configs/shared/btxml.config.json",
    }),
    true,
  );
});

test("collectBtCppConfigWatchTargets includes workspace-local configs without LSP notifications", () => {
  assert.deepEqual(collectBtCppConfigWatchTargets(["/workspace/project"], null), [
    {
      configPath: "/workspace/project/btxml.config.json",
      notifyLanguageServer: false,
    },
  ]);
});

test("collectBtCppConfigWatchTargets keeps external config notifications enabled", () => {
  assert.deepEqual(
    collectBtCppConfigWatchTargets(
      ["/workspace/project-a", "/workspace/project-b"],
      "/configs/shared/btxml.config.json",
    ),
    [
      {
        configPath: "/configs/shared/btxml.config.json",
        notifyLanguageServer: true,
      },
    ],
  );
});

test("refreshDetectionForWatchedConfigChange reclassifies workspace-local config changes without LSP notification", () => {
  const invalidated: string[] = [];
  const notifications: Array<{ uri: string; type: number }> = [];
  let detectCalls = 0;

  refreshDetectionForWatchedConfigChange({
    uri: "file:///workspace/project/btxml.config.json",
    type: FILE_CHANGE_TYPE.Changed,
    invalidateConfigCache: (uri) => invalidated.push(uri),
    detectVisibleEditors: () => {
      detectCalls += 1;
    },
    onWatchedConfigChange: (uri, type) => notifications.push({ uri, type }),
    notifyLanguageServer: false,
  });

  assert.deepEqual(invalidated, ["file:///workspace/project/btxml.config.json"]);
  assert.equal(detectCalls, 1);
  assert.deepEqual(notifications, []);
});

test("getFileUriRelativeWorkspacePath normalizes Windows and percent-encoded paths", () => {
  assert.equal(
    getFileUriRelativeWorkspacePath(
      "C:/workspace",
      "file:///C:/workspace/behavior%20trees/main.xml",
    ),
    "behavior trees/main.xml",
  );
  assert.equal(
    getFileUriRelativeWorkspacePath("/workspace", "file:///workspace/behavior%20trees/main.xml"),
    "behavior trees/main.xml",
  );
  assert.equal(
    getFileUriRelativeWorkspacePath("/workspace", "file:///other/behavior%20trees/main.xml"),
    undefined,
  );
});

test("readBtCppXmlConfigFromDisk only reflects saved config content", async () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-vscode-config-disk-"));
  const configPath = path.join(workspacePath, "btxml.config.json");

  fs.writeFileSync(configPath, JSON.stringify({ files: { include: [] } }), "utf8");
  const initial = await readBtCppXmlConfigFromDisk(configPath);
  assert.deepEqual(initial?.files.include, []);

  const unsavedEditorText = JSON.stringify({ files: { include: ["plain.xml"] } });
  assert.deepEqual(initial?.files.include, []);
  assert.notDeepEqual(initial?.files.include, JSON.parse(unsavedEditorText).files.include);

  fs.writeFileSync(configPath, unsavedEditorText, "utf8");
  const saved = await readBtCppXmlConfigFromDisk(configPath);
  assert.deepEqual(saved?.files.include, ["plain.xml"]);
});
