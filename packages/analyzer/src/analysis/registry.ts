import { RULES, type RuleName, type RuleRegistryEntry } from "../rules/registry.js";
import type { RuleModule } from "./rule.js";
import { includeRules } from "./rules/include.js";
import { modelRules } from "./rules/model.js";
import { scriptRules } from "./rules/script/index.js";
import { suppressionRules } from "./rules/suppression.js";
import { treeRules } from "./rules/tree.js";
import { usageRules } from "./rules/usage/index.js";
import { xmlRules } from "./rules/xml.js";

export const ANALYSIS_RULES: RuleModule[] = [
  ...xmlRules,
  ...scriptRules,
  ...treeRules,
  ...modelRules,
  ...usageRules,
  ...includeRules,
  ...suppressionRules,
];

export const AnalysisRuleRegistry: ReadonlyMap<RuleName, RuleModule> = new Map(
  ANALYSIS_RULES.map((rule) => [rule.name, rule]),
);

export function ruleModule(name: RuleName): RuleModule {
  const rule = AnalysisRuleRegistry.get(name);
  if (!rule) throw new Error(`Missing analysis rule module for ${name}`);
  return rule;
}
