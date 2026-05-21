import { validateRawConfigRules } from "@btxml/analyzer/rules";
import { parseBtxmlConfig } from "@btxml/config";
import type { ConfigDiagnostic, RawBtxmlConfig } from "@btxml/config";
import { DiagnosticSeverity, createDiagnostic as diagnostic } from "@btxml/foundation";
import type { LoadConfigInput, LoadConfigResult } from "./types.js";
import { projectUriOps } from "./uri.js";

async function findUpwardUri(startUri: string, names: string[], host: LoadConfigInput["host"]) {
  let current = startUri;
  while (true) {
    for (const name of names) {
      const candidate = projectUriOps.join(current, name);
      if (await host.exists(candidate)) return candidate;
    }
    const parent = projectUriOps.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function findBtxmlConfigFile(startUri: string, host: LoadConfigInput["host"]) {
  return findUpwardUri(startUri, ["btxml.config.json"], host);
}

async function readJson(fileUri: string, host: LoadConfigInput["host"]) {
  return JSON.parse(await host.readFile(fileUri));
}

function toDiagnostics(diagnostics: ConfigDiagnostic[], configUri?: string) {
  return diagnostics.map((entry) =>
    diagnostic(
      entry.code,
      entry.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      entry.message,
      undefined,
      configUri ?? "",
      entry.help ? { help: entry.help } : undefined,
    ),
  );
}

export async function loadBtxmlConfig(input: LoadConfigInput): Promise<LoadConfigResult> {
  return discoverBtxmlConfig(input);
}

export async function discoverBtxmlConfig(input: LoadConfigInput): Promise<LoadConfigResult> {
  if (input.noConfig) return { ok: true, config: {}, diagnostics: [] };

  let configUri = input.configUri;
  let raw: unknown = {};

  if (!configUri) configUri = await findBtxmlConfigFile(input.startUri, input.host);

  if (configUri) {
    if (!(await input.host.exists(configUri))) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            "CFG006_CONFIG_PATH_NOT_FOUND",
            DiagnosticSeverity.Error,
            `config file not found \`${configUri}\``,
            undefined,
            configUri,
            {
              help: "check the `--config` path or run without `--config` to use config discovery",
            },
          ),
        ],
      };
    }

    try {
      raw = await readJson(configUri, input.host);
    } catch (error) {
      const errorMessage = String((error as Error).message || error);
      return {
        ok: false,
        configUri,
        diagnostics: [
          diagnostic(
            "CFG001_INVALID_CONFIG_JSON",
            DiagnosticSeverity.Error,
            "invalid configuration JSON",
            undefined,
            configUri,
            {
              primaryLabel: "the config file could not be parsed as JSON",
              help: "fix the JSON syntax in the config file",
              notes: [errorMessage],
            },
          ),
        ],
      };
    }
  } else {
    const pkgUri = await findUpwardUri(input.startUri, ["package.json"], input.host);
    if (pkgUri) {
      try {
        const pkg = (await readJson(pkgUri, input.host)) as { btxml?: unknown };
        if (pkg.btxml) {
          raw = pkg.btxml;
          configUri = pkgUri;
        }
      } catch {
        raw = {};
      }
    }
  }

  const parsed = parseBtxmlConfig(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      configUri,
      diagnostics: toDiagnostics(parsed.diagnostics, configUri),
    };
  }

  const ruleDiagnostics = validateRawConfigRules(parsed.value);
  if (ruleDiagnostics.length > 0) {
    return {
      ok: false,
      configUri,
      diagnostics: toDiagnostics(ruleDiagnostics, configUri),
    };
  }

  return {
    ok: true,
    config: parsed.value as RawBtxmlConfig,
    configUri,
    diagnostics: [],
  };
}
