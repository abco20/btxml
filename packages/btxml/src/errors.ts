import { renderHumanCliError } from "./render/human-cli-error.ts";

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly help?: string,
    public readonly expected?: string[],
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function handleError(error: unknown): number {
  if (error instanceof CliError) {
    console.error(
      renderHumanCliError({
        message: error.message,
        help: error.help,
        expected: error.expected,
      }),
    );
    return error.exitCode;
  }
  console.error(
    renderHumanCliError({
      message: "command failed",
    }),
  );
  console.error(`\nnote: ${String((error as Error).message || error)}`);
  return 3;
}
