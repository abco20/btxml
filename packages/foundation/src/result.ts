// Placeholder for generic result types. Domain-specific results remain in types.ts for now.

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
