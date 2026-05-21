import fs from "node:fs";
import path from "node:path";
import type { ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import { type BtxmlProject, getProjectConfig, getProjectResolvedConfig } from "@btxml/project";
import {
  type DiagnosticBaseline,
  diagnosticBaselineEntry,
  diagnosticBaselineSchema,
  getBaselinePath,
} from "@btxml/project";
import { getNodeProjectRootDir } from "@btxml/project/node";
import { CliError } from "./errors.ts";

type BaselineCommandOptions = {
  _?: string[];
  baseline?: string;
  updateBaseline?: string;
  noBaseline?: boolean;
  quiet?: boolean;
};

export function resolveBaseline(
  project: BtxmlProject,
  argv: BaselineCommandOptions,
): DiagnosticBaseline | undefined {
  const baselinePath =
    argv.baseline ||
    getBaselinePath(
      getProjectResolvedConfig(project) || (getProjectConfig(project) as ResolvedBtxmlConfig),
    );
  if (!baselinePath || argv.noBaseline) return undefined;
  const resolved = path.resolve(getNodeProjectRootDir(project), baselinePath);
  if (!fs.existsSync(resolved)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch {
    throw new CliError(`failed to read baseline file: ${resolved}`, 2);
  }
  const result = diagnosticBaselineSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError(`invalid baseline file: ${resolved}`, 2, result.error.issues[0]?.message);
  }
  return result.data;
}

export function maybeUpdateBaseline(
  project: BtxmlProject,
  argv: BaselineCommandOptions,
  allDiagnostics: Diagnostic[],
) {
  const updatePath = argv.updateBaseline;
  if (!updatePath || argv.noBaseline) return;
  const resolved = path.resolve(getNodeProjectRootDir(project), updatePath);
  const newBaseline = {
    version: 1,
    diagnostics: allDiagnostics.map((d) => diagnosticBaselineEntry(d)),
  };
  fs.writeFileSync(resolved, `${JSON.stringify(newBaseline, null, 2)}\n`, "utf8");
  if (!argv.quiet) console.log(`Baseline updated: ${updatePath}`);
}
