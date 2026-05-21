import type { RawBtxmlConfig, ResolvedBtxmlConfig } from "./types.js";

export const STRICT_CONFIG_OVERRIDES = {
  linter: {
    rules: {
      "xml/require-btcpp-format": "error",
      "xml/no-unknown-top-level-element": "error",
      "model/no-unknown-node": "error",
      "model/no-unknown-port": ["error", { subTreePorts: "strict" }],
      "script/no-unknown-variable": "error",
      "model/no-childless-control-shape-mismatch": "error",
      "model/no-leaf-block-shape": "error",
      "model/valid-child-count": "error",
      "suppression/no-unused": "error",
      "suppression/require-reason": "warn",
    },
  },
} as const;

export const DEFAULT_RESOLVED_BTXML_CONFIG: ResolvedBtxmlConfig = {
  files: {
    include: ["**/*.xml"],
    ignore: ["build/**", "install/**", "log/**", "node_modules/**", ".git/**"],
    useGitignore: true,
    followSymlinks: false,
    maxSize: 5 * 1024 * 1024,
  },
  resolver: {
    entrypoints: [],
    includes: {
      elements: [{ name: "include", attribute: "path", base: "file" }],
      variables: {},
      allowOutsideRoot: false,
      maxDepth: 32,
      maxFiles: 1000,
    },
    behaviorTreeIds: "workspace-unique",
  },
  models: {
    builtins: ["btcpp-v4"],
    files: [],
    augmentations: [],
    definitions: [],
    inline: {},
  },
  linter: {
    enabled: true,
    rules: {},
    baseline: undefined,
    suppressions: {
      inline: "allow",
    },
  },
  formatter: {
    indentWidth: 2,
    xmlDeclaration: "always",
    blankLineBetweenBehaviorTrees: true,
    lineEnding: "lf",
  },
  overrides: [],
};

export function getDefaultBtxmlConfig(): RawBtxmlConfig {
  return {};
}

export function getDefaultResolvedBtxmlConfig(): ResolvedBtxmlConfig {
  return structuredClone(DEFAULT_RESOLVED_BTXML_CONFIG);
}
