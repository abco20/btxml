import type { EffectiveFileConfig } from "@btxml/config";
import type { SourcePosition } from "@btxml/foundation";
import {
  type SemanticIndex,
  getBehaviorTrees,
  getNodeModel,
  getNodeModelDefinitions,
  makeBlackboardIdentity,
  resolveNodeUsage,
} from "@btxml/semantic";
import { type BtDocumentView, findPortBindingAtPosition } from "@btxml/semantic/ast-view";
import {
  type BtDocument,
  inspectXmlCursor,
  mapDecodedAttributeRangeToDocumentRange,
} from "@btxml/syntax";
import type { LanguageRequestContext } from "../context.js";
import type { InternalDefinitionInput } from "../internal-types.js";
import type { DefinitionResult, Location } from "../public-types.js";
import { getBehaviorTreeScriptFlowStates, getScriptIdentifierTarget } from "./script-context.js";

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

function getSubTreeModelDefinitionLocations(
  semantic: SemanticIndex,
  id: string,
  fallbackUri: string,
): Location[] {
  return getNodeModelDefinitions(semantic, id)
    .filter((definition) => definition.kind === "SubTree")
    .map((definition) => {
      if (definition.idRange) {
        return {
          uri: definition.uri || fallbackUri,
          range: definition.idRange,
        };
      }

      if (definition.range) {
        return {
          uri: definition.uri || fallbackUri,
          range: definition.range,
        };
      }

      return undefined;
    })
    .filter((location): location is Location => Boolean(location));
}

export function getDefinitionLocations(
  parsed: BtDocument | undefined,
  documentView: BtDocumentView | undefined,
  position: SourcePosition,
  semantic: SemanticIndex,
  config?: EffectiveFileConfig,
  policy?: LanguageRequestContext["nodeUsagePolicy"],
  workspaceDocuments?: readonly BtDocument[],
): Location[] {
  if (!parsed) return [];
  const inspect = inspectXmlCursor({
    document: {
      uri: parsed.uri,
      languageId: "xml",
      version: 0,
      text: parsed.originalText,
      positionAt: () => position,
      offsetAt: () => position.offset,
      getText: () => parsed.originalText,
    },
    parsed,
    position,
  });
  const element = "element" in inspect ? inspect.element : undefined;
  const attribute = "attribute" in inspect ? inspect.attribute : undefined;
  const usage = element
    ? resolveNodeUsage(semantic, {
        element,
        documentRoot: parsed.root,
        uri: parsed.uri,
        config,
        policy,
      })
    : undefined;
  if (element?.name === "SubTree" && attribute?.name === "ID") {
    if (usage?.tagForm === "model-definition") {
      return getBehaviorTrees(semantic, attribute.value)
        .map((def) => (def.idRange ? { uri: def.uri, range: def.idRange } : undefined))
        .filter((location): location is Location => Boolean(location));
    }

    const subtreeModelDefinitions = getSubTreeModelDefinitionLocations(
      semantic,
      attribute.value,
      parsed.uri,
    );
    const target = usage?.subtree?.target;
    if (target?.status === "resolved" && target.kind === "behavior-tree") {
      const behaviorTree = target.behaviorTree;
      if (behaviorTree.idRange) {
        return uniqueLocations([
          {
            uri: behaviorTree.uri,
            range: behaviorTree.idRange,
          },
          ...subtreeModelDefinitions,
        ]);
      }
      return subtreeModelDefinitions;
    }
    if (target?.status === "ambiguous") {
      return uniqueLocations(
        [
          ...target.behaviorTrees.map((def) =>
            def.idRange ? { uri: def.uri || parsed.uri, range: def.idRange } : undefined,
          ),
          ...subtreeModelDefinitions,
        ].filter((location): location is Location => Boolean(location)),
      );
    }
    if (target?.status === "resolved" && target.kind === "node-model") {
      if (subtreeModelDefinitions.length > 0) return subtreeModelDefinitions;
      if (target.model.idRange) {
        return [{ uri: target.model.uri || parsed.uri, range: target.model.idRange }];
      }
    }
    return subtreeModelDefinitions;
  }
  if (element?.name === "root" && attribute?.name === "main_tree_to_execute") {
    return getBehaviorTrees(semantic, attribute.value)
      .map((def) => (def.idRange ? { uri: def.uri, range: def.idRange } : undefined))
      .filter((location): location is Location => Boolean(location));
  }
  if (element?.name === "include" && attribute?.name === "path" && workspaceDocuments) {
    const match = workspaceDocuments.find(
      (file) =>
        file.uri === attribute.value ||
        file.path === attribute.value ||
        (file.path ? file.path.endsWith(`/${attribute.value}`) : false),
    );
    if (match?.root?.range) return [{ uri: match.uri, range: match.root.range }];
  }
  if (attribute && element) {
    const binding = documentView ? findPortBindingAtPosition(documentView, position) : undefined;
    if (binding?.declaredPort.status === "resolved") {
      const port = binding.declaredPort.port;
      if (port.nameRange) return [{ uri: port.uri || parsed.uri, range: port.nameRange }];
    }
  }
  if (inspect.kind === "tag-name" && element) {
    if (usage?.model.status === "resolved") {
      const model = usage.model.model;
      if (model.idRange) return [{ uri: model.uri || parsed.uri, range: model.idRange }];
      if (model.range) return [{ uri: model.uri || parsed.uri, range: model.range }];
    }
  }
  if (
    attribute?.name === "ID" &&
    usage?.tagForm === "generic-node" &&
    usage.model.status === "resolved"
  ) {
    const model = usage.model.model;
    if (model.idRange) return [{ uri: model.uri || parsed.uri, range: model.idRange }];
    if (model.range) return [{ uri: model.uri || parsed.uri, range: model.range }];
  }
  return [];
}

export function getDefinition(
  context: LanguageRequestContext,
  input: InternalDefinitionInput,
): DefinitionResult {
  const scriptTarget = getScriptIdentifierTarget(context, input.position);
  if (scriptTarget?.reference.kind === "symbol") {
    const symbol = scriptTarget.reference.symbol;
    if (symbol.source.kind === "script-assignment") {
      const source = symbol.source;
      const declarationState = getBehaviorTreeScriptFlowStates(
        context,
        scriptTarget.attributeContext.behaviorTree,
      ).find((state) => state.id === source.originId);
      const declarationContext = declarationState?.context ?? scriptTarget.attributeContext;
      return {
        locations: [
          {
            uri: context.document.uri,
            range: mapDecodedAttributeRangeToDocumentRange(
              context.parsed ?? { originalText: context.document.text },
              declarationContext.attribute,
              source.range,
            ),
          },
        ],
      };
    }

    if (symbol.source.kind === "port-remap" || symbol.source.kind === "global-blackboard-remap") {
      const source = symbol.source;
      const targetIdentity = makeBlackboardIdentity({
        scope: source.kind === "global-blackboard-remap" ? "global" : "local",
        key: symbol.name,
      });
      const binding = context.documentView?.nodes
        .filter((node) => node.behaviorTree === scriptTarget.attributeContext.behaviorTree)
        .flatMap((node) => node.portBindings)
        .filter(
          (
            binding,
          ): binding is typeof binding & {
            declaredPort: Extract<typeof binding.declaredPort, { status: "resolved" }>;
          } => binding.declaredPort.status === "resolved",
        )
        .find(
          (binding) =>
            binding.declaredPort.port.name === source.portName &&
            binding.declaredPort.port.direction === source.direction &&
            binding.blackboardReferences.some((reference) => reference.identity === targetIdentity),
        );

      const location = binding?.declaredPort.port.nameRange;

      if (location) {
        return {
          locations: [
            {
              uri: binding.declaredPort.port.uri || context.document.uri,
              range: location,
            },
          ],
        };
      }
    }

    if (symbol.source.kind === "subtree-port") {
      const source = symbol.source;
      const model = source.nodeType ? getNodeModel(context.semantic, source.nodeType) : undefined;
      const port = model?.ports.find(
        (candidate) =>
          candidate.name === source.portName && candidate.direction === source.direction,
      );

      if (port?.nameRange) {
        return {
          locations: [
            {
              uri: port.uri || context.document.uri,
              range: port.nameRange,
            },
          ],
        };
      }
    }
  }

  if (scriptTarget?.reference.kind === "global-blackboard") {
    const targetIdentity = makeBlackboardIdentity({
      scope: "global",
      key: scriptTarget.reference.key,
    });
    const binding = context.documentView?.nodes
      .filter((node) => node.behaviorTree === scriptTarget.attributeContext.behaviorTree)
      .flatMap((node) => node.portBindings)
      .find((candidate) =>
        candidate.blackboardReferences.some((reference) => reference.identity === targetIdentity),
      );
    const reference = binding?.blackboardReferences.find(
      (candidate) => candidate.identity === targetIdentity,
    );

    if (binding && reference) {
      return {
        locations: [
          {
            uri: context.document.uri,
            range: reference.range,
          },
        ],
      };
    }
  }

  return {
    locations: getDefinitionLocations(
      context.parsed,
      context.documentView,
      input.position,
      context.semantic,
      context.config,
      context.nodeUsagePolicy,
      context.workspace?.documents,
    ),
  };
}
