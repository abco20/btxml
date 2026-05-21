import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

async function waitFor(condition: () => boolean, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for condition");
}

function extractCursor(textWithCursor: string) {
  const offset = textWithCursor.indexOf("|");
  assert.notEqual(offset, -1, "text fixture must include a cursor marker");
  return {
    text: `${textWithCursor.slice(0, offset)}${textWithCursor.slice(offset + 1)}`,
    offset,
  };
}

async function openSnippetDocument(textWithCursor: string) {
  const fixture = extractCursor(textWithCursor);
  const document = await vscode.workspace.openTextDocument({
    content: fixture.text,
    language: "btcpp-xml",
  });
  const editor = await vscode.window.showTextDocument(document);
  const position = document.positionAt(fixture.offset);
  editor.selection = new vscode.Selection(position, position);
  return editor;
}

async function typeText(text: string) {
  await vscode.commands.executeCommand("default:type", { text });
}

async function pressEnter() {
  await typeText("\n");
}

async function replaceRange(editor: vscode.TextEditor, range: vscode.Range, text: string) {
  const applied = await editor.edit((editBuilder) => {
    editBuilder.replace(range, text);
  });
  assert.equal(applied, true);
}

function cursorRange(editor: vscode.TextEditor) {
  return new vscode.Range(editor.selection.active, editor.selection.active);
}

async function waitForEditorState(
  editor: vscode.TextEditor,
  expectedText: string,
  expectedCursorText: string,
) {
  const expectedCursor = extractCursor(expectedCursorText);
  await waitFor(() => editor.document.getText() === expectedText, 5000);
  await waitFor(
    () => editor.selection.active.isEqual(editor.document.positionAt(expectedCursor.offset)),
    5000,
  );
}

async function assertSnippetResult(
  initialTextWithCursor: string,
  typed: string,
  expectedText: string,
  expectedCursorText: string,
) {
  const editor = await openSnippetDocument(initialTextWithCursor);
  await typeText(typed);
  await waitForEditorState(editor, expectedText, expectedCursorText);
}

async function assertEnterResult(
  initialTextWithCursor: string,
  expectedText: string,
  expectedCursorText: string,
) {
  const editor = await openSnippetDocument(initialTextWithCursor);
  await pressEnter();
  try {
    await waitForEditorState(editor, expectedText, expectedCursorText);
  } catch (error) {
    throw new Error(
      `${String(error)}\nactual text:\n${JSON.stringify(editor.document.getText())}\nactual cursor offset: ${editor.document.offsetAt(editor.selection.active)}`,
    );
  }
}

async function assertReplacementResult(
  initialTextWithCursor: string,
  replacement: (editor: vscode.TextEditor) => Promise<void>,
  expectedText: string,
  expectedCursorText: string,
) {
  const editor = await openSnippetDocument(initialTextWithCursor);
  await replacement(editor);
  try {
    await waitForEditorState(editor, expectedText, expectedCursorText);
  } catch (error) {
    throw new Error(
      `${String(error)}\nactual text:\n${JSON.stringify(editor.document.getText())}\nactual cursor offset: ${editor.document.offsetAt(editor.selection.active)}`,
    );
  }
}

async function assertUndoWithinTwoSteps(initialTextWithCursor: string, typed: string) {
  const editor = await openSnippetDocument(initialTextWithCursor);
  const initial = extractCursor(initialTextWithCursor);
  await typeText(typed);
  await vscode.commands.executeCommand("undo");
  if (editor.document.getText() !== initial.text) {
    await vscode.commands.executeCommand("undo");
  }
  assert.equal(editor.document.getText(), initial.text);
  assert.ok(editor.selection.active.isEqual(editor.document.positionAt(initial.offset)));
}

async function assertUndoWithinTwoStepsAfterEdit(
  initialTextWithCursor: string,
  applyEdit: (editor: vscode.TextEditor) => Promise<void>,
) {
  const editor = await openSnippetDocument(initialTextWithCursor);
  const initial = extractCursor(initialTextWithCursor);
  await applyEdit(editor);
  await vscode.commands.executeCommand("undo");
  if (editor.document.getText() !== initial.text) {
    await vscode.commands.executeCommand("undo");
  }
  assert.equal(editor.document.getText(), initial.text);
  assert.ok(editor.selection.active.isEqual(editor.document.positionAt(initial.offset)));
}

export async function run() {
  const extension = vscode.extensions.getExtension("abco20.btxml-checker");
  assert.ok(extension, "extension should be registered");

  await extension.activate();
  assert.equal(extension.isActive, true);
  await vscode.workspace
    .getConfiguration("editor")
    .update("formatOnType", false, vscode.ConfigurationTarget.Global);

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("btxml.restartLanguageServer"));
  assert.ok(commands.includes("btxml.formatDocument"));

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "workspace should be open");

  const documentUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, "tree.xml"));
  const document = await vscode.workspace.openTextDocument(documentUri);
  await vscode.window.showTextDocument(document);

  await waitFor(
    () =>
      vscode.languages
        .getDiagnostics(documentUri)
        .some((diag) => String(diag.code) === "BT005_UNKNOWN_SUBTREE"),
    15000,
  );

  const completionPosition = new vscode.Position(5, 18);
  const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    documentUri,
    completionPosition,
  );
  assert.ok(completionList);

  await assertSnippetResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <|\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    "/",
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      </Sequence>\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      </Sequence>|\n    </Sequence>\n  </BehaviorTree>\n</root>`,
  );

  await assertSnippetResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Fallback>\n        <|\n      </Fallback>\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    "/",
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Fallback>\n        </Fallback>\n      </Fallback>\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Fallback>\n        </Fallback>|\n      </Fallback>\n    </Sequence>\n  </BehaviorTree>\n</root>`,
  );

  await assertSnippetResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Action path="|"/>\n  </BehaviorTree>\n</root>`,
    "/",
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Action path="/"/>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Action path="/|"/>\n  </BehaviorTree>\n</root>`,
  );

  await assertSnippetResult("<!-- <| -->", "/", "<!-- </ -->", "<!-- </| -->");

  await assertSnippetResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess|\n  </BehaviorTree>\n</root>`,
    "/",
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess/>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess/>|\n  </BehaviorTree>\n</root>`,
  );

  await assertUndoWithinTwoSteps(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess|\n  </BehaviorTree>\n</root>`,
    "/",
  );

  await assertUndoWithinTwoSteps(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <|\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    "/",
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      \n    </Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      |\n    </Sequence>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Seq|\n  </BehaviorTree>\n</root>`,
    (editor) =>
      replaceRange(
        editor,
        new vscode.Range(new vscode.Position(2, 5), editor.selection.active),
        "Sequence>",
      ),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      \n    </Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      |\n    </Sequence>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Delay delay_msec="10"|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Delay delay_msec="10">\n      \n    </Delay>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Delay delay_msec="10">\n      |\n    </Delay>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <AlwaysSuccess>|\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Control ID="Foo"|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Control ID="Foo">\n      \n    </Control>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Control ID="Foo">\n      |\n    </Control>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Decorator ID="Timeout"|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Decorator ID="Timeout">\n      \n    </Decorator>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Decorator ID="Timeout">\n      |\n    </Decorator>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Action ID="Foo"|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Action ID="Foo">\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Action ID="Foo">|\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Condition ID="IsReady"|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Condition ID="IsReady">\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Condition ID="IsReady">|\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Sequence|\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Sequence>\n        \n      </Sequence>\n    </Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n      <Sequence>\n        |\n      </Sequence>\n    </Sequence>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence|</Sequence>\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence></Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>|</Sequence>\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence/|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence/>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence/>|\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence name="a|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence name="a>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence name="a>|\n  </BehaviorTree>\n</root>`,
  );

  await assertReplacementResult(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    |\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), "<Sequence>\n</Sequence>"),
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n</Sequence>\n  </BehaviorTree>\n</root>`,
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence>\n</Sequence>|\n  </BehaviorTree>\n</root>`,
  );

  await assertUndoWithinTwoStepsAfterEdit(
    `<root BTCPP_format="4">\n  <BehaviorTree ID="Main">\n    <Sequence|\n  </BehaviorTree>\n</root>`,
    (editor) => replaceRange(editor, cursorRange(editor), ">"),
  );

  await assertEnterResult(
    `<BoolSub topic_name=""|`,
    `<BoolSub topic_name=""\n         `,
    `<BoolSub topic_name=""\n         |`,
  );

  await assertEnterResult(
    `<BoolSub topic_name=""\n         transient_local="true"|`,
    `<BoolSub topic_name=""\n         transient_local="true"\n         `,
    `<BoolSub topic_name=""\n         transient_local="true"\n         |`,
  );

  await assertEnterResult(
    `<BoolSub topic_name=""\n         transient_local="true"\n         value="false"/>|`,
    `<BoolSub topic_name=""\n         transient_local="true"\n         value="false"/>\n`,
    `<BoolSub topic_name=""\n         transient_local="true"\n         value="false"/>\n|`,
  );

  await assertEnterResult(
    `<Sequence>\n  <BoolSub topic_name=""\n           transient_local="true"\n           value="false"/>|\n</Sequence>`,
    `<Sequence>\n  <BoolSub topic_name=""\n           transient_local="true"\n           value="false"/>\n  \n</Sequence>`,
    `<Sequence>\n  <BoolSub topic_name=""\n           transient_local="true"\n           value="false"/>\n  |\n</Sequence>`,
  );

  await assertEnterResult(
    `<Action path="foo|bar"/>`,
    `<Action path="foo\nbar"/>`,
    `<Action path="foo\n|bar"/>`,
  );

  await assertEnterResult("<!-- foo|bar -->", "<!-- foo\nbar -->", "<!-- foo\n|bar -->");

  await assertEnterResult("<![CDATA[foo|bar]]>", "<![CDATA[foo\nbar]]>", "<![CDATA[foo\n|bar]]>");

  await vscode.commands.executeCommand("btxml.showOutput");
}
