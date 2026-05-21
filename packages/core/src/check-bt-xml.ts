import { validateBtXml } from "@btxml/analyzer";
import type { EffectiveFileConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import { formatBtXml } from "@btxml/syntax";

export type CheckOptions = {
  readonly config: EffectiveFileConfig;
  readonly uri?: string;
  readonly path?: string;

  /**
   * Whether to check formatting.
   * Default: true.
   */
  readonly format?: boolean;
};

export type CheckResult =
  | {
      readonly ok: true;
      readonly diagnostics: readonly Diagnostic[];
      readonly formattedText?: string;
      readonly needsFormat: false;
      readonly skipped: boolean;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
      readonly formattedText?: string;
      readonly needsFormat: boolean;
      readonly skipped: boolean;
    };

export function checkBtXml(text: string, options: CheckOptions): CheckResult {
  const validation = validateBtXml(text, {
    config: options.config,
    uri: options.uri,
    path: options.path,
  });

  const diagnostics: Diagnostic[] = [...validation.diagnostics];

  let formattedText: string | undefined;
  let needsFormat = false;
  let skipped = false;

  if (options.format !== false) {
    const formatted = formatBtXml(text, options.config.formatter);

    diagnostics.push(...formatted.diagnostics);

    if (formatted.ok && formatted.skipped) {
      skipped = true;
    } else if (formatted.ok && !formatted.skipped) {
      formattedText = formatted.text;
      needsFormat = formatted.changed;
    }
  }

  const ok =
    validation.ok &&
    !needsFormat &&
    diagnostics.every((diagnostic) => diagnostic.severity !== "error");

  if (ok) {
    return {
      ok: true,
      diagnostics,
      formattedText,
      needsFormat: false,
      skipped,
    };
  }

  return {
    ok: false,
    diagnostics,
    formattedText,
    needsFormat,
    skipped,
  };
}
