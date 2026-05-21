import * as vscode from "vscode";
import { isBtCppXmlDocument } from "./btcpp-xml-document.ts";
import { shouldHandleOnEnterIndent } from "./input-guards.ts";
import { findOpenStartTagContextBeforePosition } from "./xml-context.ts";

function indentToColumn(baseIndent: string, openTagColumn: number, targetColumn: number) {
  if (targetColumn <= openTagColumn) return baseIndent;
  return `${baseIndent}${" ".repeat(targetColumn - openTagColumn)}`;
}

function getDesiredIndent(document: vscode.TextDocument, position: vscode.Position) {
  const context = findOpenStartTagContextBeforePosition(document, position);
  if (!context) return undefined;
  if (context.closingTokenBeforePosition) return context.baseIndent;
  if (context.firstAttributeColumn === undefined) return undefined;
  return indentToColumn(context.baseIndent, context.openTagColumn, context.firstAttributeColumn);
}

async function applyDesiredIndent(editor: vscode.TextEditor, position: vscode.Position) {
  const line = editor.document.lineAt(position.line);
  const typedPrefix = line.text.slice(0, position.character);
  if (!/^\s*$/.test(typedPrefix)) return false;

  const desiredIndent = getDesiredIndent(editor.document, position);
  if (desiredIndent === undefined || typedPrefix === desiredIndent) return false;

  const applied = await editor.edit((editBuilder) => {
    editBuilder.replace(
      new vscode.Range(position.line, 0, position.line, position.character),
      desiredIndent,
    );
  });
  if (!applied) return false;

  const cursor = new vscode.Position(position.line, desiredIndent.length);
  editor.selection = new vscode.Selection(cursor, cursor);
  return true;
}

export function registerBtCppXmlOnEnterIndent(context: vscode.ExtensionContext) {
  let applyingIndent = false;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (applyingIndent || event.contentChanges.length !== 1) return;
      const [change] = event.contentChanges;
      if (!shouldHandleOnEnterIndent(change.text)) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== event.document) return;
      if (!(await isBtCppXmlDocument(editor.document))) return;
      if (editor.selections.length !== 1 || !editor.selection.isEmpty) return;

      const position = event.document.positionAt(
        event.document.offsetAt(change.range.start) + change.text.length,
      );

      applyingIndent = true;
      try {
        await applyDesiredIndent(editor, position);
      } finally {
        applyingIndent = false;
      }
    }),
  );
}
