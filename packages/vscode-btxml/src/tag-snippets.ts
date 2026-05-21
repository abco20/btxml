import { findJustClosedStartTag, findOpenStartTagAtSlash, scanXmlPrefix } from "@btxml/syntax";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";
import { getEffectiveBtCppConfigForUri, isBtCppXmlDocument } from "./btcpp-xml-document.ts";
import {
  buildBlockSnippet,
  getChildCapabilityFromBuiltinSets,
  isChildCapableTag,
  resetChildCapabilityFallbackResolver,
  setChildCapabilityFallbackResolver,
  setChildCapabilityRequest,
} from "./child-capability.ts";
import { shouldHandleSlashSnippet } from "./input-guards.ts";
import { getSnippetFallbackBuiltinSets } from "./tag-snippet-fallback.ts";
import { getTagSnippetTrigger } from "./tag-snippet-trigger.ts";

export type LanguageClientRef = {
  readonly current: LanguageClient | undefined;
};

async function insertSnippet(
  editor: vscode.TextEditor,
  snippet: string,
  position: vscode.Position,
) {
  await editor.insertSnippet(new vscode.SnippetString(snippet), position);
}

async function handleSlash(editor: vscode.TextEditor, positionAfterSlash: vscode.Position) {
  const document = editor.document;
  const slashOffset = document.offsetAt(positionAfterSlash);
  const text = document.getText();

  if (slashOffset >= 2 && text.slice(slashOffset - 2, slashOffset) === "</") {
    const scan = scanXmlPrefix(text, slashOffset);
    if (scan.context !== "text") return false;

    const tagName = scan.stack.at(-1);
    if (!tagName) return false;

    await insertSnippet(editor, `${tagName}>`, positionAfterSlash);
    return true;
  }

  const openTag = findOpenStartTagAtSlash(text, slashOffset);
  if (!openTag) return false;

  await insertSnippet(editor, ">", positionAfterSlash);
  return true;
}

function hasImmediateClosingTag(text: string, positionOffset: number, tagName: string) {
  const rest = text.slice(positionOffset);
  return new RegExp(`^[ \t]*</${escapeRegExp(tagName)}>`).test(rest);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleGreaterThan(editor: vscode.TextEditor, positionAfterChar: vscode.Position) {
  const document = editor.document;
  const version = document.version;
  const offset = document.offsetAt(positionAfterChar);
  const text = document.getText();
  const startTag = findJustClosedStartTag(text, offset);
  if (!startTag) return false;
  if (startTag.closingToken === "/>") return false;
  if (!(await isChildCapableTag(editor.document.uri.toString(), startTag))) return false;
  if (document.version !== version) return false;

  const currentOffset = document.offsetAt(positionAfterChar);
  const currentText = document.getText();
  const currentStartTag = findJustClosedStartTag(currentText, currentOffset);
  if (
    !currentStartTag ||
    currentStartTag.tagName !== startTag.tagName ||
    currentStartTag.tagStartOffset !== startTag.tagStartOffset ||
    currentStartTag.tagEndOffset !== startTag.tagEndOffset ||
    currentStartTag.closingToken !== startTag.closingToken
  ) {
    return false;
  }
  if (hasImmediateClosingTag(currentText, currentOffset, startTag.tagName)) return false;

  await insertSnippet(editor, buildBlockSnippet(startTag.tagName), positionAfterChar);
  return true;
}

let activeClientRef: LanguageClientRef | undefined;

async function requestChildCapabilityFromLsp(
  uri: string,
  tagName: string,
  attributes?: Readonly<Record<string, string | undefined>>,
) {
  const client = activeClientRef?.current;
  if (!client) return undefined;
  try {
    return await client.sendRequest<{ capable: boolean }>("btxml/getChildCapability", {
      uri,
      tagName,
      attributes,
    });
  } catch {
    return undefined;
  }
}

async function requestChildCapabilityFromWorkspaceConfig(
  uri: string,
  tagName: string,
  _attributes?: Readonly<Record<string, string | undefined>>,
) {
  const config = await getEffectiveBtCppConfigForUri(uri);
  return getChildCapabilityFromBuiltinSets(tagName, getSnippetFallbackBuiltinSets(config));
}

export function registerBtCppXmlTagSnippets(
  context: vscode.ExtensionContext,
  client: LanguageClientRef,
) {
  activeClientRef = client;
  setChildCapabilityRequest(requestChildCapabilityFromLsp);
  setChildCapabilityFallbackResolver(requestChildCapabilityFromWorkspaceConfig);
  let applyingSnippet = false;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (applyingSnippet || event.contentChanges.length !== 1) return;
      const [change] = event.contentChanges;
      const trigger = getTagSnippetTrigger(change);
      if (!trigger) return;
      if (trigger === "slash" && !shouldHandleSlashSnippet(change)) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== event.document) return;
      if (!(await isBtCppXmlDocument(editor.document))) return;
      if (editor.selections.length !== 1 || !editor.selection.isEmpty) return;

      const positionAfterChange = event.document.positionAt(
        event.document.offsetAt(change.range.start) + change.text.length,
      );

      applyingSnippet = true;
      try {
        if (trigger === "slash") {
          await handleSlash(editor, positionAfterChange);
          return;
        }
        await handleGreaterThan(editor, positionAfterChange);
      } finally {
        applyingSnippet = false;
      }
    }),
    {
      dispose() {
        if (activeClientRef === client) activeClientRef = undefined;
        setChildCapabilityRequest(async () => undefined);
        resetChildCapabilityFallbackResolver();
      },
    },
  );
}
