import type { DiagnosticData } from "@btxml/foundation";
import {
  type ModelSourceRef,
  type NodeModelSourceKind,
  type PortDef,
  type TreeNodeModelDef,
  areEquivalentNodeModels,
  classifyNodeModelDifference,
} from "@btxml/model";
import type { ModelConflictFact } from "./types.js";

export type ModelLayerKind =
  | "builtin"
  | "xml-tree-nodes-model"
  | "external-tree-nodes-model"
  | "node-definition-file"
  | "config-inline";

export type ModelLayer = {
  kind: ModelLayerKind;
  precedence: number;
  editable: boolean;
  models: TreeNodeModelDef[];
};

export type ModelLayerMergeResult = {
  nodeModelsById: Map<string, TreeNodeModelDef[]>;
  mergedNodeModelsById: Map<string, TreeNodeModelDef>;
  conflicts: ModelConflictFact[];
};

export function createBuiltinModelLayer(models: TreeNodeModelDef[]): ModelLayer {
  return createModelLayer("builtin", 0, false, models);
}

export function createDocumentModelLayer(models: TreeNodeModelDef[]): ModelLayer {
  return createModelLayer("xml-tree-nodes-model", 10, true, models);
}

export function createExternalDocumentModelLayer(models: TreeNodeModelDef[]): ModelLayer {
  return createModelLayer(
    "external-tree-nodes-model",
    15,
    models.some((m) => m.editable !== false),
    models,
  );
}

export function createNodeDefinitionModelLayer(models: TreeNodeModelDef[]): ModelLayer {
  return createModelLayer("node-definition-file", 20, true, models);
}

export function createConfigInlineModelLayer(models: TreeNodeModelDef[]): ModelLayer {
  return createModelLayer("config-inline", 30, true, models);
}

function createModelLayer(
  kind: ModelLayerKind,
  precedence: number,
  editable: boolean,
  models: TreeNodeModelDef[],
): ModelLayer {
  return {
    kind,
    precedence,
    editable,
    models: models.map((model) =>
      withLayerMetadata(model, kind, editable && model.editable !== false),
    ),
  };
}

function sourceKindForLayer(kind: ModelLayerKind): NodeModelSourceKind {
  if (kind === "config-inline") return "config";
  if (kind === "xml-tree-nodes-model") return "inline-tree-nodes-model";
  return kind;
}

function withLayerMetadata(
  model: TreeNodeModelDef,
  kind: ModelLayerKind,
  editable: boolean,
): TreeNodeModelDef {
  const source = sourceKindForLayer(kind);
  return {
    ...model,
    source,
    sourceMeta: model.sourceMeta ?? {
      sourceKind: source,
      file: model.uri,
      range: model.range,
    },
    editable,
    ports: model.ports.map((port) => ({ ...port, source })),
  };
}

function toModelSourceRef(model: TreeNodeModelDef, index: number): ModelSourceRef {
  return {
    uri: model.uri,
    sourceKind: model.source || "inline-tree-nodes-model",
    nodeId: model.id,
    kind: model.kind,
    range: model.range,
    idRange: model.idRange,
    sourceIndex: index,
  };
}

function toSerializablePort(port: PortDef) {
  return {
    name: port.name,
    direction: port.direction,
    type: port.type,
    required: port.required,
    defaultValue: port.defaultValue,
    enum: port.enum ? [...port.enum].sort() : undefined,
    description: port.description,
  };
}

function diffNodeModels(
  left: TreeNodeModelDef,
  right: TreeNodeModelDef,
): Record<string, unknown>[] {
  const differences: Record<string, unknown>[] = [];

  if (left.kind !== right.kind) {
    differences.push({ kind: "node-kind", left: left.kind, right: right.kind });
  }

  const leftPorts = new Map(left.ports.map((p) => [p.name, p]));
  const rightPorts = new Map(right.ports.map((p) => [p.name, p]));

  for (const [name, port] of leftPorts) {
    if (!rightPorts.has(name)) {
      differences.push({
        kind: "port-removed",
        portName: name,
        sourceIndex: 0,
        port: toSerializablePort(port),
      });
    }
  }

  for (const [name, port] of rightPorts) {
    if (!leftPorts.has(name)) {
      differences.push({
        kind: "port-added",
        portName: name,
        sourceIndex: 1,
        port: toSerializablePort(port),
      });
    }
  }

  for (const [name, leftPort] of leftPorts) {
    const rightPort = rightPorts.get(name);
    if (!rightPort) continue;

    if (leftPort.direction !== rightPort.direction) {
      differences.push({
        kind: "port-direction",
        portName: name,
        left: leftPort.direction,
        right: rightPort.direction,
      });
    }
    if (leftPort.type !== rightPort.type) {
      differences.push({
        kind: "port-type",
        portName: name,
        left: leftPort.type,
        right: rightPort.type,
      });
    }
    if (leftPort.required !== rightPort.required) {
      differences.push({
        kind: "port-required",
        portName: name,
        left: leftPort.required,
        right: rightPort.required,
      });
    }
    if (leftPort.defaultValue !== rightPort.defaultValue) {
      differences.push({
        kind: "port-default",
        portName: name,
        left: leftPort.defaultValue,
        right: rightPort.defaultValue,
      });
    }
    const leftEnum = leftPort.enum ? JSON.stringify([...leftPort.enum].sort()) : "";
    const rightEnum = rightPort.enum ? JSON.stringify([...rightPort.enum].sort()) : "";
    if (leftEnum !== rightEnum) {
      differences.push({
        kind: "port-enum",
        portName: name,
        left: leftPort.enum ? [...leftPort.enum].sort() : undefined,
        right: rightPort.enum ? [...rightPort.enum].sort() : undefined,
      });
    }
    if (leftPort.description !== rightPort.description) {
      differences.push({
        kind: "port-description",
        portName: name,
        left: leftPort.description,
        right: rightPort.description,
      });
    }
  }

  return differences;
}

function mergeSamePrecedence(models: TreeNodeModelDef[], conflicts: ModelConflictFact[]) {
  const merged = new Map<string, TreeNodeModelDef>();
  for (const model of models) {
    const existing = merged.get(model.id);
    if (!existing) {
      merged.set(model.id, model);
      continue;
    }
    if (areEquivalentNodeModels(existing, model)) continue;

    const diff = classifyNodeModelDifference(existing, model);
    const differences = diffNodeModels(existing, model);

    let data: DiagnosticData;
    if (diff === "port-default") {
      const existingPorts = new Map(existing.ports.map((p) => [p.name, p]));
      const conflictingPort = model.ports.find((port) => {
        const existingPort = existingPorts.get(port.name);
        return existingPort && existingPort.defaultValue !== port.defaultValue;
      });
      const portName = conflictingPort?.name ?? "unknown";
      const sources = [toModelSourceRef(existing, 0), toModelSourceRef(model, 1)];
      data = {
        kind: "port-default-conflict",
        nodeId: model.id,
        portName,
        sources: [
          {
            source: toModelSourceRef(existing, 0),
            value: existingPorts.get(portName)?.defaultValue,
          },
          { source: toModelSourceRef(model, 1), value: conflictingPort?.defaultValue },
        ],
      };
      conflicts.push({
        id: model.id,
        definitions: [existing, model],
        sources,
        code: "BT107_CONFLICTING_PORT_DEFAULT",
        message: `conflicting default for port \`${portName}\` on node \`${model.id}\``,
        uri: model.uri,
        range: model.idRange || model.range,
        details: {
          primaryLabel: "the same port has different default values across model definitions",
          help: `use the same default value in every \`${model.id}\` definition or remove the duplicate model`,
        },
        data,
        relatedInformation:
          existing.uri && existing.range
            ? [{ uri: existing.uri, range: existing.range, message: "previous definition" }]
            : undefined,
      });
    } else {
      const sources = [toModelSourceRef(existing, 0), toModelSourceRef(model, 1)];
      data = {
        kind: "node-model-conflict",
        nodeId: model.id,
        sources,
        differences,
      };
      conflicts.push({
        id: model.id,
        definitions: [existing, model],
        sources,
        code: "BT012_CONFLICTING_NODE_MODEL",
        message: `conflicting node model \`${model.id}\``,
        uri: model.uri,
        range: model.idRange || model.range,
        details: {
          primaryLabel: "another model with this ID defines a different kind or port shape",
          help: `make all \`${model.id}\` model definitions agree, or keep only one definition at the same precedence level`,
        },
        data,
        relatedInformation:
          existing.uri && existing.range
            ? [{ uri: existing.uri, range: existing.range, message: "previous definition" }]
            : undefined,
      });
    }
  }
  return merged;
}

function overlayNodeModel(base: TreeNodeModelDef | undefined, override: TreeNodeModelDef) {
  if (!base) return { ...override, ports: [...override.ports] };
  const portsByName = new Map(base.ports.map((port) => [port.name, port] as const));
  for (const port of override.ports) portsByName.set(port.name, port);
  return {
    ...base,
    ...override,
    sourceMeta: override.sourceMeta || base.sourceMeta,
    ports: [...portsByName.values()],
  };
}

export function mergeModelLayers(layers: ModelLayer[]): ModelLayerMergeResult {
  const conflicts: ModelConflictFact[] = [];
  const nodeModelsById = new Map<string, TreeNodeModelDef[]>();
  const mergedNodeModelsById = new Map<string, TreeNodeModelDef>();
  const orderedLayers = [...layers].sort((a, b) => a.precedence - b.precedence);
  const byPrecedence = new Map<number, TreeNodeModelDef[]>();
  const effectivePrecedenceById = new Map<string, number>();

  for (const layer of orderedLayers) {
    const list = byPrecedence.get(layer.precedence) ?? [];
    const models = layer.models.map((model) =>
      withLayerMetadata(model, layer.kind, layer.editable && model.editable !== false),
    );
    list.push(...models);
    byPrecedence.set(layer.precedence, list);
    for (const model of models) effectivePrecedenceById.set(model.id, layer.precedence);
  }

  for (const [precedence, models] of [...byPrecedence.entries()].sort((a, b) => a[0] - b[0])) {
    const effectiveModels = models.filter(
      (model) => effectivePrecedenceById.get(model.id) === precedence,
    );
    const overriddenModels = models.filter(
      (model) => effectivePrecedenceById.get(model.id) !== precedence,
    );
    const samePrecedenceMerged = mergeSamePrecedence(overriddenModels, []);
    for (const [id, model] of mergeSamePrecedence(effectiveModels, conflicts)) {
      samePrecedenceMerged.set(id, model);
    }
    const idsAtPrecedence = new Set(models.map((model) => model.id));
    for (const id of idsAtPrecedence) {
      if (effectivePrecedenceById.get(id) === precedence) {
        nodeModelsById.set(
          id,
          models.filter((model) => model.id === id),
        );
      }
    }
    for (const [id, model] of samePrecedenceMerged) {
      mergedNodeModelsById.set(id, overlayNodeModel(mergedNodeModelsById.get(id), model));
    }
    void precedence;
  }

  return { nodeModelsById, mergedNodeModelsById, conflicts };
}
