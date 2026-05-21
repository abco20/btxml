import { RuleCodes } from "@btxml/analyzer/rules";
import { DiagnosticSeverity, type SourceRange, createDiagnostic } from "@btxml/foundation";
import {
  type ModelAugmentationFile,
  type ParseModelAugmentationFileResult,
  parseModelAugmentationFile,
} from "@btxml/model";
import type { ProjectHost } from "./host.js";
import { asInternalProject } from "./project-handle.js";
import type {
  LoadProjectModelAugmentationsInput,
  ProjectModelAugmentationsResult,
} from "./types.js";

const AUGMENTATION_RULE_CODES = {
  InvalidJson: RuleCodes.InvalidAugmentationJson,
  InvalidSchema: RuleCodes.InvalidAugmentationSchema,
} as const;

function createAugmentationDiagnostic(input: {
  filePath: string;
  code: string;
  message: string;
  range?: SourceRange;
  primaryLabel?: string;
  help: string;
  notes?: readonly string[];
}) {
  return createDiagnostic(
    input.code,
    DiagnosticSeverity.Error,
    input.message,
    input.range,
    input.filePath,
    {
      primaryLabel: input.primaryLabel,
      help: input.help,
      notes: input.notes ? [...input.notes] : undefined,
    },
  );
}

function diagnosticsFromParseResult(
  filePath: string,
  result: Extract<ParseModelAugmentationFileResult, { ok: false }>,
) {
  return result.issues.map((issue) =>
    createAugmentationDiagnostic({
      filePath,
      code:
        issue.kind === "json"
          ? AUGMENTATION_RULE_CODES.InvalidJson
          : AUGMENTATION_RULE_CODES.InvalidSchema,
      message:
        issue.kind === "json"
          ? `invalid augmentation JSON \`${filePath}\``
          : `invalid augmentation schema \`${filePath}\``,
      range: issue.range,
      primaryLabel: issue.message,
      help:
        issue.kind === "json"
          ? `fix the JSON syntax in \`${filePath}\``
          : issue.path
            ? `fix the schema issue at \`${issue.path}\``
            : "fix the schema issue in the file",
      notes: issue.notes,
    }),
  );
}

export async function loadProjectModelAugmentations(
  input: LoadProjectModelAugmentationsInput,
): Promise<ProjectModelAugmentationsResult> {
  const project = asInternalProject(input.project);
  const host = input.host ?? project.host;
  const diagnostics: ProjectModelAugmentationsResult["diagnostics"] = [];
  const augmentations: ModelAugmentationFile[] = [];

  for (const file of project.augmentationFiles) {
    if (!(await host.exists(file.uri))) {
      diagnostics.push(
        createDiagnostic(
          RuleCodes.AugmentationFileNotFound,
          DiagnosticSeverity.Error,
          `model augmentation file not found \`${file.path}\``,
          undefined,
          file.path,
          {
            help: "check `models.augmentations` and make sure the file exists",
          },
        ),
      );
      continue;
    }

    const text = await host.readFile(file.uri);
    const parsed = parseModelAugmentationFile(text, {
      uri: file.uri,
      path: file.path,
    });

    if (!parsed.ok) {
      diagnostics.push(...diagnosticsFromParseResult(file.path, parsed));
      continue;
    }

    augmentations.push(parsed.data);
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== DiagnosticSeverity.Error),
    augmentations,
    diagnostics,
  };
}

export { AUGMENTATION_RULE_CODES };
