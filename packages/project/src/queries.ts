import type { TreeNodeModelDef } from "@btxml/model";
import type { SemanticIndex } from "@btxml/semantic";
import type { BtDocument } from "@btxml/syntax";
import type { IncludeIssue } from "./analyzer-facts.js";
import type { ProjectIndex } from "./internal-types.js";
import type {
  ProjectIncludeGraphEdgeView,
  ProjectIncludeGraphNodeView,
  ProjectIncludeGraphView,
  ProjectIncludeIssueView,
} from "./types.js";

export function getProjectDocuments(index: ProjectIndex): BtDocument[] {
  return [...index.files.values()];
}

export function getProjectDocument(index: ProjectIndex, uri: string): BtDocument | undefined {
  return index.files.get(uri);
}

export function getReachableProjectDocuments(index: ProjectIndex): BtDocument[] {
  return [...index.reachableDocuments.values()];
}

export function getProjectReachableDocuments(index: ProjectIndex): BtDocument[] {
  return getReachableProjectDocuments(index);
}

export function getProjectSemanticIndex(index: ProjectIndex): SemanticIndex {
  return index.workspace;
}

export function getProjectNodeDefinitionModels(index: ProjectIndex): TreeNodeModelDef[] {
  return [...index.nodeDefinitionModels];
}

export function getProjectIncludeIssues(index: ProjectIndex, uri: string): IncludeIssue[] {
  return index.facts.includeIssuesByUri.get(uri) ?? [];
}

export function getProjectIncludeGraph(index: ProjectIndex): ProjectIncludeGraphView | undefined {
  if (!index.includeGraph) return undefined;

  const uriByProjectPath = new Map<string, string>();
  for (const document of index.files.values()) {
    if (!document.path) continue;
    uriByProjectPath.set(document.path, document.uri);
  }

  const nodes: ProjectIncludeGraphNodeView[] = [];
  for (const [path, node] of index.includeGraph.nodes.entries()) {
    const uri = node.document?.uri ?? uriByProjectPath.get(path) ?? path;
    nodes.push({
      path,
      uri,
      exists: node.exists,
    });
  }

  const edges: ProjectIncludeGraphEdgeView[] = index.includeGraph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    includeElementRange: edge.includeElementRange,
    includePathRange: edge.includePathRange,
  }));

  const issues: ProjectIncludeIssueView[] = [];
  for (const issueList of index.facts.includeIssuesByUri.values()) {
    for (const issue of issueList) {
      issues.push({
        kind: issue.kind,
        uri: issue.uri,
        path: "path" in issue ? issue.path : undefined,
        message: issue.message,
        range: issue.range,
      });
    }
  }

  const sortedNodes = [...nodes];
  sortedNodes.sort((a, b) => a.path.localeCompare(b.path));

  return {
    nodes: sortedNodes,
    edges,
    issues,
  };
}

export function getProjectNodeModelSources(index: ProjectIndex, id: string) {
  return index.nodeModelSources.get(id) ?? [];
}
