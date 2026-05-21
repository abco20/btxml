import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { normalizeBtxmlConfig } from "@btxml/config";
import { parseBtXml } from "@btxml/syntax";
import { discoverBtxmlConfig } from "../src/config-discovery.js";
import { discoverProject } from "../src/discover.js";
import type { ProjectHost } from "../src/host.js";
import { normalizeEntrypoints } from "../src/internal/entrypoints.js";
import { discoverProjectFiles } from "../src/internal/files.js";
import { resolveIncludeGraph } from "../src/internal/includes.js";
import { loadProjectNodeModels } from "../src/node-definitions.js";
import { getProjectRootUri, getProjectSelectedFiles } from "../src/project-handle.js";
import type { BtxmlProject } from "../src/types.js";

function toUri(filePath: string) {
  return pathToFileURL(path.resolve(filePath)).href;
}

function createMemoryHost(
  cwd: string,
  files: Record<string, string>,
  options: { resolvePackageUri?: (packageName: string) => Promise<string | undefined> } = {},
): ProjectHost {
  const normalizedFiles = new Map(
    Object.entries(files).map(([filePath, text]) => [path.resolve(filePath), text] as const),
  );

  function directories() {
    const dirs = new Set<string>([path.resolve(cwd)]);
    for (const filePath of normalizedFiles.keys()) {
      let current = path.dirname(filePath);
      while (!dirs.has(current)) {
        dirs.add(current);
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    return dirs;
  }

  return {
    rootUri: () => toUri(cwd),
    readFile: async (uri) => normalizedFiles.get(path.resolve(new URL(uri).pathname)) ?? "",
    exists: async (uri) => {
      const absolute = path.resolve(new URL(uri).pathname);
      return normalizedFiles.has(absolute) || directories().has(absolute);
    },
    stat: async (uri) => {
      const absolute = path.resolve(new URL(uri).pathname);
      const text = normalizedFiles.get(absolute);
      if (text !== undefined) return { type: "file", size: text.length };
      if (directories().has(absolute)) return { type: "directory" };
      return undefined;
    },
    readDir: async (uri) => {
      const absolute = path.resolve(new URL(uri).pathname);
      const entries = new Map<string, "file" | "directory">();
      const dirs = directories();
      for (const filePath of normalizedFiles.keys()) {
        if (path.dirname(filePath) === absolute) entries.set(path.basename(filePath), "file");
      }
      for (const dir of dirs) {
        if (dir !== absolute && path.dirname(dir) === absolute)
          entries.set(path.basename(dir), "directory");
      }
      return [...entries.entries()].map(([name, type]) => ({ name, type }));
    },
    realpath: async (uri) => toUri(new URL(uri).pathname),
    resolvePackageUri: options.resolvePackageUri,
  };
}

test("config discovery uses ProjectHost", async () => {
  const root = "/mem/config";
  const host = createMemoryHost(path.join(root, "sub"), {
    [path.join(root, "btxml.config.json")]: JSON.stringify({ files: { include: ["trees/*.xml"] } }),
  });

  const result = await discoverBtxmlConfig({ startUri: toUri(path.join(root, "sub")), host });

  assert.equal(result.ok, true);
  assert.equal(result.configUri, toUri(path.join(root, "btxml.config.json")));
  assert.deepEqual(result.config?.files?.include, ["trees/*.xml"]);
});

test("project discovery uses rootUri and ProjectHost", async () => {
  const root = "/mem/project";
  const host = createMemoryHost(path.join(root, "pkg", "trees"), {
    [path.join(root, ".git", "HEAD")]: "ref: refs/heads/main\n",
    [path.join(root, "pkg", "btxml.config.json")]: JSON.stringify({
      files: { include: ["trees/*.xml"] },
    }),
    [path.join(root, "pkg", "trees", "main.xml")]: "<root/>",
  });

  const result = await discoverProject({
    rootUri: toUri(path.join(root, "pkg", "trees")),
    host,
  });

  assert.equal(result.ok, true);
  assert.ok(result.project);
  if (!result.project) throw new Error("expected project");
  assert.equal(getProjectRootUri(result.project), toUri(path.join(root, "pkg")));
  assert.deepEqual(
    getProjectSelectedFiles(result.project).map((file) => file.path),
    ["trees/main.xml"],
  );
});

test("project file discovery uses ProjectHost", async () => {
  const root = "/mem/files";
  const host = createMemoryHost(root, {
    [path.join(root, "main.xml")]: "<root/>",
    [path.join(root, "sub", "child.xml")]: "<root/>",
    [path.join(root, "notes.txt")]: "text",
  });

  const result = await discoverProjectFiles(
    toUri(root),
    {
      include: ["**/*.xml"],
      ignore: [],
      useGitignore: false,
      followSymlinks: false,
      maxSize: 1024,
    },
    undefined,
    undefined,
    host,
  );

  assert.deepEqual(
    result.selectedFiles.map((file) => file.path),
    ["main.xml", "sub/child.xml"],
  );
});

test("node definition loading uses ProjectHost", async () => {
  const root = "/mem/defs";
  const definitionPath = path.join(root, "nodes.json");
  const host = createMemoryHost(root, {
    [definitionPath]: JSON.stringify({ nodes: { SayHello: { kind: "Action", ports: {} } } }),
  });
  const project = {
    rootUri: toUri(root),
    host,
    config: {},
    selectedFiles: [],
    entrypoints: [],
    modelFiles: [],
    definitionFiles: [{ path: "nodes.json", uri: toUri(definitionPath), kind: "node-definition" }],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  const result = await loadProjectNodeModels({ project, host });

  assert.equal(result.ok, true);
  assert.equal(result.nodeModels[0]?.id, "SayHello");
});

test("include graph resolution uses ProjectHost", async () => {
  const root = "/mem/includes";
  const host = createMemoryHost(root, {
    [path.join(root, "main.xml")]: '<root><include path="common.xml"/></root>',
    [path.join(root, "common.xml")]: "<root/>",
  });
  const parsed = parseBtXml('<root><include path="common.xml"/></root>', {
    uri: "main.xml",
    path: path.join(root, "main.xml"),
  });
  if (!parsed.document) throw new Error("expected parsed document");
  const normalized = normalizeBtxmlConfig({
    resolver: {
      entrypoints: ["main.xml"],
      includes: { elements: [{ name: "include", attribute: "path" }] },
    },
  });
  if (!normalized.ok) throw new Error("expected normalized config");
  const project = {
    rootUri: toUri(root),
    host,
    config: {},
    resolvedConfig: normalized.config,
    selectedFiles: [{ path: "main.xml", uri: toUri(path.join(root, "main.xml")), kind: "bt-xml" }],
    entrypoints: normalizeEntrypoints(normalized.config.resolver),
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  const result = await resolveIncludeGraph({
    project,
    documents: [parsed.document],
    resolvedConfig: normalized.config,
    host,
  });

  assert.equal(result.issues.length, 0);
  assert.equal(result.graph.nodes.get("common.xml")?.exists, true);
});

test("include graph resolves ros_pkg include via ProjectHost.resolvePackageUri", async () => {
  const root = "/mem/ros-includes";
  const packageRoot = path.join(root, "ros", "my_pkg");
  const host = createMemoryHost(
    root,
    {
      [path.join(root, "main.xml")]:
        '<root><include ros_pkg="my_pkg" path="trees/common.xml"/></root>',
      [path.join(packageRoot, "trees", "common.xml")]: "<root/>",
    },
    {
      resolvePackageUri: async (packageName) =>
        packageName === "my_pkg" ? toUri(packageRoot) : undefined,
    },
  );

  const parsed = parseBtXml('<root><include ros_pkg="my_pkg" path="trees/common.xml"/></root>', {
    uri: "main.xml",
    path: path.join(root, "main.xml"),
  });
  if (!parsed.document) throw new Error("expected parsed document");
  const normalized = normalizeBtxmlConfig({
    resolver: {
      entrypoints: ["main.xml"],
      includes: { elements: [{ name: "include", attribute: "path" }] },
    },
  });
  if (!normalized.ok) throw new Error("expected normalized config");
  const project = {
    rootUri: toUri(root),
    host,
    config: {},
    resolvedConfig: normalized.config,
    selectedFiles: [{ path: "main.xml", uri: toUri(path.join(root, "main.xml")), kind: "bt-xml" }],
    entrypoints: normalizeEntrypoints(normalized.config.resolver),
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  const result = await resolveIncludeGraph({
    project,
    documents: [parsed.document],
    resolvedConfig: normalized.config,
    host,
  });

  assert.equal(
    result.issues.some((issue) => issue.kind === "ros-package-resolver-missing"),
    false,
  );
  assert.equal(
    result.issues.some((issue) => issue.kind === "ros-package-not-found"),
    false,
  );
  assert.ok(result.graph.edges.some((edge) => edge.to.endsWith("trees/common.xml")));
});

test("include graph reports missing ROS resolver when ros_pkg is used", async () => {
  const root = "/mem/ros-missing-resolver";
  const host = createMemoryHost(root, {
    [path.join(root, "main.xml")]:
      '<root><include ros_pkg="my_pkg" path="trees/common.xml"/></root>',
  });
  const parsed = parseBtXml('<root><include ros_pkg="my_pkg" path="trees/common.xml"/></root>', {
    uri: "main.xml",
    path: path.join(root, "main.xml"),
  });
  if (!parsed.document) throw new Error("expected parsed document");
  const normalized = normalizeBtxmlConfig({
    resolver: {
      entrypoints: ["main.xml"],
      includes: { elements: [{ name: "include", attribute: "path" }] },
    },
  });
  if (!normalized.ok) throw new Error("expected normalized config");
  const project = {
    rootUri: toUri(root),
    host,
    config: {},
    resolvedConfig: normalized.config,
    selectedFiles: [{ path: "main.xml", uri: toUri(path.join(root, "main.xml")), kind: "bt-xml" }],
    entrypoints: normalizeEntrypoints(normalized.config.resolver),
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  const result = await resolveIncludeGraph({
    project,
    documents: [parsed.document],
    resolvedConfig: normalized.config,
    host,
  });

  assert.ok(result.issues.some((issue) => issue.kind === "ros-package-resolver-missing"));
});

test("include graph reports ros package not found", async () => {
  const root = "/mem/ros-not-found";
  const host = createMemoryHost(
    root,
    {
      [path.join(root, "main.xml")]:
        '<root><include ros_pkg="missing_pkg" path="trees/common.xml"/></root>',
    },
    {
      resolvePackageUri: async () => undefined,
    },
  );
  const parsed = parseBtXml(
    '<root><include ros_pkg="missing_pkg" path="trees/common.xml"/></root>',
    {
      uri: "main.xml",
      path: path.join(root, "main.xml"),
    },
  );
  if (!parsed.document) throw new Error("expected parsed document");
  const normalized = normalizeBtxmlConfig({
    resolver: {
      entrypoints: ["main.xml"],
      includes: { elements: [{ name: "include", attribute: "path" }] },
    },
  });
  if (!normalized.ok) throw new Error("expected normalized config");
  const project = {
    rootUri: toUri(root),
    host,
    config: {},
    resolvedConfig: normalized.config,
    selectedFiles: [{ path: "main.xml", uri: toUri(path.join(root, "main.xml")), kind: "bt-xml" }],
    entrypoints: normalizeEntrypoints(normalized.config.resolver),
    modelFiles: [],
    definitionFiles: [],
    skippedFiles: [],
  } as unknown as BtxmlProject;

  const result = await resolveIncludeGraph({
    project,
    documents: [parsed.document],
    resolvedConfig: normalized.config,
    host,
  });

  assert.ok(result.issues.some((issue) => issue.kind === "ros-package-not-found"));
});
