import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function ensureFileUri(value: string): string {
  if (value.startsWith("file://")) return value;
  return pathToFileURL(path.resolve(value)).href;
}

export function fileUriToPath(uri: string): string {
  return fileURLToPath(ensureFileUri(uri));
}

export function pathToFileUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
}
