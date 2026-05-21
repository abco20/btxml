import {
  type ResolvedTypeDefinition,
  type TypeRegistry,
  areTypesCompatible as areModelTypesCompatible,
  normalizeTypeName as normalizeModelTypeName,
  resolveTypeDefinition as resolveModelTypeDefinition,
} from "@btxml/model";
import type { SemanticIndexState } from "./internal-types.js";
import type { SemanticIndex } from "./types.js";

function asSemanticIndexState(index: SemanticIndex): SemanticIndexState {
  return index as SemanticIndexState;
}

export function getTypeRegistry(index: SemanticIndex): TypeRegistry {
  return asSemanticIndexState(index).typeRegistry;
}

export function getTypeDefinition(
  index: SemanticIndex,
  name: string | undefined,
): ResolvedTypeDefinition | undefined {
  return resolveModelTypeDefinition(getTypeRegistry(index), name);
}

export function normalizeTypeName(
  index: SemanticIndex,
  name: string | undefined,
): string | undefined {
  return normalizeModelTypeName(getTypeRegistry(index), name);
}

export function areTypesCompatible(
  index: SemanticIndex,
  left: string | undefined,
  right: string | undefined,
): boolean {
  return areModelTypesCompatible(getTypeRegistry(index), left, right);
}
