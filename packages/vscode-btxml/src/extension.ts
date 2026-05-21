import * as vscode from "vscode";
import { createClientController } from "./client-controller.ts";
import { registerCommands } from "./commands.ts";
import { getSettings } from "./config.ts";
import { registerBtCppXmlLanguageDetection } from "./language.ts";
import { registerBtCppXmlOnEnterIndent } from "./on-enter-indent.ts";
import { registerBtCppXmlTagSnippets } from "./tag-snippets.ts";

let outputChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = outputChannel || vscode.window.createOutputChannel("BTXML");
  context.subscriptions.push(outputChannel);
  const controller = createClientController(context, outputChannel);
  context.subscriptions.push({
    dispose: () => {
      void controller.stop();
    },
  });
  const settings = getSettings();
  const clientRef = {
    get current() {
      return controller.current;
    },
  };

  registerCommands(context, clientRef, outputChannel, () => controller.restart());
  registerBtCppXmlLanguageDetection(context, (uri, type) => {
    if (!controller.current) return;
    void controller.current.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: uri.toString(), type }],
    });
  });
  registerBtCppXmlOnEnterIndent(context);
  registerBtCppXmlTagSnippets(context, clientRef);

  if (settings.enabled) {
    await controller.start();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration("btxml")) return;
      const updated = getSettings();
      if (!updated.enabled) {
        await controller.stop();
        return;
      }
      await controller.restart();
    }),
  );
}

export async function deactivate() {
  return undefined;
}
