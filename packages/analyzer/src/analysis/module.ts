import { RULES, type RuleName, type RuleRegistryEntry } from "../rules/registry.js";
import type { RuleModule } from "./rule.js";

export function makeRuleModule<TOptions = unknown>(
  input: Omit<RuleModule<TOptions>, "code" | "defaultSeverity" | "optionsSchema" | "meta"> & {
    name: RuleName;
    meta?: RuleModule<TOptions>["meta"];
  },
): RuleModule<TOptions> {
  const entry: RuleRegistryEntry<TOptions> = RULES[input.name] as RuleRegistryEntry<TOptions>;
  return {
    ...input,
    code: entry.code,
    defaultSeverity: entry.defaultSeverity,
    optionsSchema: entry.optionsSchema as RuleModule<TOptions>["optionsSchema"],
    meta: input.meta ?? { description: entry.description },
  };
}
