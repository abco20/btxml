import type { ResolvedFilesConfig } from "@btxml/config";
import ignore from "ignore";
import type { ProjectHost } from "../host.js";
import type { ProjectFile, SkippedFile } from "../types.js";
import { basenameUri, joinUri, relativeUri } from "../uri.js";

type ExpandPatternsResult = {
  files: string[];
  unmatchedPatterns: string[];
};

export function toPosix(value: string) {
  return value.replace(/\\/g, "/");
}

export function projectRelative(rootUri: string, fileUri: string) {
  return toPosix(relativeUri(rootUri, fileUri));
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
    if (".+-^${}()|[]\\".includes(ch)) regex += `\\${ch}`;
    else regex += ch;
  }
  regex += "$";
  return new RegExp(regex);
}

export function matchGlob(filePath: string, pattern: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");
  if (!normalizedPattern.includes("*") && !normalizedPattern.includes("?")) {
    return normalized === normalizedPattern || basenameUri(normalized) === normalizedPattern;
  }
  return globToRegex(normalizedPattern).test(normalized);
}

function isGlobPattern(pattern: string) {
  return pattern.includes("*") || pattern.includes("?");
}

async function walk(
  host: ProjectHost,
  dirUri: string,
  rootUri: string,
  exclude: string[],
  results: string[],
  followSymlinks: boolean,
  seen: Set<string>,
  ig?: ReturnType<typeof ignore>,
): Promise<void> {
  const relDir = projectRelative(rootUri, dirUri);
  if (
    relDir &&
    exclude.some(
      (pattern) =>
        matchGlob(relDir, pattern) ||
        matchGlob(`${relDir}/`, pattern) ||
        matchGlob(`${relDir}/dummy`, pattern),
    )
  ) {
    return;
  }
  if (ig && relDir && ig.ignores(relDir)) return;

  let entries: readonly import("../host.js").DirEntry[];
  try {
    entries = await host.readDir(dirUri);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullUri = joinUri(dirUri, entry.name);

    let isDir = entry.type === "directory";
    let isFile = entry.type === "file";

    if (entry.type === "other" && followSymlinks && host.realpath) {
      try {
        const realUri = await host.realpath(fullUri);
        if (seen.has(realUri)) continue;
        seen.add(realUri);
        const stat = await host.stat(realUri);
        isDir = stat?.type === "directory";
        isFile = stat?.type === "file";
      } catch {
        continue;
      }
    }

    if (isDir) await walk(host, fullUri, rootUri, exclude, results, followSymlinks, seen, ig);
    else if (isFile) results.push(fullUri);
  }
}

export async function expandPatterns(
  patterns: readonly string[],
  rootUri: string,
  exclude: string[],
  followSymlinks: boolean,
  baseUri: string | undefined,
  ig: ReturnType<typeof ignore> | undefined,
  host: ProjectHost,
): Promise<ExpandPatternsResult> {
  const selected = new Set<string>();
  const unmatchedPatterns = new Set<string>();
  const globPatterns: string[] = [];
  const patternBaseUri = baseUri ?? rootUri;

  for (const pattern of patterns) {
    const literalUri = joinUri(patternBaseUri, pattern);
    if ((await host.stat(literalUri))?.type === "file") {
      const rel = projectRelative(rootUri, literalUri);
      const insideRoot = !rel.startsWith("..");
      if (!exclude.some((ex) => matchGlob(rel, ex)) && (!insideRoot || !ig?.ignores(rel))) {
        selected.add(literalUri);
      }
      continue;
    }
    if (!isGlobPattern(pattern)) {
      unmatchedPatterns.add(pattern);
      continue;
    }
    globPatterns.push(pattern);
  }

  const all: string[] = [];
  if (globPatterns.length > 0 && (await host.exists(rootUri))) {
    const seen = new Set<string>([host.realpath ? await host.realpath(rootUri) : rootUri]);
    await walk(host, rootUri, rootUri, exclude, all, followSymlinks, seen, ig);
  }

  for (const fileUri of all) {
    const rel = projectRelative(patternBaseUri, fileUri);
    if (!globPatterns.some((pattern) => matchGlob(rel, pattern))) continue;
    if (exclude.some((pattern) => matchGlob(projectRelative(rootUri, fileUri), pattern))) continue;
    if (ig?.ignores(projectRelative(rootUri, fileUri))) continue;
    selected.add(fileUri);
  }

  for (const pattern of globPatterns) {
    const matched = all.some((fileUri) => {
      const rel = projectRelative(patternBaseUri, fileUri);
      return (
        matchGlob(rel, pattern) &&
        !exclude.some((ex) => matchGlob(projectRelative(rootUri, fileUri), ex)) &&
        !ig?.ignores(projectRelative(rootUri, fileUri))
      );
    });
    if (!matched) unmatchedPatterns.add(pattern);
  }

  return {
    files: [...selected].sort((a, b) =>
      projectRelative(rootUri, a).localeCompare(projectRelative(rootUri, b)),
    ),
    unmatchedPatterns: [...unmatchedPatterns].sort(),
  };
}

export async function loadGitignore(rootUri: string, host: ProjectHost): Promise<string[]> {
  const ignoreUri = joinUri(rootUri, ".gitignore");
  if (!(await host.exists(ignoreUri))) return [];
  const content = await host.readFile(ignoreUri);
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function createIgnoreInstance(lines: string[]): ReturnType<typeof ignore> {
  return ignore().add(lines);
}

export async function discoverProjectFiles(
  rootUri: string,
  filesConfig: ResolvedFilesConfig,
  cliFiles: readonly string[] | undefined,
  baseUri: string | undefined,
  host: ProjectHost,
): Promise<{
  selectedFiles: ProjectFile[];
  skippedFiles: SkippedFile[];
  unmatchedPatterns: string[];
}> {
  const ignore = [...filesConfig.ignore];
  const gitignoreLines = filesConfig.useGitignore ? await loadGitignore(rootUri, host) : [];
  const ig = createIgnoreInstance(gitignoreLines);
  const patterns = cliFiles?.length ? cliFiles : filesConfig.include;
  const selectedUris = await expandPatterns(
    patterns,
    rootUri,
    ignore,
    filesConfig.followSymlinks,
    cliFiles?.length ? baseUri : undefined,
    ig,
    host,
  );

  const maxSize = filesConfig.maxSize;
  const selectedFiles: ProjectFile[] = [];
  const skippedFiles: SkippedFile[] = [];

  for (const fileUri of selectedUris.files) {
    const rel = projectRelative(rootUri, fileUri);
    const stat = await host.stat(fileUri);
    if (!stat) continue;
    if ((stat.size ?? 0) > maxSize) {
      skippedFiles.push({ path: rel, reason: "too-large" });
      continue;
    }
    selectedFiles.push({ path: rel, uri: fileUri, kind: "unknown" });
  }

  return { selectedFiles, skippedFiles, unmatchedPatterns: selectedUris.unmatchedPatterns };
}
