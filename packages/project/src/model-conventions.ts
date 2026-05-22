import { DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import { getRuleSeverity, type RuleName } from "@btxml/analyzer/rules";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import type { SourceRange } from "@btxml/foundation";
import {
  getModelDefinitionFacts,
  getNodeUsagesByUri,
  groupModelDefinitionsById,
  groupModelDefinitionsByKey,
  type ModelDefinitionFact,
  type SemanticIndex,
} from "@btxml/semantic";

const RULE_CONFLICTING_KIND = "model/no-conflicting-kind-for-id";
const RULE_UNUSED_DEFINITION = "model/no-unused-definition";
const RULE_DUPLICATE_DEFINITION = "model/no-duplicate-definition";

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

function definitionInfo(definition: ModelDefinitionFact) {
  return {
    uri: definition.uri,
    sourceKind: definition.sourceKind,
    modelKind: definition.kind,
    range: definition.range,
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
          relatedInformation:
            primary.uri && definitionRange(primary)
              ? [
                  {
                    uri: primary.uri,
                    range: definitionRange(primary),
                    message: "first conflicting definition",
                  },
                ]
              : undefined,
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
  if (!severity) return [];

  const diagnostics = [];
  const usagesByUri = getNodeUsagesByUri(input.index);

  for (const definition of input.facts) {
    if (definition.isBuiltin) continue;
    if (definition.sourceKind !== "inline-tree-nodes-model") continue;
    if (definition.kind === "SubTree") continue;

    const sameFileNodeUsages = usagesByUri.get(definition.uri ?? "") ?? [];
    const usedNodeIds = new Set(
      sameFileNodeUsages.filter((usage) => usage.kind === "node").map((usage) => usage.id),
    );
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
            definition.uri && definitionRange(definition) && definition.editable
              ? {
                  kind: "delete-definition",
                  uri: definition.uri,
                  range: definitionRange(definition),
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
      (definition) => !definition.uri || !definitionRange(definition) || !definition.editable,
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
      range: definitionRange(definition),
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
