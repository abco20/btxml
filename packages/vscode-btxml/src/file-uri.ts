import * as path from "node:path";
import { fileUriToPath } from "@btxml/config";

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}

export function getFileUriRelativeWorkspacePath(rootPath: string, uri: string): string | undefined {
  if (!uri.startsWith("file://")) return undefined;
  const relativePath = path.relative(rootPath, fileUriToPath(uri));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return normalizePath(relativePath);
}
