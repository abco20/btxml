import type { EffectiveFileConfig } from "@btxml/config";
import type { NodeUsagePolicy } from "@btxml/semantic";

export function getNodeUsagePolicyForRules(config: EffectiveFileConfig): Partial<NodeUsagePolicy> {
  const rule = config.linter.rules["model/no-unknown-port"];

  if (Array.isArray(rule) && rule.length >= 2) {
    const options = rule[1] as Record<string, unknown>;

    if (options.subTreePorts === "strict") {
      return { unknownSubTreePorts: "reject" };
    }
  }

  return { unknownSubTreePorts: "allow" };
}
