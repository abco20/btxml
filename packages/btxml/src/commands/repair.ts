import { type WorkspaceEdit, applyTextEdits } from "@btxml/foundation";
import {
  type BtxmlProject,
  getProjectResolvedConfig,
  loadProjectDocuments,
  loadProjectSemanticIndex,
} from "@btxml/project";
import {
  createNodeProjectHost,
  getNodeProjectDefinitionFiles,
  getNodeProjectModelFiles,
  getNodeProjectRootDir,
  getNodeProjectSelectedFiles,
} from "@btxml/project/node";
import type { BtDocument } from "@btxml/syntax";
import type { CommandModule } from "yargs";
import { runRepairCommand } from "../context.ts";
import { CliError } from "../errors.ts";
import { readText, writeTextAtomic } from "../io.ts";
import { parseCommandOptions } from "../options/common.ts";
import { repairOptionsSchema } from "../options/repair.ts";
import { promptSelect } from "../prompt.ts";
import {
  type RepairResult,
  isWritableRepairAction,
  printRepairGroupDetail,
  printRepairHuman,
  printRepairJson,
} from "../repair-output.ts";
import { buildModelConflictRepairGroups, formatEditSummary } from "../repair/model-conflicts.ts";
import type { ModelConflictGroup } from "../repair/types.ts";
import { groupWorkspaceEditsByUri } from "../repair/workspace-edit.ts";

type RepairRunOptions = {
  output: "human" | "json";
  write?: boolean;
  quiet?: boolean;
  show?: string;
  source?: "model-files";
  mode?: "auto" | "sync" | "dedupe";
};

function selectGroupByShow(
  groups: ModelConflictGroup[],
  show: string,
): ModelConflictGroup | undefined {
  const num = Number(show);
  if (!Number.isNaN(num) && num >= 1 && num <= groups.length) {
    return groups[num - 1];
  }
  return (
    groups.find((g) => g.displayName === show) ??
    groups.find((g) => g.nodeId === show && g.kind !== "duplicate-port-name")
  );
}

function dedupeDocumentsByUri(docs: BtDocument[]): BtDocument[] {
  const byUri = new Map<string, BtDocument>();
  for (const doc of docs) byUri.set(doc.uri, doc);
  return Array.from(byUri.values());
}

function loadDefinitionDocuments(project: BtxmlProject): BtDocument[] {
  return getNodeProjectDefinitionFiles(project).flatMap((file) => {
    try {
      return [
        {
          uri: file.path,
          path: file.absolutePath,
          kind: "generic-xml" as const,
          isBtXml: false,
          nodes: [],
          diagnostics: [],
          originalText: readText(file.absolutePath),
        },
      ];
    } catch {
      return [];
    }
  });
}

function resolveWorkspaceEditPath(project: BtxmlProject, uri: string): string {
  const candidates = [
    ...getNodeProjectSelectedFiles(project),
    ...getNodeProjectModelFiles(project),
    ...getNodeProjectDefinitionFiles(project),
  ];
  const file = candidates.find((f) => f.absolutePath === uri || f.path === uri);
  return file?.absolutePath ?? uri;
}

function applyWorkspaceEditsForProject(
  project: BtxmlProject,
  workspaceEdits: WorkspaceEdit[],
): void {
  for (const edit of groupWorkspaceEditsByUri(workspaceEdits)) {
    const filePath = resolveWorkspaceEditPath(project, edit.uri);
    const text = readText(filePath);
    const newText = applyTextEdits(text, edit.edits);
    writeTextAtomic(filePath, newText);
  }
}

function printWorkspaceEditPreview(project: BtxmlProject, workspaceEdits: WorkspaceEdit[]): void {
  for (const edit of groupWorkspaceEditsByUri(workspaceEdits)) {
    const filePath = resolveWorkspaceEditPath(project, edit.uri);
    const text = readText(filePath);
    console.log(`\n--- ${edit.uri} ---`);
    for (const te of edit.edits) {
      const before = text.slice(Math.max(0, te.range.start.offset - 40), te.range.start.offset);
      const after = text.slice(te.range.end.offset, te.range.end.offset + 40);
      console.log(`-${before}[...]${after}`);
      console.log(`+${before}${te.newText}${after}`);
    }
  }
  console.log("");
}

export async function runRepair(
  project: BtxmlProject,
  options: RepairRunOptions,
): Promise<RepairResult> {
  const host = createNodeProjectHost(getNodeProjectRootDir(project));
  const resolvedConfig = getProjectResolvedConfig(project);
  if (!resolvedConfig) {
    throw new Error("Invariant: resolvedConfig is required");
  }

  const canonicalSource = options.source;
  const explicitMode =
    options.mode === "dedupe" || options.mode === "sync" ? options.mode : undefined;
  const canonicalMode =
    canonicalSource === "model-files"
      ? (explicitMode ?? (resolvedConfig.models.convention === "single-source" ? "dedupe" : "sync"))
      : undefined;
  const includeConventionGroups =
    resolvedConfig.models.convention === "single-source" || canonicalMode === "dedupe";

  const loaded = await loadProjectDocuments(project, host);
  let { documents } = loaded;
  let { externalModelDocuments } = loaded;

  const repairDocuments = dedupeDocumentsByUri([
    ...documents,
    ...externalModelDocuments,
    ...loadDefinitionDocuments(project),
  ]);

  let semantic = await loadProjectSemanticIndex({
    project,
    documents,
    externalModelDocuments,
    host,
  });

  let groups = buildModelConflictRepairGroups({
    documents: repairDocuments,
    workspace: semantic.semanticIndex,
    project,
    options: {
      includeConventionGroups,
      convention: resolvedConfig.models.convention,
      canonicalSource,
      canonicalMode,
    },
  });

  if (options.show) {
    const group = selectGroupByShow(groups, options.show);
    if (!group) {
      throw new CliError(
        `error: no model group found for \`${options.show}\``,
        2,
        "run `btxmlc repair` to see available model groups",
      );
    }
    if (options.output === "json") {
      console.log(printRepairJson({ ok: false, groups: [group] }));
    } else {
      console.log(printRepairGroupDetail(group));
    }
    return { ok: false, groups: [group] };
  }

  let quitRequested = false;

  if (options.write) {
    if (process.stdin.isTTY !== true) {
      throw new CliError(
        "error: `btxmlc repair --write` requires an interactive terminal",
        2,
        "run `btxmlc repair --json` to inspect model conflicts in non-interactive environments",
      );
    }

    const skippedGroupIds = new Set<string>();

    while (true) {
      const reloaded = await loadProjectDocuments(project, host);
      documents = reloaded.documents;
      externalModelDocuments = reloaded.externalModelDocuments;
      const reloadedRepairDocuments = dedupeDocumentsByUri([
        ...documents,
        ...externalModelDocuments,
        ...loadDefinitionDocuments(project),
      ]);
      semantic = await loadProjectSemanticIndex({
        project,
        documents,
        externalModelDocuments,
        host,
      });
      groups = buildModelConflictRepairGroups({
        documents: reloadedRepairDocuments,
        workspace: semantic.semanticIndex,
        project,
        options: {
          includeConventionGroups,
          convention: resolvedConfig.models.convention,
          canonicalSource,
          canonicalMode,
        },
      });

      const remaining = groups.filter((g) => !skippedGroupIds.has(g.id));
      if (remaining.length === 0) break;

      const group = remaining[0];

      if (options.output === "human" && !options.quiet) {
        console.log(
          printRepairGroupDetail(group, {
            index: groups.indexOf(group) + 1,
            total: groups.length,
          }),
        );
      }

      const writableActions = group.actions.filter(isWritableRepairAction);

      const actionChoices = writableActions.map((a) => ({
        label: a.title,
        value: a.id,
        description: formatEditSummary(a.editSummary),
      }));

      const choices = [
        ...actionChoices,
        ...(writableActions.length > 0
          ? [{ label: "Preview an action", value: "preview", description: "" }]
          : []),
        { label: "Skip this model group", value: "skip", description: "" },
        { label: "Quit", value: "quit", description: "" },
      ];

      const selectedId = await promptSelect({
        message: `Resolve \`${group.displayName}\``,
        choices,
      });

      if (selectedId === "quit") {
        quitRequested = true;
        break;
      }

      if (selectedId === "skip") {
        skippedGroupIds.add(group.id);
        continue;
      }

      if (selectedId === "preview") {
        const previewChoices = writableActions.map((a) => ({
          label: a.title,
          value: a.id,
          description: formatEditSummary(a.editSummary),
        }));
        previewChoices.push({ label: "Back", value: "back", description: "" });

        const previewId = await promptSelect({
          message: "Preview which action?",
          choices: previewChoices,
        });

        if (previewId === "back") continue;

        const previewAction = group.actions.find((a) => a.id === previewId);
        if (previewAction && options.output === "human" && !options.quiet) {
          console.log(`\nEdit preview for: ${previewAction.title}`);
          printWorkspaceEditPreview(project, previewAction.workspaceEdits);
        }
        continue;
      }

      const action = group.actions.find((a) => a.id === selectedId);
      if (!action || !isWritableRepairAction(action)) {
        skippedGroupIds.add(group.id);
        continue;
      }

      // Confirm before applying
      const confirmChoices = [
        {
          label: "Apply",
          value: "apply",
          description: formatEditSummary(action.editSummary),
        },
        { label: "Show edit preview", value: "preview", description: "" },
        { label: "Back", value: "back", description: "" },
      ];

      const confirm = await promptSelect({
        message: `Apply edits for \`${group.displayName}\`?`,
        choices: confirmChoices,
      });

      if (confirm === "back") continue;
      if (confirm === "preview") {
        console.log(`\nEdit preview for: ${action.title}`);
        printWorkspaceEditPreview(project, action.workspaceEdits);
        continue;
      }

      // Apply edits (grouped by URI)
      applyWorkspaceEditsForProject(project, action.workspaceEdits);
    }

    // Reload and re-check after fixes
    const reloaded = await loadProjectDocuments(project, host);
    documents = reloaded.documents;
    externalModelDocuments = reloaded.externalModelDocuments;
    const finalRepairDocuments = dedupeDocumentsByUri([...documents, ...externalModelDocuments]);
    semantic = await loadProjectSemanticIndex({
      project,
      documents,
      externalModelDocuments,
    });
    groups = buildModelConflictRepairGroups({
      documents: dedupeDocumentsByUri([
        ...finalRepairDocuments,
        ...loadDefinitionDocuments(project),
      ]),
      workspace: semantic.semanticIndex,
      project,
      options: {
        includeConventionGroups,
        convention: resolvedConfig.models.convention,
        canonicalSource,
        canonicalMode,
      },
    });

    if (quitRequested && groups.length > 0 && options.output === "human" && !options.quiet) {
      console.log(printRepairHuman({ ok: false, groups }));
    }
  }

  const ok = groups.length === 0;

  if (options.output === "json") {
    console.log(printRepairJson({ ok, groups }));
  } else if (!options.quiet) {
    if (options.write) {
      if (ok) {
        console.log("ok: all model conflicts resolved");
      } else if (!quitRequested) {
        console.log(printRepairHuman({ ok, groups }));
      }
    } else {
      console.log(printRepairHuman({ ok, groups }));
    }
  }

  return { ok, groups };
}

export const repairCommand: CommandModule = {
  command: "repair [files..]",
  describe: "Inspect and resolve conflicting node model signatures",
  builder: (yargs) =>
    yargs
      .positional("files", { type: "string", array: true })
      .option("config", { type: "string" })
      .option("project-root", { type: "string" })
      .option("no-config", { type: "boolean" })
      .option("quiet", { type: "boolean" })
      .option("verbose", { type: "boolean" })
      .option("no-color", { type: "boolean" })
      .option("output", { type: "string" })
      .option("json", { type: "boolean" })
      .option("write", { type: "boolean" })
      .option("show", { type: "string" })
      .option("source", { type: "string" })
      .option("mode", { type: "string" }),
  handler: async (argv) => {
    const options = parseCommandOptions(repairOptionsSchema, argv);
    process.exitCode = await runRepairCommand(options);
  },
};
