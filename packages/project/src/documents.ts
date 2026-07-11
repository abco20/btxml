import { RuleCodes } from "@btxml/analyzer/rules";
import { type Diagnostic, DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import type { ModelAugmentationFile } from "@btxml/model";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import { parseBtXml } from "@btxml/syntax";
import type { ProjectHost } from "./host.js";
import type { ProjectFile } from "./internal-types.js";
import { loadProjectModelAugmentations } from "./model-augmentations.js";
import { asInternalProject } from "./project-handle.js";
import type { BtxmlProject } from "./types.js";

export function treeNodesModelOnly(document: BtDocument): BtDocument | undefined {
  const root = document.root;
  if (!root) return undefined;
  if (root.name === "TreeNodesModel") {
    return { ...document, kind: "model-document", isBtXml: true };
  }

  const model = root.children.find(
    (child): child is BtXmlElement => child.kind === "element" && child.name === "TreeNodesModel",
  );
  if (!model) return undefined;

  const nodes = document.nodes.flatMap((node) => {
    if (node === root) {
      return root.children.filter((child) => child === model || child.kind === "comment");
    }
    return node.kind === "comment" ? [node] : [];
  });

  return {
    ...document,
    kind: "model-document",
    root: model,
    nodes,
    isBtXml: true,
  };
}

export async function parseProjectFile(file: ProjectFile, host: ProjectHost) {
  return parseBtXml(await host.readFile(file.uri), {
    uri: file.uri,
    path: file.path,
  });
}

function isLikelyBtXmlDocument(text: string) {
  return (
    text.includes("BTCPP_format") ||
    text.includes("<BehaviorTree") ||
    text.includes("<TreeNodesModel")
  );
}

export async function loadExternalTreeNodesModelFile(
  file: ProjectFile,
  host: ProjectHost,
): Promise<{
  document?: BtDocument;
  diagnostics: Diagnostic[];
}> {
  if (!(await host.exists(file.uri))) {
    return {
      diagnostics: [
        createDiagnostic(
          RuleCodes.ExternalModelFileNotFound,
          DiagnosticSeverity.Error,
          `external TreeNodesModel file not found \`${file.path}\``,
          undefined,
          file.path,
          {
            help: "check `models.files` and make sure the file exists",
          },
        ),
      ],
    };
  }

  const parsed = await parseProjectFile(file, host);
  if (
    !parsed.document ||
    parsed.diagnostics.some((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
  ) {
    const firstXmlError = parsed.diagnostics[0];
    return {
      diagnostics: [
        createDiagnostic(
          RuleCodes.ExternalModelXmlParseError,
          DiagnosticSeverity.Error,
          `failed to parse external TreeNodesModel file \`${file.path}\``,
          parsed.diagnostics[0]?.range,
          file.path,
          {
            primaryLabel: "the external model file is not valid XML",
            help: `fix the XML syntax in \`${file.path}\` before using it as an external model file`,
            notes: firstXmlError
              ? [`first XML error: ${firstXmlError.code} ${firstXmlError.message}`]
              : undefined,
          },
        ),
      ],
    };
  }

  const document = treeNodesModelOnly(parsed.document);
  if (!document) {
    return {
      diagnostics: [
        createDiagnostic(
          RuleCodes.MissingTreeNodesModel,
          DiagnosticSeverity.Error,
          "missing `<TreeNodesModel>` in external model file",
          parsed.document.root?.range,
          file.path,
          {
            primaryLabel: "this file does not contain a `<TreeNodesModel>` element",
            help: "add a `<TreeNodesModel>` element or remove the file from `models.files`",
          },
        ),
      ],
    };
  }

  return { document, diagnostics: [] };
}

export async function loadProjectDocuments(
  project: BtxmlProject,
  host?: ProjectHost,
): Promise<{
  documents: BtDocument[];
  externalModelDocuments: BtDocument[];
  augmentations: ModelAugmentationFile[];
  diagnostics: Diagnostic[];
}> {
  const internalProject = asInternalProject(project);
  const activeHost = host ?? internalProject.host;
  const documents: BtDocument[] = [];
  for (const file of internalProject.selectedFiles) {
    if (!(await activeHost.exists(file.uri))) continue;
    const text = await activeHost.readFile(file.uri);
    if (!isLikelyBtXmlDocument(text)) continue;
    const parsed = parseBtXml(text, {
      uri: file.uri,
      path: file.path,
    });
    if (parsed.document) {
      documents.push(parsed.document);
    }
  }

  const externalResults = await Promise.all(
    internalProject.modelFiles.map((file) => loadExternalTreeNodesModelFile(file, activeHost)),
  );
  const augmentationResults = await loadProjectModelAugmentations({ project, host: activeHost });
  const externalDiagnostics = externalResults.flatMap((r) => r.diagnostics);
  const externalModelDocuments = externalResults.flatMap((r) => (r.document ? [r.document] : []));

  return {
    documents,
    externalModelDocuments,
    augmentations: [...augmentationResults.augmentations],
    diagnostics: [...externalDiagnostics, ...augmentationResults.diagnostics],
  };
}
