import { type ColorMode, colorize, detectColorMode } from "./color.ts";

export function renderHumanCliError(input: {
  message: string;
  help?: string;
  expected?: string[];
  noColor?: boolean;
  stream?: NodeJS.WriteStream;
}): string {
  const colorMode = detectColorMode({
    noColor: input.noColor,
    stream: input.stream,
    env: process.env,
  });

  const lines: string[] = [];
  lines.push(`${colorize(colorMode, "error", "error:")} ${input.message}`);

  if (input.help) {
    lines.push("");
    lines.push(`${colorize(colorMode, "help", "help:")} ${input.help}`);
  }

  if (input.expected && input.expected.length > 0) {
    lines.push("");
    lines.push("expected one of:");
    for (const value of input.expected) {
      lines.push(`  ${value}`);
    }
  }

  return lines.join("\n");
}
