import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverProjectFiles } from "../src/internal/files.js";
import { createNodeProjectHost, pathToFileUri } from "../src/node.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "btxml-assoc-"));
}

function baseFilesConfig(partial: Partial<import("@btxml/config").ResolvedFilesConfig> = {}) {
  return {
    include: ["*.xml"],
    ignore: [],
    useGitignore: false,
    followSymlinks: false,
    maxSize: 1024 * 1024,
    ...partial,
  };
}

test("files.ignore excludes matching file", async () => {
  const dir = tmpDir();
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "a.xml"), "<root/>");
  fs.writeFileSync(path.join(dir, "b.xml"), "<root/>");
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    baseFilesConfig({ ignore: ["b.xml"] }),
    undefined,
    undefined,
    host,
  );
  assert.ok(result.selectedFiles.some((f) => f.path === "a.xml"));
  assert.equal(
    result.selectedFiles.some((f) => f.path === "b.xml"),
    false,
  );
  assert.equal(
    result.skippedFiles.some((f) => f.path === "b.xml"),
    false,
  );
});

test("selected files are discovered as unknown kind by default", async () => {
  const dir = tmpDir();
  const host = createNodeProjectHost(dir);
  fs.writeFileSync(path.join(dir, "tree.xml"), "<root/>");
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    baseFilesConfig(),
    undefined,
    undefined,
    host,
  );
  assert.equal(result.selectedFiles[0]?.kind, "unknown");
});

test("unmatched literal include is reported", async () => {
  const dir = tmpDir();
  const host = createNodeProjectHost(dir);
  const result = await discoverProjectFiles(
    pathToFileUri(dir),
    baseFilesConfig({ include: ["missing.xml"] }),
    undefined,
    undefined,
    host,
  );
  assert.equal(result.selectedFiles.length, 0);
  assert.deepEqual(result.unmatchedPatterns, ["missing.xml"]);
});
