import { rawBtxmlConfigSchema } from "./schema.js";
import type { ConfigParseResult } from "./types.js";
import { zodIssuesToConfigDiagnostics } from "./zod-diagnostics.js";

export function parseBtxmlConfig(raw: unknown): ConfigParseResult {
  const result = rawBtxmlConfigSchema.safeParse(raw);

  if (!result.success) {
    return {
      ok: false,
      diagnostics: zodIssuesToConfigDiagnostics(result.error.issues),
    };
  }

  return {
    ok: true,
    value: result.data,
    diagnostics: [],
  };
}
