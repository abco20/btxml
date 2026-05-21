import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { checkCommand } from "./commands/check.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { explainCommand } from "./commands/explain.ts";
import { formatCommand } from "./commands/format.ts";
import { initCommand } from "./commands/init.ts";
import { languageServerCommand } from "./commands/language-server.ts";
import { lintCommand } from "./commands/lint.ts";
import { repairCommand } from "./commands/repair.ts";
import { CliError, handleError } from "./errors.ts";
import { TOOL_VERSION } from "./output.ts";

const commands = new Set([
  "format",
  "lint",
  "check",
  "repair",
  "init",
  "explain",
  "doctor",
  "language-server",
]);

function toCliError(message: string | undefined, argv: string[]) {
  const text = message || "invalid command";
  const missing = text.match(/^Not enough arguments following: (.+)$/);
  if (missing)
    return new CliError(`--${missing[1]} requires a value`, 2, "provide a value after the option");

  const unknown = text.match(/^Unknown argument: (.+)$/);
  if (unknown) {
    const value = unknown[1];
    const first = argv[0];
    if (first && !first.startsWith("-") && !commands.has(first)) {
      return new CliError(
        `unknown command \`${first}\``,
        2,
        "run `btxml --help` to see available commands",
      );
    }
    return new CliError(
      `unknown option \`--${value}\``,
      2,
      "run `btxml --help` to see supported options",
    );
  }

  const unknownPlural = text.match(/^Unknown arguments: (.+)$/);
  if (unknownPlural) {
    const value = unknownPlural[1].split(",")[0]?.trim() || "unknown";
    return new CliError(
      `unknown option \`--${value}\``,
      2,
      "run `btxml --help` to see supported options",
    );
  }

  return new CliError(text, 2);
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    await yargs(hideBin(["node", "btxml", ...argv]))
      .scriptName("btxml")
      .version(TOOL_VERSION)
      .parserConfiguration({ "boolean-negation": false })
      .strict()
      .recommendCommands()
      .demandCommand(1)
      .command(formatCommand)
      .command(lintCommand)
      .command(checkCommand)
      .command(repairCommand)
      .command(initCommand)
      .command(explainCommand)
      .command(doctorCommand)
      .command(languageServerCommand)
      .fail((message: string | undefined, error: Error | undefined) => {
        throw error ?? toCliError(message, argv);
      })
      .parseAsync();

    return typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (error) {
    return handleError(error);
  }
}
