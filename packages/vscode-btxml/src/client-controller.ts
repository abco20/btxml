import type * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";
import { createLanguageClient } from "./client.ts";

export function createClientController(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
) {
  let client: LanguageClient | undefined;

  return {
    get current() {
      return client;
    },
    async start() {
      if (client) return client;
      client = createLanguageClient(context, outputChannel);
      await client.start();
      return client;
    },
    async stop() {
      if (!client) return;
      const running = client;
      client = undefined;
      await running.stop();
    },
    async restart() {
      await this.stop();
      await this.start();
    },
  };
}
