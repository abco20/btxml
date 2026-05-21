import { findRuleMetadata, listRuleCodes } from "@btxml/analyzer/rules";
import type { CommandModule } from "yargs";
import { runExplainCommand } from "../context.ts";
import { parseCommandOptions } from "../options/common.ts";
import { explainOptionsSchema } from "../options/explain.ts";

function resolveRule(rule: string) {
  const exact = findRuleMetadata(rule);
  if (exact) return exact;
  const prefix = rule.toUpperCase();
  const matches = listRuleCodes().filter((code) => code.startsWith(prefix));
  if (matches.length === 1) return findRuleMetadata(matches[0]);
  if (matches.length > 1) return { ambiguity: matches };
  return undefined;
}

export function runExplain(rule: string | undefined) {
  if (!rule) {
    console.error("explain requires a rule code");
    return { ok: false };
  }
  const found = resolveRule(rule);
  if (found && "ambiguity" in found) {
    console.error(`Ambiguous rule prefix: ${rule}`);
    for (const candidate of found.ambiguity) console.error(`  ${candidate}`);
    return { ok: false };
  }
  if (!found) {
    console.error(`Unknown rule: ${rule}`);
    return { ok: false };
  }
  console.log(`Rule: ${found.code}`);
  console.log(`Default severity: ${found.defaultSeverity}`);
  console.log(found.description);
  if (found.invalidExample) console.log(`Invalid: ${found.invalidExample}`);
  if (found.validExample) console.log(`Valid: ${found.validExample}`);
  if (found.fix) console.log(`Fix: ${found.fix}`);
  if (found.configExample) console.log(`Config: ${found.configExample}`);
  return { ok: true };
}

export const explainCommand: CommandModule = {
  command: "explain [rule]",
  describe: "Show rule documentation",
  builder: (yargs) =>
    yargs
      .positional("rule", { type: "string" })
      .option("config", { type: "string" })
      .option("project-root", { type: "string" })
      .option("no-config", { type: "boolean" })
      .option("quiet", { type: "boolean" })
      .option("verbose", { type: "boolean" })
      .option("no-color", { type: "boolean" })
      .option("output", { type: "string" })
      .option("json", { type: "boolean" }),
  handler: async (argv) => {
    const options = parseCommandOptions(explainOptionsSchema, argv);
    process.exitCode = await runExplainCommand(options);
  },
};
