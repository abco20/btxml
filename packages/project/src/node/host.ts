import { constants as FsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { DirEntry, FileStat, ProjectHost } from "../host.js";
import { fileUriToPath, pathToFileUri } from "./uri.js";

export type NodeProjectHostOptions = {
  rootPath?: string;
  resolvePackageUri?: (packageName: string) => Promise<string | undefined>;
};

function statType(stat: import("node:fs").Stats): FileStat["type"] {
  if (stat.isFile()) return "file";
  if (stat.isDirectory()) return "directory";
  return "other";
}

export function createNodeProjectHost(
  rootPath = process.cwd(),
  options: NodeProjectHostOptions = {},
): ProjectHost {
  const resolvedRootPath = path.resolve(rootPath);
  const rootUri = pathToFileUri(resolvedRootPath);
  return {
    rootUri() {
      return rootUri;
    },
    async readFile(uri: string) {
      return fs.readFile(fileUriToPath(uri), "utf8");
    },
    async exists(uri: string) {
      try {
        await fs.access(fileUriToPath(uri), FsConstants.F_OK);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return false;
      }
    },
    async stat(uri: string) {
      try {
        const stat = await fs.stat(fileUriToPath(uri));
        return { type: statType(stat), size: stat.size };
      } catch {
        return undefined;
      }
    },
    async readDir(uri: string): Promise<readonly DirEntry[]> {
      const entries = await fs.readdir(fileUriToPath(uri), { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other",
      }));
    },
    async realpath(uri: string) {
      return pathToFileUri(await fs.realpath(fileUriToPath(uri)));
    },
    async resolvePackageUri(packageName: string) {
      return options.resolvePackageUri?.(packageName);
    },
  };
}
