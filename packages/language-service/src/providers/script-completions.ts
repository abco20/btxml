import {
  type ScriptAttributeInfo,
  type ScriptCompletionItem as ScriptCompletionCandidate,
  classifyScriptAttribute,
  getScriptCompletions,
} from "@btxml/script";
import type { BtXmlAttribute, BtXmlElement } from "@btxml/syntax";
import { completion } from "../completions.js";
import type { LanguageRequestContext } from "../context.js";
import type { InternalCompletionInput } from "../internal-types.js";
import {
  buildScriptEnvironmentForAttribute,
  mapDecodedRangeToReplacementRange,
  mapRawAttributeOffsetToDecodedOffset,
} from "./script-context.js";

function resolveScriptAttributeInfo(
  context: LanguageRequestContext,
  element: BtXmlElement,
  attribute: BtXmlAttribute,
): ScriptAttributeInfo | undefined {
  const usage = context.documentView?.nodes.find((node) => node.element === element)?.usage;
  const resolvedNodeType =
    usage?.model.status === "resolved" ? usage.model.model.id : usage?.nodeType;

  return classifyScriptAttribute({
    elementName: element.name,
    attributeName: attribute.name,
    resolvedNodeType,
  });
}

export function getAttributeScriptCompletions(
  context: LanguageRequestContext,
  input: InternalCompletionInput,
  element: BtXmlElement,
  attribute: BtXmlAttribute,
) {
  const info = resolveScriptAttributeInfo(context, element, attribute);
  if (!info) return undefined;

  const anchor = attribute.valueContentRange ?? attribute.valueRange;
  const environment = buildScriptEnvironmentForAttribute(context, element, attribute);
  const rawCursorOffset = Math.max(0, input.position.offset - anchor.start.offset);
  const items = getScriptCompletions({
    source: attribute.value,
    cursorOffset: mapRawAttributeOffsetToDecodedOffset(attribute, rawCursorOffset),
    environment,
    attributeName: attribute.name,
    attributeInfo: info,
  });

  return items.map((item) => toLanguageServiceCompletion(context, attribute, item));
}

function toLanguageServiceCompletion(
  context: LanguageRequestContext,
  attribute: BtXmlAttribute,
  item: ScriptCompletionCandidate,
) {
  return completion(
    item.label,
    scriptCompletionKind(item.kind),
    item.detail,
    {
      range: mapDecodedRangeToReplacementRange(context, attribute, item.replaceRange),
      newText: item.insertText ?? item.label,
    },
    {
      insertText: item.insertText ?? item.label,
      insertTextFormat: item.insertTextFormat,
      filterText: item.filterText,
      sortText: item.sortText,
    },
  );
}

function scriptCompletionKind(kind: ScriptCompletionCandidate["kind"]) {
  switch (kind) {
    case "identifier":
      return "Variable" as const;
    case "enum":
      return "Enum" as const;
    case "value":
      return "Value" as const;
    case "operator":
      return "Keyword" as const;
    case "snippet":
      return "Snippet" as const;
  }
}
