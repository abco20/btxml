import type { CommandModule } from "yargs";
import { runCheckCommand } from "../context.ts";
import { CliError } from "../errors.ts";
import { checkOptionsSchema } from "../options/check.ts";
import { parseCommandOptions } from "../options/common.ts";
export { runCheck } from "../use-cases/check.ts";

export const checkCommand: CommandModule = {
  command: "check [files..]",
  describe: "Check format and lint",
  builder: (yargs) =>
    yargs
      .positional("files", { type: "string", array: true })
      .option("config", { type: "string" })
      .option("project-root", { type: "string" })
      .option("no-config", { type: "boolean" })
      .option("quiet", { type: "boolean" })
      .option("verbose", { type: "boolean" })
      .option("no-color", { type: "boolean" })
      .option("output", { type: "string" })
      .option("reporter", { type: "string" })
      .option("json", { type: "boolean" })
      .option("warnings-as-errors", { type: "boolean" })
      .option("max-warnings", { type: "number" })
      .option("show-skipped", { type: "boolean" })
      .option("show-suppressed", { type: "boolean" })
      .option("baseline", { type: "string" })
      .option("update-baseline", { type: "string" })
      .option("no-baseline", { type: "boolean" })
      .option("diff", { type: "boolean" })
      .option("no-format", { type: "boolean" })
      .option("no-lint", { type: "boolean" })
      .option("format-only", { type: "boolean" })
      .option("lint-only", { type: "boolean" })
      .option("fix", { type: "boolean" })
      .option("stdout", { type: "boolean", hidden: true }),
  handler: async (argv) => {
    if (argv.stdout) {
      throw new CliError(
        "--stdout is not supported for `check`",
        2,
        "use `--output json` for machine-readable output",
      );
    }
    const options = parseCommandOptions(checkOptionsSchema, argv);
    process.exitCode = await runCheckCommand(options);
  },
};
