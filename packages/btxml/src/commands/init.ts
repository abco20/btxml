import fs from "node:fs";
import path from "node:path";
import { createInitConfig } from "@btxml/core";
import type { CommandModule } from "yargs";
import { runInitCommand } from "../context.ts";
import { parseCommandOptions } from "../options/common.ts";
import { initOptionsSchema } from "../options/init.ts";

export function runInit(options: { type?: string; force?: boolean }) {
  const file = path.resolve(process.cwd(), "btxml.config.json");
  if (fs.existsSync(file) && !options.force) {
    console.error("btxml.config.json already exists; use --force to overwrite");
    return { ok: false, usage: true };
  }
  const config = createInitConfig();
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Created ${file}`);
  return { ok: true };
}

export const initCommand: CommandModule = {
  command: "init",
  describe: "Create a new btxml.config.json",
  builder: (yargs) =>
    yargs
      .option("config", { type: "string" })
      .option("project-root", { type: "string" })
      .option("no-config", { type: "boolean" })
      .option("quiet", { type: "boolean" })
      .option("verbose", { type: "boolean" })
      .option("no-color", { type: "boolean" })
      .option("type", { type: "string" })
      .option("force", { type: "boolean" })
      .option("output", { type: "string" })
      .option("json", { type: "boolean" }),
  handler: async (argv) => {
    const options = parseCommandOptions(initOptionsSchema, argv);
    process.exitCode = await runInitCommand(options);
  },
};
