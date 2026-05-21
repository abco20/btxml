import { type BtDocument, type BtXmlElement, parseBtXml } from "@btxml/syntax";
import type { IncludeIssue } from "../analyzer-facts.js";
import type {
  IncludeGraph,
  IncludeGraphResult,
  ResolveIncludeGraphInput,
} from "../internal-types.js";
import { asInternalProject } from "../project-handle.js";
import { dirnameUri, isWithinUri, joinUri, relativeUri } from "../uri.js";

function getAttr(element: BtXmlElement, name: string) {
  return element.attributes.find((attr) => attr.name === name);
}

function projectRelative(rootUri: string, fileUri: string) {
  return relativeUri(rootUri, fileUri).replace(/\\/g, "/");
}

function expandVariables(
  value: string,
  variables: Record<string, string>,
  issues: IncludeIssue[],
  range: BtXmlElement["range"],
  uri: string,
) {
  return value.replace(/\$\{([^}]+)\}/g, (match, name: string) => {
    if (name.startsWith("env:")) return process.env[name.slice(4)] ?? match;
    if (variables[name] !== undefined) return variables[name];
    issues.push({
      kind: "unresolved-variable",
      uri,
      variable: name,
      range,
      message: `unresolved include path variable \`${name}\``,
    });
    return match;
  });
}

function includeElements(document: BtDocument, input: ResolveIncludeGraphInput) {
  const configs = input.resolvedConfig.resolver.includes.elements.map((el) => ({
    name: el.name,
    pathAttribute: el.attribute,
    base: (el.base === "project-root" ? "project-root" : "current-file") as
      | "current-file"
      | "project-root",
  }));
  const root = document.root;
  if (!root) return [];
  const includes: Array<{
    element: BtXmlElement;
    pathAttr?: ReturnType<typeof getAttr>;
    rosPackageAttr?: ReturnType<typeof getAttr>;
    base: "current-file" | "project-root";
  }> = [];
  for (const child of root.children || []) {
    if (child.kind !== "element") continue;
    const config = configs.find((candidate) => candidate.name === child.name);
    if (!config) continue;
    includes.push({
      element: child,
      pathAttr: getAttr(child, config.pathAttribute),
      rosPackageAttr: getAttr(child, "ros_pkg"),
      base: config.base ?? "current-file",
    });
  }
  return includes;
}

export async function resolveIncludeGraph(
  input: ResolveIncludeGraphInput,
): Promise<IncludeGraphResult> {
  const project = asInternalProject(input.project);
  const host = input.host ?? project.host;
  const allowOutside = input.resolvedConfig.resolver.includes.allowOutsideRoot;
  const maxDepth = input.resolvedConfig.resolver.includes.maxDepth;
  const maxFiles = input.resolvedConfig.resolver.includes.maxFiles;
  const issues: IncludeIssue[] = [];
  const docsByPath = new Map(
    input.documents.map(
      (doc) => [projectRelative(project.rootUri, doc.path || doc.uri), doc] as const,
    ),
  );
  const graph: IncludeGraph = {
    nodes: new Map(),
    edges: [],
    entrypointFiles: [],
    reachableFiles: new Set(),
    cycles: [],
  };
  const reachableDocuments = new Map<string, BtDocument>();
  const reachableUris = new Set<string>();
  const entrypointFiles = project.entrypoints.length
    ? project.entrypoints.map((entry) => entry.file)
    : project.selectedFiles.map((file) => file.path);
  graph.entrypointFiles = [...new Set(entrypointFiles)];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = async (
    relPath: string,
    stack: string[],
    source?: { uri: string; range?: BtXmlElement["range"] },
  ) => {
    if (stack.length >= maxDepth) {
      issues.push({
        kind: "depth-exceeded",
        uri: source?.uri ?? relPath,
        path: relPath,
        range: source?.range,
        message: `include \`${relPath}\` exceeds the configured maximum include depth`,
      });
      return;
    }
    if (graph.reachableFiles.size >= maxFiles) {
      issues.push({
        kind: "too-many-files",
        uri: source?.uri ?? relPath,
        path: relPath,
        range: source?.range,
        message: `resolving \`${relPath}\` would exceed the configured file limit`,
      });
      return;
    }
    const normalized = relPath.replaceAll("\\", "/");
    if (visiting.has(normalized)) {
      const cycle = [...stack.slice(stack.indexOf(normalized)), normalized];
      graph.cycles.push({ files: cycle });
      issues.push({
        kind: "cycle",
        uri: source?.uri ?? normalized,
        path: normalized,
        cycle,
        range: source?.range,
        message: "include cycle detected",
      });
      return;
    }
    if (visited.has(normalized)) return;
    visiting.add(normalized);
    graph.reachableFiles.add(normalized);
    const absoluteUri = joinUri(project.rootUri, normalized);
    reachableUris.add(absoluteUri);
    const exists = await host.exists(absoluteUri);
    let document = docsByPath.get(normalized);
    if (!document && exists) {
      const parsed = parseBtXml(await host.readFile(absoluteUri), {
        uri: absoluteUri,
        path: normalized,
      });
      document = parsed.document;
      if (document) docsByPath.set(normalized, document);
    }
    graph.nodes.set(normalized, { path: normalized, document, exists });
    if (document) reachableDocuments.set(document.uri, document);
    const documentUri = document?.uri ?? absoluteUri;
    if (!exists) {
      issues.push({
        kind: "not-found",
        uri: source?.uri ?? documentUri,
        path: normalized,
        range: source?.range,
        message: `include file not found \`${normalized}\``,
      });
      visiting.delete(normalized);
      return;
    }
    if (!document) {
      visiting.delete(normalized);
      return;
    }
    for (const include of includeElements(document, input)) {
      if (!include.pathAttr) {
        issues.push({
          kind: "missing-path",
          uri: documentUri,
          range: include.element.range,
          message: "missing include path",
        });
        continue;
      }
      const expanded = expandVariables(
        include.pathAttr.value,
        input.resolvedConfig.resolver.includes.variables,
        issues,
        include.pathAttr.range,
        documentUri,
      );
      let targetUri: string;
      if (include.rosPackageAttr) {
        const packageName = include.rosPackageAttr.value.trim();
        if (!host.resolvePackageUri) {
          issues.push({
            kind: "ros-package-resolver-missing",
            uri: documentUri,
            packageName,
            range: include.rosPackageAttr.range,
            message: `include uses ros_pkg=\`${packageName}\` but ProjectHost.resolvePackageUri is not available`,
          });
          continue;
        }
        const packageRootUri = await host.resolvePackageUri(packageName);
        if (!packageRootUri) {
          issues.push({
            kind: "ros-package-not-found",
            uri: documentUri,
            packageName,
            path: expanded,
            range: include.rosPackageAttr.range,
            message: `ROS package \`${packageName}\` could not be resolved for include path \`${expanded}\``,
          });
          continue;
        }
        targetUri = joinUri(packageRootUri, expanded);
      } else {
        const baseUri = include.base === "project-root" ? project.rootUri : dirnameUri(absoluteUri);
        targetUri = joinUri(baseUri, expanded);
      }
      const targetRel = projectRelative(project.rootUri, targetUri);

      let realUri = targetUri;
      try {
        if (await host.exists(targetUri)) {
          realUri = host.realpath ? await host.realpath(targetUri) : targetUri;
        }
      } catch {}

      const isOutside = !isWithinUri(project.rootUri, realUri);
      if (isOutside) {
        if (!allowOutside) {
          issues.push({
            kind: "outside-root",
            uri: documentUri,
            path: targetRel,
            range: include.pathAttr.range,
            message: "include target is outside the workspace",
          });
          continue;
        }
        issues.push({
          kind: "external-used",
          uri: documentUri,
          path: targetRel,
          range: include.pathAttr.range,
          message: `external include used \`${expanded}\``,
        });
      }
      graph.edges.push({
        from: normalized,
        to: targetRel,
        includeElementRange: include.element.range,
        includePathRange: include.pathAttr.range,
      });
      await visit(targetRel, [...stack, normalized], {
        uri: documentUri,
        range: include.pathAttr.range,
      });
    }
    visiting.delete(normalized);
    visited.add(normalized);
  };

  for (const entry of graph.entrypointFiles) await visit(entry, []);
  return {
    graph,
    reachableUris,
    reachableDocuments,
    issues,
  };
}
