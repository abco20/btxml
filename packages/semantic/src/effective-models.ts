import { type Diagnostic, DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import {
  type EffectivePortTypeSource,
  type ModelAugmentationFile,
  type PortAugmentation,
  type PortDef,
  type TreeNodeModelDef,
  type TypeRegistry,
  normalizeTypeName,
} from "@btxml/model";

type EffectiveModelBuildResult = {
  modelsById: Map<string, TreeNodeModelDef>;
  diagnostics: Diagnostic[];
};

function normalizeForRefinement(
  registry: TypeRegistry,
  typeName: string | undefined,
): string | undefined {
  if (!typeName) {
    return undefined;
  }

  return normalizeTypeName(registry, typeName);
}

function getDefaultTypeSource(port: PortDef): EffectivePortTypeSource {
  return port.source === "inline-tree-nodes-model" || port.source === "external-tree-nodes-model"
    ? port.source
    : port.source;
}

function createAugmentationDiagnostic(input: {
  code: string;
  message: string;
  help: string;
  model?: TreeNodeModelDef;
  port?: PortDef;
  data: Record<string, unknown>;
  notes?: readonly string[];
}): Diagnostic {
  const uri = input.port?.uri ?? input.model?.uri ?? "";
  const range =
    input.port?.nameRange ?? input.port?.range ?? input.model?.idRange ?? input.model?.range;

  return createDiagnostic(
    input.code,
    DiagnosticSeverity.Error,
    input.message,
    range,
    uri,
    {
      primaryLabel: input.message,
      help: input.help,
      notes: input.notes,
    },
    input.data,
  );
}

function applyPortAugmentation(
  typeRegistry: TypeRegistry,
  model: TreeNodeModelDef,
  port: PortDef,
  augmentation: PortAugmentation,
  diagnostics: Diagnostic[],
): PortDef {
  const baseType = port.effectiveType ?? port.type;
  const baseOriginalType = port.originalType ?? port.type;
  const next: PortDef = {
    ...port,
    originalType: baseOriginalType,
    effectiveType: baseType,
    typeSource: port.typeSource ?? getDefaultTypeSource(port),
    validate: augmentation.validate ?? port.validate,
    required: augmentation.required ?? port.required,
    enum: augmentation.enum ? [...augmentation.enum] : port.enum,
    description: augmentation.description ?? port.description,
  };

  const refinement = augmentation.typeRefinement;
  if (!refinement) {
    return {
      ...next,
      type: next.effectiveType,
    };
  }

  const normalizedFrom = normalizeForRefinement(typeRegistry, refinement.from);
  const normalizedBaseType = normalizeForRefinement(typeRegistry, baseType);
  if (normalizedFrom && normalizedFrom !== normalizedBaseType) {
    diagnostics.push(
      createAugmentationDiagnostic({
        code: "BT119_INVALID_TYPE_REFINEMENT",
        message: `invalid type refinement for port \`${port.name}\` on node \`${model.id}\``,
        help: `make \`typeRefinement.from\` match the base port type \`${baseType ?? "unknown"}\`, or remove it for an unconditional refinement`,
        model,
        port,
        data: {
          kind: "invalid-type-refinement",
          nodeId: model.id,
          portName: port.name,
          expectedFrom: baseType,
          actualFrom: refinement.from,
          to: refinement.to,
        },
        notes:
          baseType || refinement.from
            ? [
                `base type: ${baseType ?? "(unspecified)"}`,
                `requested from: ${refinement.from ?? "(unspecified)"}`,
              ]
            : undefined,
      }),
    );

    return {
      ...next,
      type: next.effectiveType,
    };
  }

  return {
    ...next,
    type: refinement.to,
    effectiveType: refinement.to,
    typeSource: "model-augmentation",
    typeRefinement: refinement,
  };
}

function applyNodeAugmentation(
  typeRegistry: TypeRegistry,
  model: TreeNodeModelDef,
  augmentation: NonNullable<ModelAugmentationFile["augment"]>[string],
  diagnostics: Diagnostic[],
): TreeNodeModelDef {
  const portsByName = new Map(model.ports.map((port) => [port.name, port] as const));

  for (const [portName, portAugmentation] of Object.entries(augmentation.ports ?? {})) {
    const port = portsByName.get(portName);
    if (!port) {
      diagnostics.push(
        createAugmentationDiagnostic({
          code: "BT118_AUGMENT_PORT_NOT_FOUND",
          message: `augmentation port \`${portName}\` not found on node \`${model.id}\``,
          help: `change the augmentation to an existing port on \`${model.id}\` or remove the override`,
          model,
          data: {
            kind: "augment-port-not-found",
            nodeId: model.id,
            portName,
          },
        }),
      );
      continue;
    }

    portsByName.set(
      portName,
      applyPortAugmentation(typeRegistry, model, port, portAugmentation, diagnostics),
    );
  }

  return {
    ...model,
    ports: model.ports.map((port) => portsByName.get(port.name) ?? port),
  };
}

function initializeEffectivePort(port: PortDef): PortDef {
  const effectiveType = port.effectiveType ?? port.type;
  const originalType = port.originalType ?? port.type;

  return {
    ...port,
    type: effectiveType,
    effectiveType,
    originalType,
    typeSource: port.typeSource ?? getDefaultTypeSource(port),
  };
}

export function buildEffectiveModels(
  baseModelsById: ReadonlyMap<string, TreeNodeModelDef>,
  typeRegistry: TypeRegistry,
  augmentations: readonly ModelAugmentationFile[],
): EffectiveModelBuildResult {
  const diagnostics: Diagnostic[] = [];
  const modelsById = new Map<string, TreeNodeModelDef>(
    [...baseModelsById.entries()].map(([id, model]) => [
      id,
      {
        ...model,
        ports: model.ports.map(initializeEffectivePort),
      },
    ]),
  );

  for (const augmentationFile of augmentations) {
    for (const [nodeId, nodeAugmentation] of Object.entries(augmentationFile.augment ?? {})) {
      const model = modelsById.get(nodeId);
      if (!model) {
        diagnostics.push(
          createDiagnostic(
            "BT117_AUGMENT_TARGET_NOT_FOUND",
            DiagnosticSeverity.Error,
            `augmentation target node \`${nodeId}\` not found`,
            undefined,
            augmentationFile.uri ?? "",
            {
              primaryLabel: `augmentation target \`${nodeId}\` does not match any node model`,
              help: "change the augmentation target to an existing node model or remove it",
              notes: augmentationFile.path
                ? [`augmentation file: ${augmentationFile.path}`]
                : undefined,
            },
            {
              kind: "augment-target-not-found",
              nodeId,
              filePath: augmentationFile.path,
            },
          ),
        );
        continue;
      }

      modelsById.set(
        nodeId,
        applyNodeAugmentation(typeRegistry, model, nodeAugmentation, diagnostics),
      );
    }
  }

  return { modelsById, diagnostics };
}
