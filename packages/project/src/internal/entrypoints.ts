import { RuleCodes } from "@btxml/analyzer/rules";
import type { ResolvedBtxmlConfig, ResolvedResolverConfig } from "@btxml/config";
import { type Diagnostic, DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import type { ProjectHost } from "../host.js";
import type { Entrypoint } from "../types.js";
import { joinUri } from "../uri.js";
import { toPosix } from "./files.js";

export function normalizeEntrypoints(resolverConfig: ResolvedResolverConfig): Entrypoint[] {
  return resolverConfig.entrypoints.map((entry) => ({ file: toPosix(entry) }));
}

export type ProjectResolutionMode = "workspace" | "entrypoints" | "single-file";

export function getProjectResolutionMode(config: ResolvedBtxmlConfig): "workspace" | "entrypoints" {
  const hasEntrypoints = config.resolver.entrypoints.length > 0;
  const resolutionMode = hasEntrypoints ? "entrypoints" : "workspace";
  return resolutionMode;
}

export async function validateEntrypoints(
  rootUri: string,
  entrypoints: Entrypoint[],
  configUri: string,
  host: ProjectHost,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const entry of entrypoints) {
    if (!(await host.exists(joinUri(rootUri, entry.file)))) {
      diagnostics.push(
        createDiagnostic(
          RuleCodes.EntrypointNotFound,
          DiagnosticSeverity.Error,
          `entrypoint file not found \`${entry.file}\``,
          undefined,
          configUri,
          {
            help: "check `resolver.entrypoints` and make sure the file exists under the project root",
          },
        ),
      );
    }
  }
  return diagnostics;
}
