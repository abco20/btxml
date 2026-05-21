import {
  generatedBtcppBuiltinCatalogs,
  generatedBtcppBuiltinVersions,
  generatedDefaultBtcppBuiltinVersion,
} from "./generated/btcpp-builtins-registry.js";
import type {
  GeneratedBtcppBuiltinVersion,
  GeneratedBuiltinModelSet,
} from "./generated/btcpp-builtins-registry.js";
import type { BuiltinNodeDef, PortDef, TreeNodeModelDef } from "./public-types.js";

type GeneratedBuiltinPortLike = {
  name: string;
  direction: "input" | "output" | "inout";
  type?: string;
  defaultValue?: string;
  description?: string;
  required: boolean;
  enum?: readonly string[];
};

type GeneratedBuiltinModelLike = {
  id: string;
  kind: "Action" | "Condition" | "Control" | "Decorator" | "SubTree";
  ports: readonly GeneratedBuiltinPortLike[];
};

export type BuiltinModelSet = "btcpp-v4" | GeneratedBuiltinModelSet;
type VersionedBuiltinModelSet = GeneratedBuiltinModelSet;

export const SUPPORTED_VERSIONED_BTCPP_MODEL_SETS = generatedBtcppBuiltinVersions.map(
  (version) => `btcpp-v${version}`,
) as [VersionedBuiltinModelSet, ...VersionedBuiltinModelSet[]];

export const SUPPORTED_BUILTIN_MODEL_SETS = [
  "btcpp-v4",
  ...SUPPORTED_VERSIONED_BTCPP_MODEL_SETS,
] as [BuiltinModelSet, ...BuiltinModelSet[]];

export const DEFAULT_BTCPP_V4_MODEL_SET =
  `btcpp-v${generatedDefaultBtcppBuiltinVersion}` as const satisfies VersionedBuiltinModelSet;

function generatedPortToPortDef(port: GeneratedBuiltinPortLike): PortDef {
  return {
    source: "builtin",
    direction: port.direction,
    name: port.name,
    type: port.type,
    defaultValue: port.defaultValue,
    description: port.description,
    required: port.required,
    enum: port.enum,
  };
}

function normalizeBuiltinCatalog(models: readonly GeneratedBuiltinModelLike[]) {
  return models.map(
    (model): BuiltinNodeDef => ({
      id: model.id,
      kind: model.kind,
      ports: model.ports.map(generatedPortToPortDef),
    }),
  );
}

function normalizeGenericSubTreeModel(
  model: GeneratedBuiltinModelLike | undefined,
): BuiltinNodeDef | undefined {
  if (!model) {
    return undefined;
  }

  return {
    id: model.id,
    kind: model.kind,
    ports: model.ports.map(generatedPortToPortDef),
  };
}

function buildBuiltinNodeCatalogBySet(): Record<
  VersionedBuiltinModelSet,
  readonly BuiltinNodeDef[]
> {
  const result = {} as Record<VersionedBuiltinModelSet, readonly BuiltinNodeDef[]>;

  for (const [version, catalog] of Object.entries(generatedBtcppBuiltinCatalogs)) {
    result[`btcpp-v${version}` as VersionedBuiltinModelSet] = normalizeBuiltinCatalog(
      catalog.models,
    );
  }

  return result;
}

function buildGenericSubTreeBySet(): Record<VersionedBuiltinModelSet, BuiltinNodeDef | undefined> {
  const result = {} as Record<VersionedBuiltinModelSet, BuiltinNodeDef | undefined>;

  for (const [version, catalog] of Object.entries(generatedBtcppBuiltinCatalogs)) {
    result[`btcpp-v${version}` as VersionedBuiltinModelSet] = normalizeGenericSubTreeModel(
      catalog.genericSubTreeModel,
    );
  }

  return result;
}

const builtinNodeCatalogBySet = buildBuiltinNodeCatalogBySet();
const genericSubTreeBySet = buildGenericSubTreeBySet();

function isGeneratedBuiltinModelSet(set: string): set is VersionedBuiltinModelSet {
  const version = set.replace(/^btcpp-v/, "");
  return Object.hasOwn(generatedBtcppBuiltinCatalogs, version);
}

function resolveBuiltinModelSet(set: BuiltinModelSet): VersionedBuiltinModelSet {
  return set === "btcpp-v4" ? DEFAULT_BTCPP_V4_MODEL_SET : set;
}

function resolveBuiltinModelVersion(set: BuiltinModelSet): GeneratedBtcppBuiltinVersion {
  if (set === "btcpp-v4") {
    return generatedDefaultBtcppBuiltinVersion;
  }

  return set.replace(/^btcpp-v/, "") as GeneratedBtcppBuiltinVersion;
}

function assertBuiltinModelSet(set: BuiltinModelSet | undefined): void {
  if (set && set !== "btcpp-v4" && !isGeneratedBuiltinModelSet(set)) {
    throw new Error(`unsupported builtin model set: ${set}`);
  }
}

export function listBuiltinNodeModels(
  set: BuiltinModelSet = "btcpp-v4",
): readonly TreeNodeModelDef[] {
  assertBuiltinModelSet(set);
  const resolvedSet = resolveBuiltinModelSet(set);
  const catalog = builtinNodeCatalogBySet[resolvedSet];
  return catalog.map((def) => builtinToNodeModel(def));
}

export function listChildCapableBuiltinNodeIds(
  set: BuiltinModelSet = "btcpp-v4",
): readonly string[] {
  return listBuiltinNodeModels(set)
    .filter((model) => model.kind === "Control" || model.kind === "Decorator")
    .map((model) => model.id);
}

export function getBuiltinNodeModel(
  id: string,
  set: BuiltinModelSet = "btcpp-v4",
): TreeNodeModelDef | undefined {
  assertBuiltinModelSet(set);
  const resolvedSet = resolveBuiltinModelSet(set);
  const catalog = builtinNodeCatalogBySet[resolvedSet];
  const builtin = catalog.find((model) => model.id === id);
  return builtin ? builtinToNodeModel(builtin) : undefined;
}

export function getGenericSubTreePorts(set: BuiltinModelSet = "btcpp-v4"): readonly PortDef[] {
  assertBuiltinModelSet(set);
  const genericModel =
    genericSubTreeBySet[resolveBuiltinModelSet(set)] ??
    normalizeGenericSubTreeModel(
      generatedBtcppBuiltinCatalogs[resolveBuiltinModelVersion(set)].genericSubTreeModel,
    );
  if (!genericModel) {
    return [];
  }

  return (genericModel.ports ?? []).map((port) => ({
    ...port,
    enum: port.enum ? [...port.enum] : undefined,
  }));
}

export function builtinToNodeModel(def: BuiltinNodeDef): TreeNodeModelDef {
  return {
    id: def.id,
    kind: def.kind,
    source: "builtin",
    sourceMeta: { sourceKind: "builtin" },
    editable: false,
    ports: (def.ports ?? []).map((port) => ({
      ...port,
      enum: port.enum ? [...port.enum] : undefined,
    })),
  };
}
