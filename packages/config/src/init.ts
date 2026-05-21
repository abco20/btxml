import type { RawBtxmlConfig } from "./types.js";

const DEFAULT_SCHEMA_URL =
  "https://unpkg.com/@abco20/btxml-checker/schemas/btxml.config.schema.json";

export function createInitConfig(): RawBtxmlConfig {
  return {
    $schema: DEFAULT_SCHEMA_URL,
  };
}
