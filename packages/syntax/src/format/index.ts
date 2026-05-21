import { DiagnosticSeverity } from "@btxml/foundation";
import { parseBtXml } from "../parse/index.js";
import type { FormatOptions, FormatResult } from "../types.js";
import { toFormatterConfig } from "./config.js";
import { topLevelNodeLines } from "./render-document.js";
import { renderOpenTag } from "./render-node.js";

export function formatBtXml(text: string, options: FormatOptions = {}): FormatResult {
  const result = parseBtXml(text);
  if (!result.ok || !result.document || !result.document.root) {
    return {
      ok: false,
      skipped: false,
      diagnostics: result.diagnostics,
    };
  }

  const unsupported = result.diagnostics.find((d) =>
    [
      "XML010_UNSUPPORTED_CDATA",
      "XML011_UNSUPPORTED_DOCTYPE",
      "XML012_UNSUPPORTED_PROCESSING_INSTRUCTION",
      "XML013_UNKNOWN_ENTITY",
      "XML014_INVALID_NUMERIC_ENTITY",
      "XML001_INVALID_SYNTAX",
    ].includes(d.code),
  );
  if (unsupported) {
    return {
      ok: false,
      skipped: false,
      diagnostics: result.diagnostics,
    };
  }

  if (result.document.kind === "generic-xml" && !options.force) {
    return {
      ok: true,
      skipped: true,
      diagnostics: [],
    };
  }

  const root = result.document.root;
  const config = toFormatterConfig(options);
  const indentSize = config.indentWidth;
  const lines: string[] = [];

  const hadDeclaration = result.document.xmlDeclaration !== undefined;

  if (
    config.xmlDeclaration === "always" ||
    (config.xmlDeclaration === "preserve" && hadDeclaration)
  ) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }
  lines.push(...renderOpenTag(root, 0, ">", indentSize));
  lines.push(
    ...topLevelNodeLines(
      root.children || [],
      indentSize,
      config.blankLineBetweenBehaviorTrees,
      result.diagnostics,
    ),
  );
  lines.push(`</${root.name}>`);

  if (result.diagnostics.some((d) => d.code === "XML015_UNSUPPORTED_MIXED_CONTENT")) {
    return {
      ok: false,
      skipped: false,
      diagnostics: result.diagnostics,
    };
  }

  let sep = "\n";
  if (config.lineEnding === "crlf") sep = "\r\n";
  else if (config.lineEnding === "auto" && text.includes("\r\n")) sep = "\r\n";

  const joined = lines.join(sep);
  const escapedSep = sep.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const trailingSepRegex = new RegExp(`(?:${escapedSep})+$`, "u");
  const trimmed = joined.replace(trailingSepRegex, "");

  const formattedText = `${trimmed}${sep}`;

  return {
    ok: true,
    text: formattedText,
    changed: formattedText !== text,
    skipped: false,
    diagnostics: result.diagnostics.filter((diag) => diag.severity !== DiagnosticSeverity.Error),
  };
}
