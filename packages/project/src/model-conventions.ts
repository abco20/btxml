import { type RuleName, getRuleSeverity } from "@btxml/analyzer/rules";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import { DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import type { SourceRange } from "@btxml/foundation";
import {
  type ModelDefinitionFact,
  type SemanticIndex,
  getModelConflicts,
  getModelDefinitionFacts,
  getNodeModel,
  getNodeModelDefinitions,
  getNodeUsagesByUri,
  groupModelDefinitionsById,
  groupModelDefinitionsByKey,
} from "@btxml/semantic";

const RULE_CONFLICTING_KIND = "model/no-conflicting-kind-for-id";
const RULE_UNUSED_DEFINITION = "model/no-unused-definition";
const RULE_DUPLICATE_DEFINITION = "model/no-duplicate-definition";
const RULE_REQUIRE_LOCAL_DEFINITION = "model/require-local-definition";

const NORMAL_MODEL_KINDS = new Set(["Action", "Condition", "Decorator", "Control"]);

type FixableModelPort = {
  direction: "input" | "output" | "inout";
  name: string;
  type?: string;
  defaultValue?: string;
  description?: string;
  enum?: readonly string[];
};

type FixableModel = {
  id: string;
  kind: "Action" | "Condition" | "Decorator" | "Control";
  ports: readonly FixableModelPort[];
};

function createConventionDiagnostic(input: {
  code: string;
  message: string;
  uri?: string;
  range?: SourceRange;
  rule: string;
  severity: DiagnosticSeverity;
  data: Record<string, unknown>;
  relatedInformation?: Array<{
    uri: string;
    range: SourceRange;
    message: string;
  }>;
}) {
  const diagnostic = createDiagnostic(
    input.code,
    input.severity,
    input.message,
    input.range,
    input.uri,
    undefined,
    input.data,
  );

  return {
    ...diagnostic,
    rule: input.rule,
    ...(input.relatedInformation ? { relatedInformation: input.relatedInformation } : {}),
  };
}

function resolveConventionSeverity(config: ResolvedBtxmlConfig, rule: RuleName) {
  const severity = getRuleSeverity(config.linter.rules, rule);
  if (severity === "off") return undefined;
  if (severity === "info") return DiagnosticSeverity.Info;
  if (severity === "warn") return DiagnosticSeverity.Warning;
  return DiagnosticSeverity.Error;
}

function definitionRange(definition: ModelDefinitionFact) {
  return definition.model.idRange ?? definition.range;
}

function definitionDeleteRange(definition: ModelDefinitionFact) {
  return definition.range;
}

function definitionInfo(definition: ModelDefinitionFact) {
  return {
    uri: definition.uri,
    sourceKind: definition.sourceKind,
    modelKind: definition.kind,
    range: definition.range,
  };
}

function isNormalModelKind(
  kind: ModelDefinitionFact["kind"],
): kind is "Action" | "Condition" | "Decorator" | "Control" {
  return NORMAL_MODEL_KINDS.has(kind);
}

function toFixableModel(index: SemanticIndex, id: string): FixableModel | undefined {
  const resolved = getNodeModel(index, id);
  if (!resolved) return undefined;
  if (!isNormalModelKind(resolved.kind)) return undefined;

  const hasConflict = getModelConflicts(index).some(
    (conflict) =>
      conflict.id === id &&
      (conflict.code === "BT012_CONFLICTING_NODE_MODEL" ||
        conflict.code === "BT107_CONFLICTING_PORT_DEFAULT"),
  );
  if (hasConflict) return undefined;

  return {
    id: resolved.id,
    kind: resolved.kind,
    ports: resolved.ports.map((port) => ({
      direction: port.direction,
      name: port.name,
      type: port.type,
      defaultValue: port.defaultValue,
      description: port.description,
      enum: port.enum,
    })),
  };
}

function validateConflictingKinds(input: {
  config: ResolvedBtxmlConfig;
  facts: readonly ModelDefinitionFact[];
}) {
  const severity = resolveConventionSeverity(input.config, RULE_CONFLICTING_KIND);
  if (!severity) return [];

  const diagnostics = [];
  const groupedById = groupModelDefinitionsById(input.facts.filter((fact) => !fact.isBuiltin));

  for (const [id, definitions] of groupedById) {
    const kinds = new Set(definitions.map((definition) => definition.kind));
    if (kinds.size <= 1) continue;

    const primary = definitions[0];
    if (!primary) continue;

    for (const definition of definitions.slice(1)) {
      if (definition.kind === primary.kind) continue;

      const primaryRange = definitionRange(primary);
      const relatedInformation =
        primary.uri && primaryRange
          ? [
              {
                uri: primary.uri,
                range: primaryRange,
                message: "first conflicting definition",
              },
            ]
          : undefined;

      diagnostics.push(
        createConventionDiagnostic({
          code: "BT120_CONFLICTING_MODEL_KIND",
          message: `model ID \`${id}\` has conflicting kinds (\`${primary.kind}\` vs \`${definition.kind}\`)`,
          uri: definition.uri,
          range: definitionRange(definition),
          rule: RULE_CONFLICTING_KIND,
          severity,
          data: {
            kind: "conflicting-model-kind",
            nodeId: id,
            definitions: definitions.map(definitionInfo),
          },
          relatedInformation,
        }),
      );
    }
  }

  return diagnostics;
}

function validateUsedOnly(input: {
  config: ResolvedBtxmlConfig;
  index: SemanticIndex;
  facts: readonly ModelDefinitionFact[];
}) {
  if (input.config.models.convention !== "used-only") return [];

  const severity = resolveConventionSeverity(input.config, RULE_UNUSED_DEFINITION);
  const missingSeverity = resolveConventionSeverity(input.config, RULE_REQUIRE_LOCAL_DEFINITION);
  if (!severity && !missingSeverity) return [];

  const diagnostics = [];
  const usagesByUri = getNodeUsagesByUri(input.index);

  const allInlineByUri = buildAllInlineDefinitionsByUri(input.facts);
  const localNormalByUri = buildLocalNormalDefinitionsByUri(input.facts);
  const relevantUris = new Set<string>([
    ...usagesByUri.keys(),
    ...localNormalByUri.keys(),
    ...allInlineByUri.keys(),
  ]);

  for (const uri of relevantUris) {
    const sameFileNodeUsages = usagesByUri.get(uri) ?? [];
    const usedNodeIds = getUsedNodeIds(sameFileNodeUsages);
    const localNormalDefinitions = localNormalByUri.get(uri) ?? [];
    const localNormalIds = new Set(localNormalDefinitions.map((definition) => definition.id));
    const localAnyIds = new Set((allInlineByUri.get(uri) ?? []).map((definition) => definition.id));

    if (severity) {
      diagnostics.push(
        ...createUnusedDefinitionDiagnostics(localNormalDefinitions, usedNodeIds, severity),
      );
    }

    if (missingSeverity) {
      diagnostics.push(
        ...createMissingLocalDefinitionDiagnostics({
          index: input.index,
          uri,
          usedNodeIds,
          localNormalIds,
          localAnyIds,
          sameFileNodeUsages,
          severity: missingSeverity,
        }),
      );
    }
  }

  return diagnostics;
}

function buildAllInlineDefinitionsByUri(facts: readonly ModelDefinitionFact[]) {
  const allInlineByUri = new Map<string, ModelDefinitionFact[]>();
  for (const definition of facts) {
    if (definition.sourceKind !== "inline-tree-nodes-model") continue;
    if (!definition.uri) continue;
    const allInline = allInlineByUri.get(definition.uri) ?? [];
    allInline.push(definition);
    allInlineByUri.set(definition.uri, allInline);
  }
  return allInlineByUri;
}

function buildLocalNormalDefinitionsByUri(facts: readonly ModelDefinitionFact[]) {
  const localNormalByUri = new Map<string, ModelDefinitionFact[]>();
  for (const definition of facts) {
    if (definition.sourceKind !== "inline-tree-nodes-model") continue;
    if (!definition.uri) continue;
    if (!isNormalModelKind(definition.kind)) continue;
    const localNormal = localNormalByUri.get(definition.uri) ?? [];
    localNormal.push(definition);
    localNormalByUri.set(definition.uri, localNormal);
  }
  return localNormalByUri;
}

function getUsedNodeIds(sameFileNodeUsages: Array<{ id: string; kind: "node" | "SubTree" }>) {
  return new Set(
    sameFileNodeUsages.filter((usage) => usage.kind === "node").map((usage) => usage.id),
  );
}

function createUnusedDefinitionDiagnostics(
  localNormalDefinitions: readonly ModelDefinitionFact[],
  usedNodeIds: ReadonlySet<string>,
  severity: DiagnosticSeverity,
) {
  const diagnostics = [];

  for (const definition of localNormalDefinitions) {
    if (usedNodeIds.has(definition.id)) continue;

    diagnostics.push(
      createConventionDiagnostic({
        code: "BT121_UNUSED_MODEL_DEFINITION",
        message: `unused inline model definition \`${definition.id}\` in this file`,
        uri: definition.uri,
        range: definitionRange(definition),
        rule: RULE_UNUSED_DEFINITION,
        severity,
        data: {
          kind: "unused-model-definition",
          nodeId: definition.id,
          modelKind: definition.kind,
          sourceKind: "inline-tree-nodes-model",
          fix:
            definition.uri && definitionDeleteRange(definition) && definition.editable
              ? {
                  kind: "delete-definition",
                  uri: definition.uri,
                  range: definitionDeleteRange(definition),
                }
              : undefined,
        },
      }),
    );
  }

  return diagnostics;
}

function createMissingLocalDefinitionDiagnostics(input: {
  index: SemanticIndex;
  uri: string;
  usedNodeIds: ReadonlySet<string>;
  localNormalIds: ReadonlySet<string>;
  localAnyIds: ReadonlySet<string>;
  sameFileNodeUsages: Array<{
    id: string;
    kind: "node" | "SubTree";
    range?: SourceRange;
    elementRange?: SourceRange;
  }>;
  severity: DiagnosticSeverity;
}) {
  const diagnostics = [];

  for (const nodeId of input.usedNodeIds) {
    if (input.localNormalIds.has(nodeId)) continue;

    const hasNormalModel = getNodeModelDefinitions(input.index, nodeId).some((definition) =>
      isNormalModelKind(definition.kind),
    );
    if (!hasNormalModel) continue;

    const hasNonNormalLocalDefinition = input.localAnyIds.has(nodeId);

    const firstUsage = input.sameFileNodeUsages.find(
      (usage) => usage.kind === "node" && usage.id === nodeId,
    );
    const fixableModel = hasNonNormalLocalDefinition ? undefined : toFixableModel(input.index, nodeId);

    diagnostics.push(
      createConventionDiagnostic({
        code: "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        message: `missing local model definition \`${nodeId}\` in this file`,
        uri: input.uri,
        range: firstUsage?.elementRange ?? firstUsage?.range,
        rule: RULE_REQUIRE_LOCAL_DEFINITION,
        severity: input.severity,
        data: {
          kind: "missing-local-model-definition",
          nodeId,
          sourceKind: "inline-tree-nodes-model",
          fix:
            fixableModel && input.uri
              ? {
                  kind: "add-local-definition",
                  uri: input.uri,
                  nodeId,
                  model: fixableModel,
                }
              : undefined,
        },
      }),
    );
  }

  return diagnostics;
}

function duplicateFix(definitions: readonly ModelDefinitionFact[]) {
  const canonical = definitions.filter((definition) => definition.isCanonicalModelFile);
  if (canonical.length !== 1) return undefined;

  const keep = canonical[0];
  if (!keep?.uri) return undefined;

  const deleteTargets = definitions.filter((definition) => definition !== keep);
  if (
    deleteTargets.some(
      (definition) => !definition.uri || !definitionDeleteRange(definition) || !definition.editable,
    )
  ) {
    return undefined;
  }

  return {
    kind: "delete-non-canonical-definitions",
    keep: {
      uri: keep.uri,
      range: definitionRange(keep),
    },
    delete: deleteTargets.map((definition) => ({
      uri: definition.uri,
      range: definitionDeleteRange(definition),
    })),
  };
}

function validateSingleSource(input: {
  config: ResolvedBtxmlConfig;
  facts: readonly ModelDefinitionFact[];
}) {
  if (input.config.models.convention !== "single-source") return [];

  const severity = resolveConventionSeverity(input.config, RULE_DUPLICATE_DEFINITION);
  if (!severity) return [];

  const diagnostics = [];
  const groupedByKey = groupModelDefinitionsByKey(input.facts.filter((fact) => !fact.isBuiltin));

  for (const definitions of groupedByKey.values()) {
    if (definitions.length <= 1) continue;

    const primary = definitions[0];
    if (!primary) continue;

    diagnostics.push(
      createConventionDiagnostic({
        code: "BT122_DUPLICATE_MODEL_DEFINITION",
        message: `duplicate model definition for \`${primary.id}\` (${primary.kind})`,
        uri: primary.uri,
        range: definitionRange(primary),
        rule: RULE_DUPLICATE_DEFINITION,
        severity,
        data: {
          kind: "duplicate-model-definition",
          nodeId: primary.id,
          modelKind: primary.kind,
          definitions: definitions.map((definition) => ({
            uri: definition.uri,
            sourceKind: definition.sourceKind,
            range: definition.range,
            canonical: definition.isCanonicalModelFile,
            editable: definition.editable,
          })),
          fix: duplicateFix(definitions),
        },
      }),
    );
  }

  return diagnostics;
}

export function validateModelConventions(input: {
  config: ResolvedBtxmlConfig;
  index: SemanticIndex;
}) {
  if (input.config.linter.enabled === false) return [];

  const facts = getModelDefinitionFacts(input.index);

  return [
    ...validateConflictingKinds({ config: input.config, facts }),
    ...validateUsedOnly({ config: input.config, index: input.index, facts }),
    ...validateSingleSource({ config: input.config, facts }),
  ];
}
