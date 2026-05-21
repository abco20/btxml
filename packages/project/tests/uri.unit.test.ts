import assert from "node:assert/strict";
import test from "node:test";
import { dirnameUri, isWithinUri, joinUri, relativeUri } from "../src/uri.js";

test("joinUri resolves file URIs", () => {
  assert.equal(joinUri("file:///repo", "a.xml"), "file:///repo/a.xml");
  assert.equal(joinUri("file:///repo/", "dir", "../a.xml"), "file:///repo/a.xml");
});

test("dirnameUri returns directory for file URI", () => {
  assert.equal(dirnameUri("file:///repo/dir/a.xml"), "file:///repo/dir");
});

test("relativeUri returns relative file URI path", () => {
  assert.equal(relativeUri("file:///repo", "file:///repo/dir/a.xml"), "dir/a.xml");
});

test("isWithinUri distinguishes sibling file URI roots", () => {
  assert.equal(isWithinUri("file:///repo", "file:///repo/a.xml"), true);
  assert.equal(isWithinUri("file:///repo", "file:///repo2/a.xml"), false);
});

test("joinUri preserves virtual URI schemes", () => {
  assert.equal(
    joinUri("memory:///workspace", "trees", "main.xml"),
    "memory:///workspace/trees/main.xml",
  );
});

test("file URI helpers support Windows drive paths", () => {
  assert.equal(joinUri("file:///C:/repo", "tree.xml"), "file:///C:/repo/tree.xml");
  assert.equal(joinUri("file:///C:/repo", "dir", "../tree.xml"), "file:///C:/repo/tree.xml");
  assert.equal(dirnameUri("file:///C:/repo/tree.xml"), "file:///C:/repo");
  assert.equal(relativeUri("file:///C:/repo", "file:///C:/repo/tree.xml"), "tree.xml");
  assert.equal(isWithinUri("file:///C:/repo", "file:///C:/repo/tree.xml"), true);
});
