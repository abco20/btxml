import type { RawBtxmlConfig } from "./types.js";

export function createInitConfig(): RawBtxmlConfig {
  return {
    $schema: "./node_modules/btxml/schemas/btxml.config.schema.json",
  };
}
