import type { CommandModule } from "yargs";
import { runFormatCommand } from "../context.ts";
import { parseCommandOptions } from "../options/common.ts";
import { formatOptionsSchema } from "../options/format.ts";
export { runFormat } from "../use-cases/format.ts";

export const formatCommand: CommandModule = {
  command: "format [files..]",
  describe: "Format BT/XML files",
  builder: (yargs) =>
    yargs
      .positional("files", { type: "string", array: true })
      .option("config", { type: "string" })
      .option("project-root", { type: "string" })
      .option("no-config", { type: "boolean" })
      .option("quiet", { type: "boolean" })
      .option("verbose", { type: "boolean" })
      .option("no-color", { type: "boolean" })
      .option("check", { type: "boolean" })
      .option("diff", { type: "boolean" })
      .option("stdout", { type: "boolean" })
      .option("write", { type: "boolean" })
      .option("force", { type: "boolean" })
      .option("output", { type: "string" }),
  handler: async (argv) => {
    const options = parseCommandOptions(formatOptionsSchema, argv);
    process.exitCode = await runFormatCommand(options);
  },
};
