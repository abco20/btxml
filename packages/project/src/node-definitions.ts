import { RuleCodes } from "@btxml/analyzer/rules";
import {
  DiagnosticSeverity,
  type SourcePosition,
  type SourceRange,
  createDiagnostic,
} from "@btxml/foundation";
import { type TreeNodeModelDef, normalizeConfigNodeModel } from "@btxml/model";
import { nodeDefinitionsFileSchema } from "@btxml/model/zod";
import {
  type Node as JsonNode,
  type ParseError,
  findNodeAtLocation,
  parse as parseJsonc,
  parseTree,
} from "jsonc-parser";
import { asInternalProject } from "./project-handle.js";
import type { LoadProjectNodeModelsInput, ProjectNodeModelsResult } from "./types.js";

function createPositionAt(text: string): (offset: number) => SourcePosition {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }

  return (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= offset) low = mid + 1;
      else high = mid - 1;
    }
    const line = Math.max(0, low - 1);
    return { line, character: offset - lineStarts[line], offset };
  };
}

function rangeForJsonNode(
  jsonNode: JsonNode | undefined,
  positionAt: (offset: number) => SourcePosition,
): SourceRange | undefined {
  if (!jsonNode) return undefined;
  return {
    start: positionAt(jsonNode.offset),
    end: positionAt(jsonNode.offset + jsonNode.length),
  };
}

export async function loadProjectNodeModels(
  input: LoadProjectNodeModelsInput,
): Promise<ProjectNodeModelsResult> {
  const project = asInternalProject(input.project);
  const host = input.host ?? project.host;
  const diagnostics: ProjectNodeModelsResult["diagnostics"] = [];
  const nodeModels: TreeNodeModelDef[] = [];
  const seen = new Set<string>();
  for (const file of project.definitionFiles) {
    if (!(await host.exists(file.uri))) {
      diagnostics.push(
        createDiagnostic(
          RuleCodes.NodeDefinitionFileNotFound,
          DiagnosticSeverity.Error,
          `node definition file not found \`${file.path}\``,
          undefined,
          "",
          {
            help: "check `models.definitions` and make sure the file exists",
          },
        ),
      );
      continue;
    }
    let parsed: unknown;
    const text = await host.readFile(file.uri);
    const parseErrors: ParseError[] = [];
    const jsonTree = parseTree(text, parseErrors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    try {
      parsed = parseJsonc(text, parseErrors, {
        allowTrailingComma: true,
        disallowComments: false,
      });
      if (parseErrors.length > 0 || !jsonTree) {
        throw new Error(`JSON parse error at offset ${parseErrors[0]?.offset ?? 0}`);
      }
    } catch (error) {
      const errorMessage = String((error as Error).message || error);
      diagnostics.push(
        createDiagnostic(
          RuleCodes.InvalidNodeDefinitionJson,
          DiagnosticSeverity.Error,
          `invalid node definition JSON \`${file.path}\``,
          undefined,
          "",
          {
            primaryLabel: "the file could not be parsed as JSON",
            help: `fix the JSON syntax in \`${file.path}\``,
            notes: [errorMessage],
          },
        ),
      );
      continue;
    }

    const result = nodeDefinitionsFileSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const subIssues =
          issue.code === "unrecognized_keys"
            ? issue.keys.map((key) => ({
                label: `Unrecognized key: "${key}"`,
                path: [...issue.path, key].join("."),
              }))
            : [{ label: issue.message, path: issue.path.join(".") }];

        for (const { label, path: dotPath } of subIssues) {
          diagnostics.push(
            createDiagnostic(
              RuleCodes.InvalidNodeDefinitionSchema,
              DiagnosticSeverity.Error,
              `invalid node definition schema \`${file.path}\``,
              undefined,
              "",
              {
                primaryLabel: label,
                help: dotPath
                  ? `fix the schema issue at \`${dotPath}\``
                  : "fix the schema issue in the file",
                notes: dotPath ? [dotPath] : [],
              },
            ),
          );
        }
      }
      continue;
    }

    for (const [id, node] of Object.entries(result.data.nodes)) {
      if (seen.has(id)) {
        diagnostics.push(
          createDiagnostic(
            RuleCodes.DuplicateNodeDefinitionId,
            DiagnosticSeverity.Error,
            `duplicate node definition ID \`${id}\``,
            undefined,
            "",
            {
              primaryLabel: "this ID was already loaded from another node definition file",
              help: "remove one definition or rename one of the duplicate IDs",
            },
          ),
        );
      }
      seen.add(id);
      const positionAt = createPositionAt(text);
      const nodeRange = rangeForJsonNode(findNodeAtLocation(jsonTree, ["nodes", id]), positionAt);
      const model = normalizeConfigNodeModel(id, node);
      const ports = model.ports.map((port) => {
        const portRange = rangeForJsonNode(
          findNodeAtLocation(jsonTree, ["nodes", id, "ports", port.name]),
          positionAt,
        );
        return {
          ...port,
          source: "node-definition-file" as const,
          uri: file.path,
          range: portRange,
          nameRange: portRange,
        };
      });
      nodeModels.push({
        ...model,
        ports,
        source: "node-definition-file",
        sourceMeta: { sourceKind: "node-definition-file", file: file.path, range: nodeRange },
        editable: true,
        uri: file.path,
        range: nodeRange,
        elementRange: nodeRange,
      });
    }
  }
  return {
    ok: diagnostics.every((diag) => diag.severity !== DiagnosticSeverity.Error),
    nodeModels,
    diagnostics,
  };
}
