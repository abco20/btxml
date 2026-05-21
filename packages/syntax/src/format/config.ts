import type { FormatOptions } from "../types.js";

export type FormatterConfig = {
  indentWidth: number;
  xmlDeclaration: "always" | "never" | "preserve";
  blankLineBetweenBehaviorTrees: boolean;
  lineEnding: "lf" | "crlf" | "auto";
};

export const DEFAULT_FORMAT: FormatterConfig = {
  indentWidth: 2,
  xmlDeclaration: "always",
  blankLineBetweenBehaviorTrees: true,
  lineEnding: "lf",
};

export function toFormatterConfig(config?: FormatOptions): FormatterConfig {
  if (!config) return DEFAULT_FORMAT;

  const indentWidth =
    typeof config.indentWidth === "number" ? config.indentWidth : DEFAULT_FORMAT.indentWidth;

  const xmlDeclaration =
    config.xmlDeclaration === "always" ||
    config.xmlDeclaration === "never" ||
    config.xmlDeclaration === "preserve"
      ? config.xmlDeclaration
      : DEFAULT_FORMAT.xmlDeclaration;

  const blankLineBetweenBehaviorTrees =
    typeof config.blankLineBetweenBehaviorTrees === "boolean"
      ? config.blankLineBetweenBehaviorTrees
      : DEFAULT_FORMAT.blankLineBetweenBehaviorTrees;

  const lineEnding =
    config.lineEnding === "lf" || config.lineEnding === "crlf" || config.lineEnding === "auto"
      ? config.lineEnding
      : DEFAULT_FORMAT.lineEnding;

  return { indentWidth, xmlDeclaration, blankLineBetweenBehaviorTrees, lineEnding };
}
