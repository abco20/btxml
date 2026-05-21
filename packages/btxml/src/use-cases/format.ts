import type { ResolvedBtxmlConfig } from "@btxml/config";
import { formatBtXml, getEffectiveConfigForFile } from "@btxml/core";
import { unifiedDiff } from "../diff.ts";
import { readText, writeTextAtomic } from "../io.ts";
import { printFormatHint } from "../output.ts";
import { renderHumanDiagnostics } from "../render/human-diagnostic.ts";

export type FormatRunOptions = {
  check?: boolean;
  diff?: boolean;
  stdout?: boolean;
  output: string;
  quiet?: boolean;
  force?: boolean;
  config: ResolvedBtxmlConfig;
};

type FormatOutcome = {
  changed: boolean;
  failed: boolean;
};

function emitCheckFailure(
  file: string,
  input: string,
  formatted: string,
  options: FormatRunOptions,
) {
  if (options.quiet) return;
  console.error(printFormatHint(file));
  if (options.diff) {
    console.log(unifiedDiff(input, formatted, file));
  }
}

function processFile(file: string, input: string, options: FormatRunOptions): FormatOutcome {
  const effective = getEffectiveConfigForFile(options.config, file);
  const formatted = formatBtXml(input, {
    indentWidth: effective.formatter.indentWidth,
    xmlDeclaration: effective.formatter.xmlDeclaration,
    blankLineBetweenBehaviorTrees: effective.formatter.blankLineBetweenBehaviorTrees,
    lineEnding: effective.formatter.lineEnding,
    force: options.force,
  });
  if (formatted.skipped) {
    if (!options.quiet && options.output !== "json") console.log(`skipped ${file}`);
    return { changed: false, failed: false };
  }
  if (!formatted.ok || !formatted.text) {
    if (!options.quiet) {
      const sourceTextByUri = new Map<string, string>();
      sourceTextByUri.set(file, input);
      console.error(
        renderHumanDiagnostics({
          diagnostics: formatted.diagnostics,
          defaultPath: file,
          sourceTextByUri,
        }),
      );
    }
    return { changed: false, failed: true };
  }

  if (options.check) {
    const changed = formatted.text !== input;
    if (changed) emitCheckFailure(file, input, formatted.text, options);
    return { changed, failed: changed };
  }

  if (options.stdout) {
    process.stdout.write(formatted.text);
    return { changed: formatted.text !== input, failed: false };
  }

  if (formatted.text !== input) writeTextAtomic(file, formatted.text);
  return { changed: formatted.text !== input, failed: false };
}

export function runFormat(files: string[], options: FormatRunOptions) {
  const results: Array<{ path: string; changed: boolean }> = [];
  let failed = false;
  for (const file of files) {
    const input = readText(file);
    const outcome = processFile(file, input, options);
    results.push({ path: file, changed: outcome.changed });
    if (outcome.failed) failed = true;
  }
  return { ok: !failed, results };
}
