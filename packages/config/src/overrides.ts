import type { ResolvedBtxmlConfig, ResolvedOverrideConfig } from "./types.js";

function globToRegex(pattern: string): RegExp {
  let regex = "";
  let i = 0;
  while (i < pattern.length) {
    if (pattern.slice(i, i + 3) === "/**" && (i + 3 === pattern.length || pattern[i + 3] === "/")) {
      if (i + 3 === pattern.length) {
        regex += "(?:/.*)?";
        i += 3;
      } else {
        regex += "(?:/.*)?/";
        i += 4;
      }
    } else if (i === 0 && pattern.slice(i, i + 3) === "**/") {
      regex += "(?:.*/)?";
      i += 3;
    } else if (pattern.slice(i, i + 2) === "**") {
      regex += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      regex += "[^/]*";
      i += 1;
    } else if (pattern[i] === "?") {
      regex += "[^/]";
      i += 1;
    } else {
      regex += pattern[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${regex}$`);
}

export function fileMatchesPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const isNegation = pattern.startsWith("!");
  const actualPattern = isNegation ? pattern.slice(1) : pattern;
  const regex = globToRegex(actualPattern);
  const matches = regex.test(normalizedPath);
  return isNegation ? !matches : matches;
}

export function matchOverrides(
  config: ResolvedBtxmlConfig,
  filePath: string,
): ResolvedOverrideConfig[] {
  return config.overrides.filter((override) =>
    override.files.some((pattern) => fileMatchesPattern(filePath, pattern)),
  );
}
