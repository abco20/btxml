import type {
  ModelAugmentationFile,
  TypeDefinition,
  TypeLiteralValidator,
} from "./public-types.js";

export type ResolvedTypeDefinition = {
  readonly name: string;
  readonly kind: "primitive" | "opaque" | "any";
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly compatibleWith: readonly string[];
  readonly validate?: TypeLiteralValidator;
  readonly source: "builtin" | "augmentation" | "custom";
};

export type TypeRegistry = {
  readonly entriesByCanonical: ReadonlyMap<string, ResolvedTypeDefinition>;
  readonly namesToCanonical: ReadonlyMap<string, string>;
};

type MutableResolvedTypeDefinition = {
  name: string;
  kind: "primitive" | "opaque" | "any";
  canonical: string;
  aliases: Set<string>;
  compatibleWith: Set<string>;
  validate?: TypeLiteralValidator;
  source: "builtin" | "augmentation" | "custom";
};

const BUILTIN_TYPE_SPECS = [
  {
    name: "std::string",
    kind: "primitive",
    aliases: ["string"],
  },
  {
    name: "bool",
    kind: "primitive",
    aliases: [],
  },
  {
    name: "int8_t",
    kind: "primitive",
    aliases: ["std::int8_t"],
  },
  {
    name: "int16_t",
    kind: "primitive",
    aliases: ["std::int16_t"],
  },
  {
    name: "int32",
    kind: "primitive",
    aliases: ["int", "int32_t", "std::int32_t"],
  },
  {
    name: "int64_t",
    kind: "primitive",
    aliases: ["long", "int64", "std::int64_t"],
  },
  {
    name: "short",
    kind: "primitive",
    aliases: [],
  },
  {
    name: "uint8_t",
    kind: "primitive",
    aliases: ["std::uint8_t"],
  },
  {
    name: "uint16_t",
    kind: "primitive",
    aliases: ["std::uint16_t"],
  },
  {
    name: "uint32",
    kind: "primitive",
    aliases: ["uint", "unsigned", "unsigned int", "uint32_t", "std::uint32_t"],
  },
  {
    name: "uint64_t",
    kind: "primitive",
    aliases: ["uint64", "std::uint64_t", "size_t", "std::size_t"],
  },
  {
    name: "float",
    kind: "primitive",
    aliases: [],
  },
  {
    name: "double",
    kind: "primitive",
    aliases: [],
  },
  {
    name: "BT::NodeStatus",
    kind: "primitive",
    aliases: ["NodeStatus"],
  },
  {
    name: "BT::Any",
    kind: "any",
    aliases: ["BT::AnyTypeAllowed", "BT::AnyType", "Any"],
  },
] as const satisfies ReadonlyArray<{
  name: string;
  kind: "primitive" | "any";
  aliases: readonly string[];
}>;

const builtinNamesToCanonical = new Map<string, string>();
const builtinEntriesByCanonical = new Map<string, ResolvedTypeDefinition>();

for (const spec of BUILTIN_TYPE_SPECS) {
  const entry: ResolvedTypeDefinition = {
    name: spec.name,
    kind: spec.kind,
    canonical: spec.name,
    aliases: spec.aliases,
    compatibleWith: [],
    source: "builtin",
  };
  builtinEntriesByCanonical.set(spec.name, entry);
  builtinNamesToCanonical.set(spec.name, spec.name);
  for (const alias of spec.aliases) {
    builtinNamesToCanonical.set(alias, spec.name);
  }
}

function toMutableEntry(
  name: string,
  canonical: string,
  definition: TypeDefinition,
): MutableResolvedTypeDefinition {
  return {
    name,
    kind: definition.kind,
    canonical,
    aliases: new Set([name, canonical, ...(definition.aliases ?? [])]),
    compatibleWith: new Set(definition.compatibleWith ?? []),
    validate: definition.validate,
    source: "augmentation",
  };
}

function normalizeTypeLikeName(name: string): string {
  return builtinNamesToCanonical.get(name) ?? name;
}

function finalizeEntry(entry: MutableResolvedTypeDefinition): ResolvedTypeDefinition {
  return {
    name: entry.name,
    kind: entry.kind,
    canonical: entry.canonical,
    aliases: [...entry.aliases].filter((alias) => alias !== entry.canonical),
    compatibleWith: [...entry.compatibleWith],
    validate: entry.validate,
    source: entry.source,
  };
}

export function normalizeBuiltinTypeName(name: string): string | undefined {
  return builtinNamesToCanonical.get(name);
}

export function isAnyTypeName(name: string): boolean {
  return resolveTypeDefinition(createTypeRegistry(), name)?.kind === "any";
}

export function createTypeRegistry(
  augmentations: readonly ModelAugmentationFile[] = [],
): TypeRegistry {
  const entriesByCanonical = new Map<string, MutableResolvedTypeDefinition>();
  const namesToCanonical = new Map(builtinNamesToCanonical);

  for (const builtin of builtinEntriesByCanonical.values()) {
    entriesByCanonical.set(builtin.canonical, {
      name: builtin.name,
      kind: builtin.kind,
      canonical: builtin.canonical,
      aliases: new Set([builtin.name, builtin.canonical, ...builtin.aliases]),
      compatibleWith: new Set(builtin.compatibleWith),
      validate: builtin.validate,
      source: builtin.source,
    });
  }

  for (const augmentation of augmentations) {
    for (const [name, definition] of Object.entries(augmentation.types ?? {})) {
      const canonical = normalizeTypeLikeName(definition.canonical ?? name);
      const existing = entriesByCanonical.get(canonical);
      const next = existing ?? toMutableEntry(name, canonical, definition);

      next.name = name;
      next.kind = definition.kind;
      next.canonical = canonical;
      next.source = "augmentation";
      next.validate = definition.validate ?? next.validate;
      next.aliases.add(name);
      next.aliases.add(canonical);
      for (const alias of definition.aliases ?? []) {
        next.aliases.add(alias);
      }
      for (const compatible of definition.compatibleWith ?? []) {
        next.compatibleWith.add(compatible);
      }

      entriesByCanonical.set(canonical, next);
      namesToCanonical.set(name, canonical);
      namesToCanonical.set(canonical, canonical);
      for (const alias of definition.aliases ?? []) {
        namesToCanonical.set(alias, canonical);
      }
    }
  }

  for (const entry of entriesByCanonical.values()) {
    entry.compatibleWith = new Set(
      [...entry.compatibleWith].map(
        (name) => namesToCanonical.get(name) ?? normalizeTypeLikeName(name),
      ),
    );
    entry.compatibleWith.delete(entry.canonical);
  }

  return {
    entriesByCanonical: new Map(
      [...entriesByCanonical.entries()].map(([canonical, entry]) => [
        canonical,
        finalizeEntry(entry),
      ]),
    ),
    namesToCanonical,
  };
}

export function resolveTypeDefinition(
  registry: TypeRegistry,
  name: string | undefined,
): ResolvedTypeDefinition | undefined {
  if (!name) {
    return undefined;
  }

  const canonical = registry.namesToCanonical.get(name) ?? normalizeTypeLikeName(name);
  const resolved = registry.entriesByCanonical.get(canonical);
  if (resolved) {
    return resolved;
  }

  return {
    name,
    kind: "opaque",
    canonical,
    aliases: [],
    compatibleWith: [],
    source: "custom",
  };
}

export function normalizeTypeName(
  registry: TypeRegistry,
  name: string | undefined,
): string | undefined {
  return resolveTypeDefinition(registry, name)?.canonical;
}

export function areTypesCompatible(
  registry: TypeRegistry,
  left: string | undefined,
  right: string | undefined,
): boolean {
  const leftType = resolveTypeDefinition(registry, left);
  const rightType = resolveTypeDefinition(registry, right);

  if (!leftType || !rightType) {
    return false;
  }

  if (leftType.kind === "any" || rightType.kind === "any") {
    return true;
  }

  if (leftType.canonical === rightType.canonical) {
    return true;
  }

  return (
    leftType.compatibleWith.includes(rightType.canonical) ||
    rightType.compatibleWith.includes(leftType.canonical)
  );
}
