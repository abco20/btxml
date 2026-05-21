import { getDocumentDiagnostics } from "@btxml/analyzer";
import { getNodeUsagePolicyForRules } from "@btxml/analyzer/rules";
import { getEffectiveConfigForFile } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import { buildSemanticIndex } from "@btxml/semantic";
import { buildBtDocumentView } from "@btxml/semantic/ast-view";
import type { BtDocument } from "@btxml/syntax";
import { createIncludeIssueDiagnostics } from "../include-diagnostics.js";
import { asInternalProject } from "../project-handle.js";
import { relativeUri } from "../uri.js";
import type { CheckContext } from "./context.js";
import type { InternalFileCheckResult } from "./internal-types.js";

function projectRelative(rootUri: string, fileUri: string) {
  return relativeUri(rootUri, fileUri).replace(/\\/g, "/");
}

function looksLikeProjectRelativePath(value: string) {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.startsWith("../") &&
    !/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(value) &&
    !/^[A-Za-z]:\//.test(value)
  );
}

function getDocumentProjectPath(rootUri: string, document: BtDocument) {
  for (const candidate of [document.path, document.uri]) {
    if (!candidate) continue;
    const relativePath = projectRelative(rootUri, candidate);
    if (looksLikeProjectRelativePath(relativePath)) return relativePath;
  }
  return projectRelative(rootUri, document.uri);
}

export function checkFiles(ctx: CheckContext): InternalFileCheckResult[] {
  const {
    project,
    indexResult,
    externalModelDocuments,
    fileDocuments,
    lintEnabled,
    resolvedConfig,
  } = ctx;
  const internalProject = asInternalProject(project);
  const resolutionMode = indexResult.index.mode;

  return fileDocuments.map((document) => {
    const rel = getDocumentProjectPath(internalProject.rootUri, document);
    if (
      resolutionMode === "entrypoints" &&
      indexResult.index.includeGraph &&
      document.kind === "bt-document" &&
      !indexResult.index.reachableDocuments.has(document.uri)
    ) {
      return {
        path: rel,
        uri: document.uri,
        kind: document.kind,
        diagnostics: [],
        skipped: true,
        skipReason: "unreachable",
        originalText: document.originalText,
      };
    }

    const diagnosticWorkspace =
      resolutionMode === "single-file"
        ? buildSemanticIndex([document, ...externalModelDocuments], {
            config: resolvedConfig,
            models: ctx.nodeDefinitionModels,
            augmentations: ctx.augmentations,
          }).index
        : indexResult.index.workspace;
    const documentView =
      resolutionMode === "single-file"
        ? (() => {
            const effectiveConfig = getEffectiveConfigForFile(resolvedConfig, rel);
            return buildBtDocumentView(document, {
              semantic: diagnosticWorkspace,
              config: effectiveConfig,
              policy: getNodeUsagePolicyForRules(effectiveConfig),
            });
          })()
        : indexResult.index.documentViews.get(document.uri);

    let diagnostics: Diagnostic[] = [];
    if (lintEnabled) {
      const effectiveConfig = getEffectiveConfigForFile(resolvedConfig, rel);
      diagnostics = getDocumentDiagnostics(document, diagnosticWorkspace, {
        config: effectiveConfig,
        documentView,
      });

      const includeIssues = indexResult.index.facts.includeIssuesByUri.get(document.uri) ?? [];
      diagnostics.push(
        ...createIncludeIssueDiagnostics({ issues: includeIssues, config: effectiveConfig }),
      );
    }

    if (ctx.input.mode === "check" && document.kind === "generic-xml") {
      return {
        path: rel,
        uri: document.uri,
        kind: document.kind,
        documentView,
        diagnostics: [],
        rawDiagnostics: diagnostics,
        skipped: true,
        skipReason: "generic-xml",
        originalText: document.originalText,
      };
    }

    return {
      path: rel,
      uri: document.uri,
      kind: document.kind,
      documentView,
      diagnostics,
      rawDiagnostics: undefined,
      skipped: false,
      originalText: document.originalText,
    };
  });
}
