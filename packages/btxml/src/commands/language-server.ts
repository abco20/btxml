import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CommandModule } from "yargs";
import { runLanguageServerCommand } from "../context.ts";
import { parseCommandOptions } from "../options/common.ts";
import { languageServerOptionsSchema } from "../options/language-server.ts";

function resolveServerEntry() {
  const runtimeDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();

  const candidates = [
    path.resolve(runtimeDir, "server.cjs"),
    path.resolve(runtimeDir, "..", "server.cjs"),
    path.resolve(runtimeDir, "..", "btxml-checker", "dist", "server.cjs"),
    path.resolve(runtimeDir, "..", "btxml-checker-monorepo", "dist", "server.cjs"),
    path.resolve(process.cwd(), "dist", "server.cjs"),
    path.resolve(process.cwd(), "packages", "btxml-lsp", "dist", "server.cjs"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export async function runLanguageServer(_options: { stdio?: boolean }) {
  const builtServerEntry = resolveServerEntry();
  if (!fs.existsSync(builtServerEntry)) {
    throw new Error(`LSP server build not found: ${builtServerEntry}. Run \`pnpm build\`.`);
  }
  await import(pathToFileURL(builtServerEntry).href);
  return { ok: true };
}

export const languageServerCommand: CommandModule = {
  command: "language-server",
  describe: false,
  builder: (yargs) => yargs.option("stdio", { type: "boolean" }),
  handler: async (argv) => {
    const options = parseCommandOptions(languageServerOptionsSchema, argv);
    process.exitCode = await runLanguageServerCommand(options);
  },
};
