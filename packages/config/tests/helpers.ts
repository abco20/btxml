import assert from "node:assert/strict";

import { type ConfigDiagnostic, type RawBtxmlConfig, parseBtxmlConfig } from "@btxml/config";

export function assertValidRuntimeConfig(config: unknown): RawBtxmlConfig {
  const result = parseBtxmlConfig(config);

  assert.equal(result.ok, true, result.ok ? undefined : formatDiagnostics(result.diagnostics));

  return result.value;
}

export function assertInvalidRuntimeConfig(
  config: unknown,
  expectedCode?: string,
): ConfigDiagnostic[] {
  const result = parseBtxmlConfig(config);

  assert.equal(result.ok, false, "expected config to be invalid");

  if (expectedCode) {
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.code === expectedCode),
      `expected diagnostic ${expectedCode}, got ${formatDiagnostics(result.diagnostics)}`,
    );
  }

  return result.diagnostics;
}

export function formatDiagnostics(diagnostics: readonly ConfigDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const path = diagnostic.path ? ` at ${diagnostic.path}` : "";
      return `${diagnostic.code}${path}: ${diagnostic.message}`;
    })
    .join("\n");
}
