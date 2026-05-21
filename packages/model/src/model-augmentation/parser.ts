import type { Diagnostic, SourcePosition, SourceRange } from "@btxml/foundation";
import {
  type Node as JsonNode,
  type ParseError,
  findNodeAtLocation,
  parse as parseJsonc,
  parseTree,
} from "jsonc-parser";
import type { ZodIssue } from "zod";
import { type ModelAugmentationFile, modelAugmentationFileSchema } from "./schema.js";

export type ParseModelAugmentationFileOptions = {
  readonly uri?: string;
  readonly path?: string;
};

export type ModelAugmentationParserIssue = {
  readonly kind: "json" | "schema";
  readonly message: string;
  readonly path?: string;
  readonly range?: SourceRange;
  readonly notes?: readonly string[];
};

export type ParseModelAugmentationFileResult =
  | {
      readonly ok: true;
      readonly data: ModelAugmentationFile;
      readonly issues: readonly [];
      readonly uri: string;
      readonly path?: string;
    }
  | {
      readonly ok: false;
      readonly data?: undefined;
      readonly issues: readonly ModelAugmentationParserIssue[];
      readonly uri: string;
      readonly path?: string;
    };

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

function normalizeJsonPath(path: readonly PropertyKey[]): (string | number)[] {
  return path.filter(
    (part): part is string | number => typeof part === "string" || typeof part === "number",
  );
}

function issuePathToLocationPath(issue: ZodIssue): (string | number)[] {
  if (issue.code === "unrecognized_keys") {
    const [firstKey] = issue.keys;
    if (typeof firstKey === "string" || typeof firstKey === "number") {
      return [...normalizeJsonPath(issue.path), firstKey];
    }
  }
  return normalizeJsonPath(issue.path);
}

function issueMessage(issue: ZodIssue): { message: string; path?: string } {
  if (issue.code === "unrecognized_keys") {
    const [firstKey] = issue.keys;
    return {
      message: `Unrecognized key: \"${firstKey ?? ""}\"`,
      path: [...issue.path, firstKey].filter((part) => part !== undefined).join("."),
    };
  }

  return {
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join(".") : undefined,
  };
}

export function parseModelAugmentationFile(
  text: string,
  options?: ParseModelAugmentationFileOptions,
): ParseModelAugmentationFileResult {
  const uri = options?.uri ?? "";
  const parseErrors: ParseError[] = [];
  const jsonTree = parseTree(text, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  try {
    const parsed = parseJsonc(text, parseErrors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    if (parseErrors.length > 0 || !jsonTree) {
      throw new Error(`JSON parse error at offset ${parseErrors[0]?.offset ?? 0}`);
    }

    const result = modelAugmentationFileSchema.safeParse(parsed);
    if (!result.success) {
      const positionAt = createPositionAt(text);
      return {
        ok: false,
        uri,
        path: options?.path,
        issues: result.error.issues.map((issue) => {
          const locationPath = issuePathToLocationPath(issue);
          const { message, path } = issueMessage(issue);
          return {
            kind: "schema" as const,
            message,
            path,
            range: rangeForJsonNode(findNodeAtLocation(jsonTree, locationPath), positionAt),
            notes: path ? [path] : undefined,
          };
        }),
      };
    }

    return {
      ok: true,
      data: {
        ...result.data,
        uri,
        path: options?.path,
      },
      issues: [],
      uri,
      path: options?.path,
    };
  } catch (error) {
    return {
      ok: false,
      uri,
      path: options?.path,
      issues: [
        {
          kind: "json",
          message: "the file could not be parsed as JSON",
          notes: [String((error as Error).message || error)],
        },
      ],
    };
  }
}

export function hasModelAugmentationParserErrors(
  issues: readonly ModelAugmentationParserIssue[] | readonly Diagnostic[],
): boolean {
  return issues.length > 0;
}
