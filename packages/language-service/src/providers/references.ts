import {
  getAllBehaviorTreeDefinitions,
  getAllNodeModelDefinitions,
  getSubTreeReferences,
  resolveNodeUsage,
} from "@btxml/semantic";
import { inspectXmlCursor } from "@btxml/syntax";
import type { LanguageRequestContext } from "../context.js";
import type { InternalReferencesInput } from "../internal-types.js";
import type { Location, ReferencesResult } from "../public-types.js";
import { getDefinitionLocations } from "./definition.js";
import { getScriptIdentifierTarget, getScriptReferencesForSymbol } from "./script-context.js";

function toReferenceLocations(context: LanguageRequestContext, id: string): Location[] {
  return getSubTreeReferences(context.semantic, id)
    .filter((ref) => ref.parentBehaviorTreeId && ref.idRange)
    .map((ref) => ({ uri: ref.uri, range: ref.idRange }))
    .filter((location): location is Location => Boolean(location.range));
}

function uniqueLocations(locations: readonly Location[]): Location[] {
  const seen = new Set<string>();
  const result: Location[] = [];

  for (const location of locations) {
    const key = `${location.uri}:${location.range.start.offset}:${location.range.end.offset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(location);
  }

  return result;
}

function getReferencedSubTreeIds(
  context: LanguageRequestContext,
  definitions: readonly Location[],
): string[] {
  const ids = new Set<string>();

  for (const target of definitions) {
    const behaviorTree = getAllBehaviorTreeDefinitions(context.semantic).find((definition) =>
      sameLocation(target, { uri: definition.uri, range: definition.idRange }),
    );
    if (behaviorTree) {
      ids.add(behaviorTree.id);
    }

    const subtreeModel = getAllNodeModelDefinitions(context.semantic).find(
      (definition) =>
        definition.kind === "SubTree" &&
        (sameLocation(target, { uri: definition.uri, range: definition.idRange }) ||
          sameLocation(target, { uri: definition.uri, range: definition.range })),
    );
    if (subtreeModel) {
      ids.add(subtreeModel.id);
    }
  }

  return [...ids];
}

function sameLocation(target: Location, candidate: { uri?: string; range?: Location["range"] }) {
  return (
    candidate.uri === target.uri &&
    candidate.range?.start.offset === target.range.start.offset &&
    candidate.range?.end.offset === target.range.end.offset
  );
}

export function getReferences(
  context: LanguageRequestContext,
  input: InternalReferencesInput,
): ReferencesResult {
  const scriptTarget = getScriptIdentifierTarget(context, input.position);
  if (scriptTarget) {
    return {
      locations: uniqueLocations(
        getScriptReferencesForSymbol(context, scriptTarget).map((occurrence) => ({
          uri: context.document.uri,
          range: occurrence.documentRange,
        })),
      ),
    };
  }

  const inspect = context.parsed
    ? inspectXmlCursor({
        document: input.document,
        parsed: context.parsed,
        position: input.position,
      })
    : undefined;
  const element = inspect && "element" in inspect ? inspect.element : undefined;
  const attribute = inspect && "attribute" in inspect ? inspect.attribute : undefined;

  if (element?.name === "BehaviorTree" && attribute?.name === "ID") {
    return {
      locations: toReferenceLocations(context, attribute.value),
    };
  }

  if (element && attribute?.name === "ID") {
    const usage = resolveNodeUsage(context.semantic, {
      element,
      documentRoot: context.parsed?.root,
      uri: input.document.uri,
      config: context.config,
      policy: context.nodeUsagePolicy,
    });

    if (usage.tagForm === "model-definition" && element.name === "SubTree") {
      return {
        locations: toReferenceLocations(context, attribute.value),
      };
    }
  }

  const defs = getDefinitionLocations(
    context.parsed,
    context.documentView,
    input.position,
    context.semantic,
    context.config,
    context.nodeUsagePolicy,
    context.workspace?.documents,
  );
  if (defs.length === 0) return { locations: [] };

  const ids = getReferencedSubTreeIds(context, defs);
  if (ids.length > 0) {
    return {
      locations: uniqueLocations(ids.flatMap((id) => toReferenceLocations(context, id))),
    };
  }

  return { locations: [] };
}
