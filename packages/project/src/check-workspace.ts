import { validateBtXml } from "@btxml/analyzer";
import { DiagnosticSeverity } from "@btxml/foundation";
import { buildSemanticIndex, hasDocumentModel } from "@btxml/semantic";
import { parseBtXml } from "@btxml/syntax";
import type { WorkspaceCheckInput, WorkspaceCheckResult } from "./types.js";

function shouldSkipSemantic(
  document: NonNullable<ReturnType<typeof parseBtXml>["document"]>,
  _input: WorkspaceCheckInput,
) {
  return !document.isBtXml;
}

export async function checkBtWorkspace(input: WorkspaceCheckInput): Promise<WorkspaceCheckResult> {
  const parsed = input.inputs.map((workspaceInput) => {
    const result = parseBtXml(workspaceInput.text, {
      uri: workspaceInput.uri,
      path: workspaceInput.path,
      kind: workspaceInput.kind,
    });
    return { input: workspaceInput, result };
  });

  const documents = parsed.flatMap(({ result }) =>
    result.document && !shouldSkipSemantic(result.document, input) ? [result.document] : [],
  );
  const workspaceResult = buildSemanticIndex(documents, {
    config: input.config,
  });
  const files = parsed.map(({ input: workspaceInput, result }) => {
    const document = result.document;
    if (!result.ok) {
      return {
        uri: workspaceInput.uri,
        path: workspaceInput.path,
        diagnostics: result.diagnostics,
        skipped: false,
        formatted: false,
      };
    }

    if (document && shouldSkipSemantic(document, input)) {
      return {
        uri: workspaceInput.uri,
        path: workspaceInput.path,
        diagnostics: [],
        skipped: true,
        skipReason: "not detected as BT XML",
        formatted: false,
      };
    }

    const diagnostics =
      document && hasDocumentModel(workspaceResult.index, document.uri)
        ? validateBtXml(workspaceInput.text, {
            config: input.config,
            uri: workspaceInput.uri,
            path: workspaceInput.path,
          }).diagnostics
        : result.diagnostics;

    return {
      uri: workspaceInput.uri,
      path: workspaceInput.path,
      diagnostics,
      skipped: false,
      formatted: false,
    };
  });

  const summary = {
    files: files.length,
    errors:
      workspaceResult.diagnostics.filter(
        (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
      ).length +
      files
        .flatMap((file) => file.diagnostics)
        .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error).length,
    warnings:
      workspaceResult.diagnostics.filter(
        (diagnostic) => diagnostic.severity === DiagnosticSeverity.Warning,
      ).length +
      files
        .flatMap((file) => file.diagnostics)
        .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Warning).length,
    infos:
      workspaceResult.diagnostics.filter(
        (diagnostic) => diagnostic.severity === DiagnosticSeverity.Info,
      ).length +
      files
        .flatMap((file) => file.diagnostics)
        .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Info).length,
  };

  return {
    ok: summary.errors === 0,
    files,
    projectDiagnostics: workspaceResult.diagnostics,
    summary,
  };
}
