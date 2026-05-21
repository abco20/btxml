function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function splitSegments(value: string, preserveDotSegments = false): string[] {
  if (preserveDotSegments) {
    return value.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  }
  return normalizeSegments(value.split("/"));
}

function normalizeSegments(segments: string[]): string[] {
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized;
}

type PathishParts = {
  scheme?: string;
  authority?: string;
  absolute: boolean;
  segments: string[];
};

type SplitPathishOptions = {
  preserveDotSegments?: boolean;
};

function splitPathish(value: string, options: SplitPathishOptions = {}): PathishParts {
  const normalizedValue = value.replace(/\\/g, "/");
  const segments = (path: string) => splitSegments(path, options.preserveDotSegments);
  const uriMatch = /^(?<scheme>[A-Za-z][A-Za-z\d+.-]*):\/\/(?<authority>[^/]*)(?<path>\/.*)?$/.exec(
    normalizedValue,
  );
  if (uriMatch?.groups) {
    return {
      scheme: uriMatch.groups.scheme,
      authority: uriMatch.groups.authority,
      absolute: true,
      segments: segments(uriMatch.groups.path || "/"),
    };
  }

  const driveMatch = /^(?<drive>[A-Za-z]:)(?<rest>\/.*)?$/.exec(normalizedValue);
  if (driveMatch?.groups) {
    return {
      authority: driveMatch.groups.drive,
      absolute: true,
      segments: segments(driveMatch.groups.rest || "/"),
    };
  }

  return {
    absolute: normalizedValue.startsWith("/"),
    segments: segments(normalizedValue),
  };
}

function formatPathish(parts: PathishParts): string {
  const normalizedSegments = normalizeSegments(parts.segments);
  const path = normalizedSegments.join("/");
  if (parts.scheme) {
    const prefix = `${parts.scheme}://${parts.authority ?? ""}`;
    return path ? `${prefix}/${path}` : `${prefix}/`;
  }
  if (parts.authority && parts.absolute) {
    return path ? `${parts.authority}/${path}` : `${parts.authority}/`;
  }
  if (parts.absolute) {
    return path ? `/${path}` : "/";
  }
  return path;
}

function sameRoot(left: PathishParts, right: PathishParts): boolean {
  return (
    left.scheme === right.scheme &&
    left.authority === right.authority &&
    left.absolute === right.absolute
  );
}

function normalizeUriImpl(value: string): string {
  return formatPathish(splitPathish(value));
}

function joinUriImpl(base: string, ...parts: string[]): string {
  const baseParts = splitPathish(base);
  const joinedSegments = [...baseParts.segments];
  for (const part of parts) {
    const partParts = splitPathish(part, { preserveDotSegments: true });
    if (partParts.scheme || (partParts.absolute && partParts.authority)) {
      return normalizeUriImpl(part);
    }
    if (partParts.absolute) {
      joinedSegments.length = 0;
    }
    joinedSegments.push(...partParts.segments);
  }
  return formatPathish({ ...baseParts, segments: normalizeSegments(joinedSegments) });
}

function dirnameUriImpl(value: string): string {
  const parts = splitPathish(value);
  if (parts.segments.length === 0) return formatPathish(parts);
  return formatPathish({ ...parts, segments: parts.segments.slice(0, -1) });
}

function basenameUriImpl(value: string): string {
  const parts = splitPathish(value);
  return parts.segments.at(-1) ?? "";
}

function relativeUriImpl(from: string, to: string): string {
  const fromParts = splitPathish(from);
  const toParts = splitPathish(to);
  if (!sameRoot(fromParts, toParts)) return normalizeUriImpl(to);

  let shared = 0;
  while (
    shared < fromParts.segments.length &&
    shared < toParts.segments.length &&
    fromParts.segments[shared] === toParts.segments[shared]
  ) {
    shared += 1;
  }

  const up = new Array(fromParts.segments.length - shared).fill("..");
  const down = toParts.segments.slice(shared);
  return [...up, ...down].join("/");
}

function isWithinUriImpl(parent: string, child: string): boolean {
  const normalizedParent = ensureTrailingSlash(normalizeUriImpl(parent));
  const normalizedChild = normalizeUriImpl(child);
  return (
    normalizedChild === normalizedParent.slice(0, -1) ||
    normalizedChild.startsWith(normalizedParent)
  );
}

export type ProjectUriOps = {
  normalize(uri: string): string;
  join(baseUri: string, ...parts: string[]): string;
  dirname(uri: string): string;
  basename(uri: string): string;
  relative(fromUri: string, toUri: string): string;
  isWithin(parentUri: string, childUri: string): boolean;
};

export const projectUriOps: ProjectUriOps = {
  normalize: normalizeUriImpl,
  join: joinUriImpl,
  dirname: dirnameUriImpl,
  basename: basenameUriImpl,
  relative: relativeUriImpl,
  isWithin: isWithinUriImpl,
};

export function normalizeUri(value: string): string {
  return projectUriOps.normalize(value);
}

export function joinUri(base: string, ...parts: string[]): string {
  return projectUriOps.join(base, ...parts);
}

export function dirnameUri(value: string): string {
  return projectUriOps.dirname(value);
}

export function basenameUri(value: string): string {
  return projectUriOps.basename(value);
}

export function relativeUri(from: string, to: string): string {
  return projectUriOps.relative(from, to);
}

export function isWithinUri(parent: string, child: string): boolean {
  return projectUriOps.isWithin(parent, child);
}
