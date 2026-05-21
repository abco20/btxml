import type { DiagnosticSeverity, SourceRange } from "@btxml/foundation";
import { type ColorMode, colorize } from "./color.ts";

export function renderCodeFrame(input: {
  sourceText: string;
  range: SourceRange;
  label?: string;
  severity: DiagnosticSeverity;
  colorMode: ColorMode;
}): string[] {
  const { sourceText, range, label, severity, colorMode } = input;
  const lines: string[] = [];
  const lineNumber = range.start.line + 1;
  const lineText = sourceText.split(/\r?\n/)[range.start.line] ?? "";
  const displayLine = String(lineNumber);
  const gutterWidth = displayLine.length;
  const prefix = " | ";

  lines.push(" ".repeat(gutterWidth) + prefix.trimEnd());
  lines.push(`${displayLine}${prefix}${lineText}`);

  const startChar = range.start.character;
  const endChar = range.end.character;
  const caretStart = startChar;
  let caretEnd = endChar;

  if (caretEnd <= caretStart) {
    caretEnd = caretStart + 1;
  }

  const beforeCaret = lineText.slice(0, caretStart);
  const caretLength = caretEnd - caretStart;
  const tabCount = (beforeCaret.match(/\t/g) || []).length;
  const caretOffset = beforeCaret.length + tabCount;
  const carets = "^".repeat(Math.max(1, caretLength));

  const caretColor = severity === "error" ? "error" : severity === "warning" ? "warning" : "info";
  const coloredCarets = colorize(colorMode, caretColor, carets);
  const coloredLabel = label ? ` ${colorize(colorMode, "dim", label)}` : "";

  lines.push(
    " ".repeat(gutterWidth) + prefix + " ".repeat(caretOffset) + coloredCarets + coloredLabel,
  );
  lines.push(" ".repeat(gutterWidth) + prefix.trimEnd());

  return lines;
}
