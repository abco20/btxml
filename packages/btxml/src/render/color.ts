import { createColors } from "picocolors";

export type ColorMode = {
  enabled: boolean;
};

export function detectColorMode(input: {
  noColor?: boolean;
  stream?: NodeJS.WriteStream;
  env?: NodeJS.ProcessEnv;
}): ColorMode {
  if (input.noColor) return { enabled: false };
  if (input.env?.NO_COLOR !== undefined) return { enabled: false };
  if (input.stream && !input.stream.isTTY) return { enabled: false };
  return { enabled: true };
}

export function colorize(
  mode: ColorMode,
  token: "error" | "warning" | "info" | "help" | "note" | "dim",
  text: string,
): string {
  const pc = createColors(mode.enabled);
  switch (token) {
    case "error":
      return pc.red(text);
    case "warning":
      return pc.yellow(text);
    case "info":
      return pc.cyan(text);
    case "help":
      return pc.green(text);
    case "note":
      return pc.dim(text);
    case "dim":
      return pc.dim(text);
  }
}
