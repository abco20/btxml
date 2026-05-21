import type { NodeUsagePolicy } from "./types.js";

export const DEFAULT_NODE_USAGE_POLICY: NodeUsagePolicy = {
  unknownSubTreePorts: "allow",
};

export function normalizeNodeUsagePolicy(policy?: Partial<NodeUsagePolicy>): NodeUsagePolicy {
  return {
    ...DEFAULT_NODE_USAGE_POLICY,
    ...policy,
  };
}
