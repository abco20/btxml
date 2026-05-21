import type { SemanticIndex } from "../types.js";
import { resolveNodeUsage } from "./resolve-node-usage.js";
import type { PortUsageResolution, ResolveNodeUsageInput, ResolvePortUsageInput } from "./types.js";

export function resolvePortUsage(
  index: SemanticIndex,
  input: ResolvePortUsageInput,
): PortUsageResolution | undefined {
  const usage = resolveNodeUsage(index, input);

  return usage.portUsages.find((candidate) => candidate.name === input.attributeName);
}

export function getUsagePorts(index: SemanticIndex, input: ResolveNodeUsageInput) {
  return resolveNodeUsage(index, input).ports;
}
