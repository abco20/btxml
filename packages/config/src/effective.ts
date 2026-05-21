import { mergeResolvedBtxmlConfig } from "./merge.js";
import { fileMatchesPattern } from "./overrides.js";
import { matchOverrides } from "./overrides.js";
import type { EffectiveFileConfig, ResolvedBtxmlConfig } from "./types.js";

function normalizeFilePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function decodeUriPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function fileUriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return uri;
  }

  const pathname = decodeUriPath(parsed.pathname);
  if (/^\/[A-Za-z]:/.test(pathname)) {
    return normalizeFilePath(pathname.slice(1));
  }

  if (parsed.host) {
    return normalizeFilePath(`//${parsed.host}${pathname}`);
  }

  return normalizeFilePath(pathname);
}

export function isIncludedFilePath(config: ResolvedBtxmlConfig, filePath: string): boolean {
  const normalizedPath = normalizeFilePath(filePath);
  if (config.files.ignore.some((pattern) => fileMatchesPattern(normalizedPath, pattern))) {
    return false;
  }
  return config.files.include.some((pattern) => fileMatchesPattern(normalizedPath, pattern));
}

export function isIncludedUri(config: ResolvedBtxmlConfig, uri: string): boolean {
  return isIncludedFilePath(config, fileUriToPath(uri));
}

export function getEffectiveConfigForFile(
  config: ResolvedBtxmlConfig,
  filePath: string,
): EffectiveFileConfig {
  const normalizedPath = normalizeFilePath(filePath);
  const matchingOverrides = matchOverrides(config, normalizedPath);

  let effective = config;
  for (const override of matchingOverrides) {
    effective = mergeResolvedBtxmlConfig(effective, {
      linter: override.linter,
      formatter: override.formatter,
    });
  }

  return {
    files: effective.files,
    resolver: effective.resolver,
    models: effective.models,
    linter: effective.linter,
    formatter: effective.formatter,
  };
}

export function getEffectiveConfigForUri(
  config: ResolvedBtxmlConfig,
  uri: string,
): EffectiveFileConfig {
  return getEffectiveConfigForFile(config, fileUriToPath(uri));
}
