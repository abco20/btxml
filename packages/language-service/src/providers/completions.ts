import { RULE_CODES } from "@btxml/analyzer/rules";
import type { SourceRange } from "@btxml/foundation";
import {
  type GenericNodeKind,
  type NodeUsageResolution,
  type SemanticIndex,
  getAllNodeModels,
  getBehaviorTreeIds,
  getBehaviorTrees,
  getGenericNodeKindFromTag,
  resolveNodeUsage,
  resolvePortUsage,
} from "@btxml/semantic";
import {
  type BtXmlAttribute,
  type BtXmlElement,
  type XmlCursorContext,
  inspectXmlCursor,
} from "@btxml/syntax";
import { completion, replaceRange, uniqueItems } from "../completions.js";
import type { LanguageRequestContext } from "../context.js";
import type { InternalCompletionInput } from "../internal-types.js";
import type { CompletionItem, CompletionResult } from "../public-types.js";
import { createBlackboardCompletionItem } from "./blackboard-completions.js";
import { collectBlackboardSymbols, isCompatibleType, normalizeType } from "./blackboard-symbols.js";
import { getAttributeScriptCompletions } from "./script-completions.js";

const BLACKBOARD_SORT_TEXT = {
  enumLiteral: "0",
  boolLiteral: "1",
  matchingKey: "2",
  unknownKey: "3",
} as const;

function getAttr(element: BtXmlElement | undefined, name: string) {
  return element?.attributes.find((attr) => attr.name === name);
}

function hasQuotedAttributeValue(attribute: BtXmlAttribute | undefined) {
  return Boolean(
    attribute?.valueContentRange &&
      attribute.valueRange &&
      (attribute.valueContentRange.start.offset !== attribute.valueRange.start.offset ||
        attribute.valueContentRange.end.offset !== attribute.valueRange.end.offset),
  );
}

function replaceAttributeValue(attribute: BtXmlAttribute | undefined, value: string) {
  if (!attribute) return undefined;
  const replacementRange = hasQuotedAttributeValue(attribute)
    ? attribute.valueContentRange
    : attribute.valueRange;
  if (!replacementRange) return undefined;
  return replaceRange(replacementRange, hasQuotedAttributeValue(attribute) ? value : `"${value}"`);
}

function behaviorTreeItems(
  semantic: SemanticIndex,
  currentUri: string,
  range?: SourceRange,
  attribute?: BtXmlAttribute,
) {
  const local: CompletionItem[] = [];
  const external: CompletionItem[] = [];
  for (const id of getBehaviorTreeIds(semantic)) {
    const defs = getBehaviorTrees(semantic, id);
    const item = completion(
      id,
      "Value",
      "BehaviorTree ID",
      attribute ? replaceAttributeValue(attribute, id) : replaceRange(range, id),
    );
    if (defs.some((def) => def.uri === currentUri)) local.push({ ...item, sortText: `0-${id}` });
    else external.push({ ...item, sortText: `1-${id}` });
  }
  return [...local, ...external];
}

function subtreeTagItem(range?: SourceRange) {
  return completion("SubTree", "Class", "Built-in subtree tag", replaceRange(range, "SubTree"), {
    sortText: "0-SubTree",
  });
}

function closingTagItems(inspect: XmlCursorContext) {
  if (inspect.kind !== "closing-tag-name") return [];
  const nearest = inspect.tagText;
  if (!nearest) return [];
  const prefix = inspect.tagNamePrefix || "";
  if (!nearest.toLowerCase().startsWith(prefix.toLowerCase())) return [];
  return [
    completion(
      `${nearest}>`,
      "Value",
      "Close current parent tag",
      replaceRange(inspect.replacementRange, `${nearest}>`),
    ),
  ];
}

function elementNameItems(semantic: SemanticIndex, range?: SourceRange) {
  const items: CompletionItem[] = [
    ...["BehaviorTree", "TreeNodesModel", "include"].map((name) =>
      completion(name, "Class", undefined, replaceRange(range, name)),
    ),
    ...["Action", "Condition", "Control", "Decorator"].map((name) =>
      completion(name, "Class", undefined, replaceRange(range, name)),
    ),
    subtreeTagItem(range),
  ];

  const seenModels = new Set<string>();
  for (const model of getAllNodeModels(semantic)) {
    if (model.id === "SubTree") continue;
    if (seenModels.has(model.id)) continue;
    seenModels.add(model.id);
    items.push(completion(model.id, "Class", undefined, replaceRange(range, model.id)));
  }
  return uniqueItems(items);
}

function resolveElementUsage(
  context: LanguageRequestContext,
  input: InternalCompletionInput,
  element: BtXmlElement,
): NodeUsageResolution {
  return resolveNodeUsage(context.semantic, {
    element,
    documentRoot: context.parsed?.root,
    uri: input.document.uri,
    config: context.config,
    policy: context.nodeUsagePolicy,
  });
}

function attributeNameItemsFromUsage(
  usage: NodeUsageResolution,
  range?: SourceRange,
): CompletionItem[] {
  const existing = new Set(usage.element.attributes.map((attribute) => attribute.name));

  return usage.ports
    .filter((port) => !existing.has(port.name))
    .map((port) =>
      completion(
        port.name,
        "Property",
        `${port.direction}${port.type ? ` ${port.type}` : ""}`,
        replaceRange(range, port.name),
      ),
    );
}

function subtreeAttributeNameItems(
  element: BtXmlElement,
  usage: NodeUsageResolution,
  range?: SourceRange,
) {
  const items = [completion("ID", "Property", undefined, replaceRange(range, "ID"))];
  items.push(...attributeNameItemsFromUsage(usage, range));

  return items.filter((item) => !element.attributes.some((attr) => attr.name === item.label));
}

function attributeNameItems(
  element: BtXmlElement | undefined,
  input: InternalCompletionInput,
  context: LanguageRequestContext,
  range?: SourceRange,
) {
  if (!element) return [];
  const genericKind = getGenericNodeKindFromTag(element.name);
  if (genericKind) {
    const items: CompletionItem[] = [];
    if (!element.attributes.some((attr) => attr.name === "ID")) {
      items.push(completion("ID", "Property", undefined, replaceRange(range, "ID")));
    }

    const usage = resolveElementUsage(context, input, element);
    items.push(...attributeNameItemsFromUsage(usage, range));

    return items;
  }
  if (element.name === "SubTree") {
    return subtreeAttributeNameItems(element, resolveElementUsage(context, input, element), range);
  }
  if (element.name === "include") {
    return [completion("path", "Property", undefined, replaceRange(range, "path"))];
  }
  return attributeNameItemsFromUsage(resolveElementUsage(context, input, element), range);
}

function subtreeIdValueItems(
  input: InternalCompletionInput,
  context: LanguageRequestContext,
  range?: SourceRange,
  attribute?: BtXmlAttribute,
) {
  return behaviorTreeItems(context.semantic, input.document.uri, range, attribute);
}

function genericNodeIdValueItems(
  semantic: SemanticIndex,
  kind: GenericNodeKind,
  range?: SourceRange,
  attribute?: BtXmlAttribute,
) {
  const items: CompletionItem[] = [];
  const seenModels = new Set<string>();

  for (const model of getAllNodeModels(semantic)) {
    if (model.kind !== kind) continue;
    if (seenModels.has(model.id)) continue;
    seenModels.add(model.id);
    items.push(
      completion(
        model.id,
        "Value",
        `${kind} node ID`,
        attribute ? replaceAttributeValue(attribute, model.id) : replaceRange(range, model.id),
      ),
    );
  }

  return items;
}

function attributeValueItems(
  input: InternalCompletionInput,
  inspect: XmlCursorContext,
  context: LanguageRequestContext,
) {
  if (inspect.kind !== "attribute-value") return [];
  const { attribute, element } = inspect;
  if (!attribute || !element) return [];
  const genericKind = getGenericNodeKindFromTag(element.name);
  if (genericKind && attribute.name === "ID") {
    return genericNodeIdValueItems(
      context.semantic,
      genericKind,
      attribute.valueContentRange || attribute.valueRange,
      attribute,
    );
  }
  if (element.name === "SubTree" && attribute.name === "ID") {
    return subtreeIdValueItems(
      input,
      context,
      attribute.valueContentRange || attribute.valueRange,
      attribute,
    );
  }
  if (element.name === "root" && attribute.name === "main_tree_to_execute") {
    return behaviorTreeItems(
      context.semantic,
      input.document.uri,
      attribute.valueContentRange || attribute.valueRange,
      attribute,
    );
  }
  if (element.name === "include" && attribute.name === "path") {
    const files = context.workspace
      ? context.workspace.documents
          .map((doc) => doc.path || doc.uri)
          .filter((file) => file.endsWith(".xml"))
      : [];
    return files.map((file) =>
      completion(
        file,
        "File",
        "XML file",
        replaceRange(attribute.valueContentRange || attribute.valueRange, file),
      ),
    );
  }
  const scriptItems = getAttributeScriptCompletions(context, input, element, attribute);
  if (scriptItems) return scriptItems;
  const usage = resolveElementUsage(context, input, element);
  if (genericKind && usage.model.status !== "resolved") {
    return [];
  }
  const portUsage = resolvePortUsage(context.semantic, {
    element,
    documentRoot: context.parsed?.root,
    attributeName: attribute.name,
    uri: input.document.uri,
    config: context.config,
    policy: context.nodeUsagePolicy,
  });
  if (portUsage?.status !== "resolved") return [];
  const port = portUsage.port;
  const replacementRange = attribute.valueContentRange || attribute.valueRange;
  const items: CompletionItem[] = [];
  if (port.enum?.length) {
    items.push(
      ...port.enum.map((value) =>
        completion(value, "Enum", port.type, replaceRange(replacementRange, value), {
          sortText: `${BLACKBOARD_SORT_TEXT.enumLiteral}-${value}`,
        }),
      ),
    );
  }
  if ((port.type || "").toLowerCase() === "bool") {
    items.push(
      ...["true", "false"].map((value) =>
        completion(value, "Value", "bool", replaceRange(replacementRange, value), {
          sortText: `${BLACKBOARD_SORT_TEXT.boolLiteral}-${value}`,
        }),
      ),
    );
  }

  const symbols = collectBlackboardSymbols(context);
  const normalizedCurrentType = normalizeType(port.type);
  const matchingSymbols = symbols.filter(
    (symbol) => !symbol.conflict && isCompatibleType(port.type, symbol.type),
  );
  const unknownTypeSymbols = symbols.filter(
    (symbol) => !symbol.conflict && !normalizeType(symbol.type) && normalizedCurrentType,
  );
  const matchingKeyItems = matchingSymbols.map((symbol) => ({
    ...createBlackboardCompletionItem({
      document: input.document,
      attribute,
      cursorOffset: input.position.offset,
      symbol,
      detail: `${symbol.type || "unknown"} blackboard key from ${symbol.nodeType}.${symbol.portName}`,
    }),
    sortText: `${BLACKBOARD_SORT_TEXT.matchingKey}-${symbol.key}`,
  }));
  const unknownKeyItems = unknownTypeSymbols.map((symbol) => ({
    ...createBlackboardCompletionItem({
      document: input.document,
      attribute,
      cursorOffset: input.position.offset,
      symbol,
      detail: `unknown-type blackboard key from ${symbol.nodeType}.${symbol.portName}`,
    }),
    sortText: `${BLACKBOARD_SORT_TEXT.unknownKey}-${symbol.key}`,
  }));

  items.push(...matchingKeyItems);
  items.push(...unknownKeyItems);

  if (items.length > 0) {
    return uniqueItems(items);
  }
  if ((inspect.valuePrefix || "").includes("{")) {
    return uniqueItems(items);
  }
  return items;
}

export function getCompletions(
  context: LanguageRequestContext,
  input: InternalCompletionInput,
): CompletionResult {
  const inspect = inspectXmlCursor({
    document: input.document,
    parsed: context.parsed,
    position: input.position,
  });
  if (inspect.kind === "comment") {
    return {
      items: RULE_CODES.map((code) => completion(code, "Reference", "Diagnostic rule code")),
    };
  }
  if (inspect.kind === "attribute-value") {
    return {
      items: uniqueItems(attributeValueItems(input, inspect, context)),
    };
  }
  if (inspect.kind === "attribute-name") {
    return {
      items: uniqueItems(
        attributeNameItems(inspect.element, input, context, inspect.attribute?.nameRange),
      ),
    };
  }
  if (inspect.kind === "tag-name") {
    return { items: uniqueItems(elementNameItems(context.semantic, inspect.element?.nameRange)) };
  }
  if (inspect.kind === "closing-tag-name") {
    return { items: uniqueItems(closingTagItems(inspect)) };
  }
  return { items: [] };
}
