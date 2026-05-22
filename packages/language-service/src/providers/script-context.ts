import type { SourcePosition, SourceRange } from "@btxml/foundation";
import { parsePortBlackboardReference } from "@btxml/model";
import {
  type ScriptEnvironment,
  type ScriptEnvironmentSymbolInput,
  type ScriptFlowEntry,
  type ScriptFlowEntryResult,
  type ScriptIdentifierAccess,
  type ScriptSymbol,
  type ScriptType,
  analyzeScriptFlow,
  classifyScriptAttribute,
  createScriptEnvironment,
  getScriptCursorContext,
  scriptTypeFromTypeName,
} from "@btxml/script";
import {
  areTypesCompatible,
  getModelAugmentations,
  getNodeModel,
  getTypeDefinition,
  getTypeRegistry,
} from "@btxml/semantic";
import type { BehaviorTreeView, PortBindingView, TreeNodeView } from "@btxml/semantic/ast-view";
import {
  type BtXmlAttribute,
  type BtXmlElement,
  inspectXmlCursor,
  mapDecodedAttributeOffsetToRawOffset,
  mapDecodedAttributeRangeToDocumentRange,
} from "@btxml/syntax";
import type { LanguageRequestContext } from "../context.js";

export type ScriptAttributeContext = {
  id: string;
  node: TreeNodeView;
  element: BtXmlElement;
  attribute: BtXmlAttribute;
  source: string;
  behaviorTree: BehaviorTreeView;
};

export type ScriptSymbolReference =
  | { kind: "symbol"; symbol: ScriptSymbol }
  | { kind: "global-blackboard"; key: string; symbol?: ScriptSymbol; origin?: "script" | "port-remap" }
  | { kind: "enum"; name: string; value: number };

export type ScriptResolvedOccurrence = {
  attributeContext: ScriptAttributeContext;
  identifier: ScriptIdentifierAccess;
  reference: ScriptSymbolReference;
  documentRange: SourceRange;
};

export type ScriptAttributeFlowState = ScriptFlowEntryResult<string> & {
  context: ScriptAttributeContext;
};

export type ScriptIdentifierTarget = {
  attributeContext: ScriptAttributeContext;
  range: SourceRange;
  reference: ScriptSymbolReference;
  flowState: ScriptAttributeFlowState;
  occurrence?: ScriptResolvedOccurrence;
};

const flowCache = new WeakMap<
  LanguageRequestContext,
  WeakMap<BehaviorTreeView, ScriptAttributeFlowState[]>
>();

export function getScriptIdentifierTarget(
  context: LanguageRequestContext,
  position: SourcePosition,
): ScriptIdentifierTarget | undefined {
  const inspect = context.parsed
    ? inspectXmlCursor({
        document: context.document,
        parsed: context.parsed,
        position,
      })
    : undefined;

  if (!inspect || inspect.kind !== "attribute-value") return undefined;
  const scriptContext = getScriptAttributeContext(context, inspect.element, inspect.attribute);
  if (!scriptContext) return undefined;

  const anchor = scriptContext.attribute.valueContentRange ?? scriptContext.attribute.valueRange;
  const rawAttributeOffset = position.offset - anchor.start.offset;
  const attributeOffset = mapRawAttributeOffsetToDecodedOffset(
    scriptContext.attribute,
    rawAttributeOffset,
  );
  const cursor = getScriptCursorContext({
    source: scriptContext.source,
    cursorOffset: attributeOffset,
  });
  if (cursor.kind !== "identifier") return undefined;
  if (attributeOffset < cursor.range.start || attributeOffset > cursor.range.end) return undefined;

  const flowState = getScriptFlowState(context, scriptContext);
  const resolved = flowState.analysis?.resolvedIdentifiers.find(
    (entry) =>
      entry.access.range.start === cursor.range.start &&
      entry.access.range.end === cursor.range.end &&
      entry.resolution.kind !== "unknown",
  );
  if (!resolved || resolved.resolution.kind === "unknown") return undefined;

  const reference: ScriptSymbolReference =
    resolved.resolution.kind === "symbol"
      ? { kind: "symbol", symbol: resolved.resolution.symbol }
      : resolved.resolution.kind === "global-blackboard"
        ? { ...resolved.resolution, origin: "script" }
        : resolved.resolution;

  return {
    attributeContext: scriptContext,
    range: toDocumentRange(context, scriptContext, cursor.range),
    reference,
    flowState,
    occurrence: {
      attributeContext: scriptContext,
      identifier: resolved.access,
      reference,
      documentRange: toDocumentRange(context, scriptContext, resolved.access.range),
    },
  };
}

export function getScriptReferencesForSymbol(
  context: LanguageRequestContext,
  target: ScriptIdentifierTarget,
): ScriptResolvedOccurrence[] {
  const states = getBehaviorTreeScriptFlow(context, target.attributeContext.behaviorTree);

  const occurrences = states.flatMap((state) =>
    collectResolvedOccurrences(context, state).filter((occurrence) =>
      target.reference.kind === "enum"
        ? occurrence.reference.kind === "enum" &&
          occurrence.reference.name === target.reference.name
        : target.reference.kind === "global-blackboard"
          ? occurrence.reference.kind === "global-blackboard" &&
            occurrence.reference.key === target.reference.key
          : sameResolvedSymbol(target.reference.symbol, occurrence.reference),
    ),
  );

  if (target.reference.kind === "global-blackboard") {
    return uniqueScriptOccurrences([
      ...occurrences,
      ...collectGlobalBlackboardRemapOccurrences(
        target.attributeContext.behaviorTree,
        target.reference.key,
      ),
    ]);
  }

  return occurrences;
}

export function getBehaviorTreeScriptFlowStates(
  context: LanguageRequestContext,
  behaviorTree: BehaviorTreeView,
) {
  return getBehaviorTreeScriptFlow(context, behaviorTree);
}

export function buildScriptEnvironmentForAttribute(
  context: LanguageRequestContext,
  element: BtXmlElement,
  attribute: BtXmlAttribute,
): ScriptEnvironment | undefined {
  const scriptContext = getScriptAttributeContext(context, element, attribute);
  if (!scriptContext) return undefined;
  return getScriptFlowState(context, scriptContext).environmentBefore;
}

export function describeScriptSymbol(symbol: ScriptSymbol): string {
  const typeLabel = formatScriptType(symbol.type);

  switch (symbol.source.kind) {
    case "port-remap":
      return `${typeLabel} from ${symbol.source.nodeType ?? "node"}.${symbol.source.portName}`;
    case "global-blackboard-remap":
      return `${typeLabel} from global blackboard ${symbol.source.nodeType ?? "node"}.${symbol.source.portName}`;
    case "subtree-port":
      return `${typeLabel} from ${symbol.source.nodeType ?? "SubTree"}.${symbol.source.portName}`;
    case "script-assignment":
      return `${typeLabel} from earlier ${symbol.source.attributeName} declaration`;
    case "global-blackboard":
      return `${typeLabel} from global blackboard @${symbol.source.key}`;
    case "augmentation":
      return `${typeLabel} from augmentation`;
    case "enum":
      return `${typeLabel} enum`;
  }
}

export function formatScriptType(type: ScriptType): string {
  switch (type.kind) {
    case "custom":
      return type.name;
    default:
      return type.kind;
  }
}

function getScriptFlowState(
  context: LanguageRequestContext,
  scriptContext: ScriptAttributeContext,
): ScriptAttributeFlowState {
  const states = getBehaviorTreeScriptFlow(context, scriptContext.behaviorTree);
  const state = states.find((entry) => entry.id === scriptContext.id);
  if (!state) {
    throw new Error(`missing script flow state for ${scriptContext.id}`);
  }
  return state;
}

function getBehaviorTreeScriptFlow(
  context: LanguageRequestContext,
  behaviorTree: BehaviorTreeView,
): ScriptAttributeFlowState[] {
  let cache = flowCache.get(context);
  if (!cache) {
    cache = new WeakMap();
    flowCache.set(context, cache);
  }

  const cached = cache.get(behaviorTree);
  if (cached) return cached;

  const scriptAttributes = behaviorTree.nodes.flatMap((node) =>
    node.element.attributes.flatMap((attribute) => {
      const scriptContext = getScriptAttributeContext(context, node.element, attribute);
      return scriptContext ? [scriptContext] : [];
    }),
  );

  const flowEntries: ScriptFlowEntry<string>[] = scriptAttributes.map((entry) => ({
    id: entry.id,
    source: entry.source,
    attributeName: entry.attribute.name,
    originId: entry.id,
  }));

  const analyzed = analyzeScriptFlow({
    baseEnvironment: buildBaseScriptEnvironment(context, behaviorTree.nodes),
    entries: flowEntries,
  }).flatMap((state, index) => {
    const attributeContext = scriptAttributes[index];
    return attributeContext ? [{ ...state, context: attributeContext }] : [];
  });

  cache.set(behaviorTree, analyzed);
  return analyzed;
}

function getScriptAttributeContext(
  context: LanguageRequestContext,
  element: BtXmlElement,
  attribute: BtXmlAttribute,
): ScriptAttributeContext | undefined {
  const node = context.documentView?.nodes.find((candidate) => candidate.element === element);
  if (!node) return undefined;

  const resolvedNodeType =
    node.usage.model.status === "resolved" ? node.usage.model.model.id : node.usage.nodeType;
  const info = classifyScriptAttribute({
    elementName: element.name,
    attributeName: attribute.name,
    resolvedNodeType,
  });
  if (!info) return undefined;

  const attributeIndex = element.attributes.indexOf(attribute);
  return {
    id: `${node.path.join(".")}:${attribute.name}:${attributeIndex}`,
    node,
    element,
    attribute,
    source: attribute.value,
    behaviorTree: node.behaviorTree,
  };
}

function buildBaseScriptEnvironment(
  context: LanguageRequestContext,
  nodes: readonly TreeNodeView[],
): ScriptEnvironment {
  const registry = getTypeRegistry(context.semantic);
  const portSymbols: ScriptEnvironmentSymbolInput[] = [];
  const globalBlackboardSymbols: ScriptEnvironmentSymbolInput[] = [];
  const behaviorTreeId = nodes[0]?.behaviorTree.id;

  if (behaviorTreeId) {
    const subtreeModel = getNodeModel(context.semantic, behaviorTreeId);
    if (subtreeModel?.kind === "SubTree") {
      for (const port of subtreeModel.ports) {
        const resolvedTypeName = port.effectiveType ?? port.type;
        const resolvedDefinition = getTypeDefinition(context.semantic, resolvedTypeName);
        const compatibilityKey = resolvedDefinition?.canonical ?? resolvedTypeName;

        portSymbols.push({
          name: port.name,
          type: scriptTypeFromTypeName(registry, resolvedTypeName),
          source: {
            kind: "subtree-port",
            nodeType: behaviorTreeId,
            portName: port.name,
            direction: port.direction,
          },
          readable: true,
          writable: port.direction === "output" || port.direction === "inout",
          compatibilityKey,
        });
      }
    }
  }

  for (const node of nodes) {
    const nodeType =
      node.usage.model.status === "resolved" ? node.usage.model.model.id : node.usage.nodeType;
    for (const binding of node.portBindings) {
      if (binding.declaredPort.status !== "resolved") continue;
      const remappedKey = getRemappedKeyFromBinding(binding);
      if (!remappedKey) continue;

      const resolvedTypeName = binding.declaredPort.port.type;
      const resolvedDefinition = getTypeDefinition(context.semantic, resolvedTypeName);
      const compatibilityKey = resolvedDefinition?.canonical ?? resolvedTypeName;
      const direction = binding.declaredPort.port.direction;

      const symbolInput: ScriptEnvironmentSymbolInput =
        remappedKey.scope === "global"
          ? {
              name: remappedKey.key,
              type: scriptTypeFromTypeName(registry, resolvedTypeName),
              source: {
                kind: "global-blackboard-remap",
                nodeType,
                portName: binding.declaredPort.port.name,
                direction,
                key: remappedKey.key,
              },
              readable: direction === "input" || direction === "output" || direction === "inout",
              writable: direction === "output" || direction === "inout",
              compatibilityKey,
            }
          : {
              name: remappedKey.key,
              type: scriptTypeFromTypeName(registry, resolvedTypeName),
              source: {
                kind: "port-remap",
                nodeType,
                portName: binding.declaredPort.port.name,
                direction,
              },
              readable: direction === "input" || direction === "output" || direction === "inout",
              writable: direction === "output" || direction === "inout",
              compatibilityKey,
            };

      if (remappedKey.scope === "global") {
        globalBlackboardSymbols.push(symbolInput);
      } else {
        portSymbols.push(symbolInput);
      }
    }
  }

  return createScriptEnvironment({
    symbols: portSymbols,
    globalBlackboardSymbols,
    augmentations: getModelAugmentations(context.semantic),
    areTypesCompatible: (left, right) =>
      left && right ? areTypesCompatible(context.semantic, left, right) : true,
  });
}

function collectResolvedOccurrences(
  context: LanguageRequestContext,
  state: ScriptAttributeFlowState,
): ScriptResolvedOccurrence[] {
  if (!state.analysis) return [];

  return state.analysis.resolvedIdentifiers.flatMap((entry) => {
    if (entry.resolution.kind === "unknown") return [];
    const reference: ScriptSymbolReference =
      entry.resolution.kind === "symbol"
        ? { kind: "symbol", symbol: entry.resolution.symbol }
        : entry.resolution.kind === "global-blackboard"
          ? { ...entry.resolution, origin: "script" }
          : entry.resolution;
    return [
      {
        attributeContext: state.context,
        identifier: entry.access,
        reference,
        documentRange: toDocumentRange(context, state.context, entry.access.range),
      },
    ];
  });
}

function sameResolvedSymbol(symbol: ScriptSymbol, reference: ScriptSymbolReference) {
  if (reference.kind !== "symbol") return false;
  const candidate = reference.symbol;

  if (symbol.source.kind === "script-assignment" || candidate.source.kind === "script-assignment") {
    return (
      symbol.source.kind === "script-assignment" &&
      candidate.source.kind === "script-assignment" &&
      symbol.name === candidate.name &&
      symbol.source.originId === candidate.source.originId &&
      symbol.source.range.start === candidate.source.range.start &&
      symbol.source.range.end === candidate.source.range.end
    );
  }

  if (
    (symbol.source.kind === "port-remap" || symbol.source.kind === "subtree-port") &&
    symbol.source.kind === candidate.source.kind
  ) {
    return (
      symbol.name === candidate.name &&
      symbol.source.portName === candidate.source.portName &&
      symbol.source.nodeType === candidate.source.nodeType
    );
  }

  return symbol.name === candidate.name && symbol.source.kind === candidate.source.kind;
}

function uniqueScriptOccurrences(
  occurrences: readonly ScriptResolvedOccurrence[],
): ScriptResolvedOccurrence[] {
  const seen = new Set<string>();
  const result: ScriptResolvedOccurrence[] = [];

  for (const occurrence of occurrences) {
    const key = `${occurrence.documentRange.start.offset}:${occurrence.documentRange.end.offset}:${occurrence.reference.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(occurrence);
  }

  return result;
}

function collectGlobalBlackboardRemapOccurrences(
  behaviorTree: BehaviorTreeView,
  key: string,
): ScriptResolvedOccurrence[] {
  return behaviorTree.nodes.flatMap((node) =>
    node.portBindings.flatMap((binding) =>
      binding.blackboardReferences
        .filter((reference) => reference.scope === "global" && reference.key === key)
        .map((reference) => ({
          attributeContext: {
            id: `${node.path.join(".")}:${binding.attribute.name}:${node.element.attributes.indexOf(binding.attribute)}`,
            node,
            element: node.element,
            attribute: binding.attribute,
            source: binding.attribute.value,
            behaviorTree: node.behaviorTree,
          },
          identifier: {
            name: `@${reference.key}`,
            kind: "read",
            range: { start: 0, end: 0 },
            identifier: { kind: "Identifier", name: `@${reference.key}`, range: { start: 0, end: 0 } },
            statementIndex: -1,
          },
          reference: {
            kind: "global-blackboard",
            key: reference.key,
            origin: "port-remap",
          } as const,
          documentRange: reference.range,
        })),
    ),
  );
}

function toDocumentRange(
  context: LanguageRequestContext,
  scriptContext: ScriptAttributeContext,
  range: { start: number; end: number },
) {
  return mapDecodedAttributeRangeToDocumentRange(
    context.parsed ?? { originalText: context.document.text },
    scriptContext.attribute,
    range,
  );
}

export function mapRawAttributeOffsetToDecodedOffset(
  attribute: BtXmlAttribute,
  rawOffset: number,
): number {
  const offsets = attribute.valueOffsets;
  if (!offsets || offsets.length === 0) return rawOffset;
  if (rawOffset <= 0) return 0;

  for (let index = 1; index < offsets.length; index += 1) {
    const offset = offsets[index];
    if (offset === undefined) continue;
    if (offset >= rawOffset) {
      const previous = offsets[index - 1] ?? 0;
      return rawOffset <= previous ? index - 1 : index;
    }
  }

  return Math.max(0, offsets.length - 1);
}

export function mapDecodedRangeToReplacementRange(
  context: LanguageRequestContext,
  attribute: BtXmlAttribute,
  range: { start: number; end: number },
) {
  const document = context.parsed ?? { originalText: context.document.text };
  return mapDecodedAttributeRangeToDocumentRange(document, attribute, range);
}

export function mapDecodedOffsetToRawAttributeOffset(
  attribute: BtXmlAttribute,
  decodedOffset: number,
) {
  return mapDecodedAttributeOffsetToRawOffset(attribute, decodedOffset);
}

function getRemappedKeyFromBinding(binding: PortBindingView) {
  if (binding.declaredPort.status !== "resolved") return undefined;
  const parsed = parsePortBlackboardReference({
    portName: binding.declaredPort.port.name,
    rawValue: binding.value,
  });
  return parsed.ok ? { key: parsed.reference.key, scope: parsed.reference.scope } : undefined;
}
