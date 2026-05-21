import { z } from "zod";
import { CliError } from "../errors.ts";

export const commonOptionsSchema = z
  .object({
    config: z.string().optional(),
    projectRoot: z.string().optional(),
    noConfig: z.boolean().optional(),
    quiet: z.boolean().optional(),
    verbose: z.boolean().optional(),
    noColor: z.boolean().optional(),
  })
  .passthrough();

export const filesSchema = z.object({
  files: z.array(z.string()).default([]),
});

export type CommonOptions = z.infer<typeof commonOptionsSchema>;

export function parseCommandOptions<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path[0];
  if ((path === "output" || path === "reporter") && value && typeof value === "object") {
    const raw = (value as Record<string, unknown>)[path];
    if (raw === "") throw new CliError(`--${path} requires a value`, 2);
    if (typeof raw === "string")
      throw new CliError(`invalid value \`${raw}\` for \`--${path}\``, 2);
  }
  throw new CliError(issue?.message || "invalid options", 2);
}
