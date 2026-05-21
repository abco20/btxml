export const CONFIG_ROOT_FIELDS = [
  "$schema",
  "strict",
  "files",
  "resolver",
  "models",
  "linter",
  "formatter",
  "overrides",
] as const;

export const SEVERITIES = ["off", "info", "warn", "error"] as const;

export const BEHAVIOR_TREE_ID_POLICIES = [
  "workspace-unique",
  "file-local-first",
  "allow-ambiguous",
] as const;
