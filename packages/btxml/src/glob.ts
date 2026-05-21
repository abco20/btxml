import fs from "node:fs";
import path from "node:path";

function walk(dir: string, results: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    results.push(full);
    if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full, results);
  }
}

function globToRegex(pattern: string) {
  const normalized = pattern.replace(/\\/g, "/");
  let regex = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    const after = normalized[i + 2];
    if (ch === "*" && next === "*" && after === "/") {
      regex += "(?:.*/)?";
      i += 2;
      continue;
    }
    if (ch === "*" && next === "*") {
      regex += ".*";
      i += 1;
      continue;
    }
    if (ch === "*") {
      regex += "[^/]*";
      continue;
    }
    if (ch === "?") {
      regex += "[^/]";
      continue;
    }
    if (".+^${}()|[]\\".includes(ch)) {
      regex += `\\${ch}`;
      continue;
    }
    regex += ch;
  }
  regex += "$";
  return new RegExp(regex);
}

function matches(filePath: string, pattern: string) {
  const normalized = filePath.split(path.sep).join("/");
  const normalizedPattern = pattern.replace(/\\/g, "/");
  if (!normalizedPattern.includes("*") && !normalizedPattern.includes("?")) {
    return normalized === normalizedPattern || path.basename(normalized) === normalizedPattern;
  }
  return globToRegex(normalizedPattern).test(normalized);
}

function isGlobPattern(pattern: string) {
  return pattern.includes("*") || pattern.includes("?");
}

export function resolveFiles(patterns: string[], cwd: string, exclude: string[] = []) {
  const files: string[] = [];
  const globPatterns: string[] = [];

  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, path.sep);
    if (fs.existsSync(normalizedPattern) && fs.statSync(normalizedPattern).isFile()) {
      const normalized = path.relative(cwd, normalizedPattern).split(path.sep).join("/");
      if (!exclude.some((ex) => matches(normalized, ex))) files.push(pattern);
      continue;
    }
    if (!isGlobPattern(pattern)) continue;
    globPatterns.push(pattern);
  }

  if (globPatterns.length > 0) {
    const all: string[] = [];
    walk(cwd, all);
    for (const file of all.filter((entry) => fs.statSync(entry).isFile())) {
      const normalized = path.relative(cwd, file).split(path.sep).join("/");
      const included = globPatterns.some((pattern) => matches(normalized, pattern));
      const excluded = exclude.some((pattern) => matches(normalized, pattern));
      if (included && !excluded) files.push(file);
    }
  }

  return [...new Set(files)].sort();
}
