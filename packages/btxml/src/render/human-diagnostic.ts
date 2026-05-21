import { getRuleNameForCode } from "@btxml/analyzer/rules";
import type { Diagnostic, DiagnosticSeverity } from "@btxml/foundation";
import { collectDiagnostics } from "../diagnostics.ts";
import { renderCodeFrame } from "./code-frame.ts";
import { type ColorMode, colorize, detectColorMode } from "./color.ts";

export function renderHumanDiagnostics(input: {
  diagnostics: Diagnostic[];
  defaultPath?: string;
  sourceTextByUri?: Map<string, string>;
  noColor?: boolean;
  stream?: NodeJS.WriteStream;
}): string {
  const colorMode = detectColorMode({
    noColor: input.noColor,
    stream: input.stream,
    env: process.env,
  });

  const sorted = collectDiagnostics([input.diagnostics]);
  const blocks: string[] = [];

  for (const diag of sorted) {
    blocks.push(renderDiagnosticBlock(diag, input.defaultPath, input.sourceTextByUri, colorMode));
  }

  return blocks.join("\n\n");
}

function renderDiagnosticBlock(
  diag: Diagnostic,
  defaultPath: string | undefined,
  sourceTextByUri: Map<string, string> | undefined,
  colorMode: ColorMode,
): string {
  const lines: string[] = [];

  const severity = diag.suppressed ? "info" : diag.severity;
  const suppressedSuffix = diag.suppressed ? " [suppressed]" : "";
  const severityColor =
    severity === "error" ? "error" : severity === "warning" ? "warning" : "info";

  const ruleSlug = getRuleNameForCode(diag.code);
  const slugPart = ruleSlug ? ` ${ruleSlug}:` : ":";
  lines.push(
    `${colorize(colorMode, severityColor, severity)}[${diag.code}]${slugPart} ${diag.message}${suppressedSuffix}`,
  );

  const locationPath = diag.uri || defaultPath;
  if (locationPath) {
    if (diag.range) {
      lines.push(
        `  --> ${colorize(colorMode, "dim", `${locationPath}:${diag.range.start.line + 1}:${diag.range.start.character + 1}`)}`,
      );
    } else {
      lines.push(`  --> ${colorize(colorMode, "dim", locationPath)}`);
    }
  }

  if (diag.range && sourceTextByUri) {
    const sourceText = sourceTextByUri.get(diag.uri) || sourceTextByUri.get(defaultPath || "");
    if (sourceText) {
      lines.push(
        ...renderCodeFrame({
          sourceText,
          range: diag.range,
          label: diag.details?.primaryLabel,
          severity: diag.severity,
          colorMode,
        }),
      );
    }
  }

  if (diag.details?.help) {
    lines.push(`${colorize(colorMode, "help", "help:")} ${diag.details.help}`);
  }

  if (diag.details?.notes) {
    for (const note of diag.details.notes) {
      lines.push(`${colorize(colorMode, "note", "note:")} ${note}`);
    }
  }

  if (diag.relatedInformation) {
    for (const info of diag.relatedInformation) {
      const loc = info.range
        ? `${info.uri}:${info.range.start.line + 1}:${info.range.start.character + 1}`
        : info.uri;
      lines.push(`${colorize(colorMode, "note", "note:")} ${loc}: ${info.message}`);
    }
  }

  return lines.join("\n");
}
