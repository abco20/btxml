import {
  type ResolvedTypeDefinition,
  type TypeRegistry,
  areTypesCompatible as areModelTypesCompatible,
  createTypeRegistry,
  resolveTypeDefinition,
} from "@btxml/model";
import { parseScript } from "../parser.js";
import { analyzeScript } from "./infer.js";
import type {
  CreateScriptEnvironmentInput,
  ScriptEnvironment,
  ScriptEnvironmentSymbolInput,
  ScriptFlowEntry,
  ScriptFlowEntryResult,
  ScriptSymbol,
  ScriptType,
} from "./types.js";

const scriptNumberCanonicals = new Set([
  "int8_t",
  "std::int8_t",
  "int16_t",
  "std::int16_t",
  "int32",
  "int32_t",
  "std::int32_t",
  "int64",
  "int64_t",
  "std::int64_t",
  "int",
  "long",
  "short",
  "uint8_t",
  "std::uint8_t",
  "uint16_t",
  "std::uint16_t",
  "uint32",
  "uint32_t",
  "std::uint32_t",
  "uint64",
  "uint64_t",
  "std::uint64_t",
  "uint",
  "unsigned",
  "unsigned int",
  "size_t",
  "std::size_t",
  "float",
  "double",
]);

export function createScriptEnvironment(
  input: CreateScriptEnvironmentInput = {},
): ScriptEnvironment {
  const registry = createTypeRegistry(input.augmentations ?? []);
  const areTypesCompatible =
    input.areTypesCompatible ??
    ((left: string | undefined, right: string | undefined) =>
      areModelTypesCompatible(registry, left, right));
  const compatibilityKeys = new Map<string, string | undefined>();
  const globalCompatibilityKeys = new Map<string, string | undefined>();
  const environment: ScriptEnvironment = {
    symbols: new Map(),
    globalBlackboard: new Map(),
    enums: normalizeEnums(input.enums, input.augmentations ?? []),
  };

  for (const symbol of input.symbols ?? []) {
    mergeScriptSymbol(environment.symbols, compatibilityKeys, symbol, areTypesCompatible);
  }

  for (const symbol of input.globalBlackboardSymbols ?? []) {
    mergeScriptSymbol(
      environment.globalBlackboard,
      globalCompatibilityKeys,
      symbol,
      areTypesCompatible,
    );
  }

  return environment;
}

export function cloneScriptEnvironment(environment?: ScriptEnvironment): ScriptEnvironment {
  return {
    symbols: new Map(
      [...(environment?.symbols.entries() ?? [])].map(([name, symbol]) => [name, { ...symbol }]),
    ),
    globalBlackboard: new Map(
      [...(environment?.globalBlackboard.entries() ?? [])].map(([name, symbol]) => [
        name,
        { ...symbol },
      ]),
    ),
    enums: new Map(environment?.enums ?? []),
  };
}

export function analyzeScriptFlow<TId = string>(input: {
  baseEnvironment?: ScriptEnvironment;
  entries: readonly ScriptFlowEntry<TId>[];
}): ScriptFlowEntryResult<TId>[] {
  const environment = cloneScriptEnvironment(input.baseEnvironment);
  const results: ScriptFlowEntryResult<TId>[] = [];

  for (const entry of input.entries) {
    const environmentBefore = cloneScriptEnvironment(environment);
    const parseResult = entry.parseResult ?? parseScript(entry.source);
    let environmentAfter = cloneScriptEnvironment(environmentBefore);
    let analysis: ScriptFlowEntryResult<TId>["analysis"];

    if (parseResult.ok) {
      analysis = analyzeScript({
        program: parseResult.program,
        environment: environmentBefore,
        attributeName: entry.attributeName,
        originId: entry.originId ?? String(entry.id),
      });
      environmentAfter = cloneScriptEnvironment(analysis.environment);
    }

    results.push({
      id: entry.id,
      parseResult,
      environmentBefore,
      environmentAfter,
      ...(analysis ? { analysis } : {}),
    });

    environment.symbols.clear();
    environment.globalBlackboard.clear();
    environment.enums.clear();
    for (const [name, symbol] of environmentAfter.symbols) {
      environment.symbols.set(name, { ...symbol });
    }
    for (const [name, symbol] of environmentAfter.globalBlackboard) {
      environment.globalBlackboard.set(name, { ...symbol });
    }
    for (const [name, value] of environmentAfter.enums) {
      environment.enums.set(name, value);
    }
  }

  return results;
}

export function collectScriptEnums(
  augmentations: readonly { version?: number; script?: { enums?: Record<string, number> } }[],
) {
  const enums = new Map<string, number>();

  for (const augmentation of augmentations) {
    for (const [name, value] of Object.entries(augmentation.script?.enums ?? {})) {
      enums.set(name, value);
    }
  }

  return enums;
}

export function scriptTypeFromTypeName(
  registry: TypeRegistry,
  typeName: string | undefined,
): ScriptType {
  const resolved = resolveTypeDefinition(registry, typeName);
  return scriptTypeFromResolvedType(typeName, resolved);
}

export function scriptTypeFromResolvedType(
  typeName: string | undefined,
  resolved: ResolvedTypeDefinition | undefined,
): ScriptType {
  if (!typeName || !resolved) return { kind: "unknown" };
  if (resolved.kind === "any") return { kind: "any" };

  const canonical = resolved.canonical.toLowerCase();
  if (canonical === "bool") return { kind: "bool" };
  if (canonical === "std::string" || canonical === "string") return { kind: "string" };
  if (scriptNumberCanonicals.has(canonical)) return { kind: "number" };

  return {
    kind: "custom",
    name: resolved.name ?? typeName,
    canonical: resolved.canonical,
  };
}

export function areScriptTypesCompatible(left: ScriptType, right: ScriptType): boolean {
  if (left.kind === "any" || right.kind === "any") return true;
  if (left.kind === "unknown" || right.kind === "unknown") return true;
  if (left.kind === "error" || right.kind === "error") return true;

  if (left.kind === "custom" && right.kind === "custom") {
    return left.canonical === right.canonical;
  }

  return left.kind === right.kind;
}

export function isScriptTypeAssignable(target: ScriptType, source: ScriptType): boolean {
  if (target.kind === "any" || source.kind === "any") return true;
  if (target.kind === "unknown" || source.kind === "unknown") return true;
  if (target.kind === "error" || source.kind === "error") return true;

  if (target.kind === "custom" || source.kind === "custom") {
    return target.kind === "custom" && source.kind === "custom"
      ? target.canonical === source.canonical
      : false;
  }

  if (target.kind === "bool" && source.kind === "number") return true;
  return target.kind === source.kind;
}

export function isScriptTypeBoolCompatible(type: ScriptType): boolean {
  return (
    type.kind === "bool" ||
    type.kind === "number" ||
    type.kind === "unknown" ||
    type.kind === "any" ||
    type.kind === "error"
  );
}

export function commonScriptType(left: ScriptType, right: ScriptType): ScriptType | undefined {
  if (left.kind === "error" || right.kind === "error") return { kind: "error" };
  if (left.kind === "unknown" || right.kind === "unknown") return { kind: "unknown" };
  if (left.kind === "any" || right.kind === "any") {
    return left.kind === right.kind ? left : { kind: "unknown" };
  }

  if (left.kind === "custom" || right.kind === "custom") {
    return left.kind === "custom" && right.kind === "custom" && left.canonical === right.canonical
      ? left
      : undefined;
  }

  return left.kind === right.kind ? left : undefined;
}

function normalizeEnums(
  enums: CreateScriptEnvironmentInput["enums"],
  augmentations: CreateScriptEnvironmentInput["augmentations"],
) {
  if (enums instanceof Map) {
    return new Map(enums);
  }

  const collected = collectScriptEnums(augmentations ?? []);
  for (const [name, value] of Object.entries(enums ?? {})) {
    collected.set(name, value);
  }
  return collected;
}

function mergeScriptSymbol(
  target: Map<string, ScriptSymbol>,
  compatibilityKeys: Map<string, string | undefined>,
  next: ScriptEnvironmentSymbolInput,
  areTypesCompatible: (left: string | undefined, right: string | undefined) => boolean,
) {
  const existing = target.get(next.name);
  if (!existing) {
    target.set(next.name, {
      name: next.name,
      type: next.type,
      source: next.source,
      writable: next.writable,
      readable: next.readable,
    });
    compatibilityKeys.set(next.name, next.compatibilityKey);
    return;
  }

  const existingCompatibilityKey = compatibilityKeys.get(next.name);
  const conflict =
    existing.conflict === true ||
    (existingCompatibilityKey !== undefined &&
      next.compatibilityKey !== undefined &&
      !areTypesCompatible(existingCompatibilityKey, next.compatibilityKey)) ||
    !areScriptTypesCompatible(existing.type, next.type);

  target.set(next.name, {
    ...existing,
    readable: existing.readable || next.readable,
    writable: existing.writable || next.writable,
    conflict,
  });

  if (existingCompatibilityKey === undefined) {
    compatibilityKeys.set(next.name, next.compatibilityKey);
  }
}
