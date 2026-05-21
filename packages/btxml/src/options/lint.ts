import { z } from "zod";
import { baselineOptionsSchema } from "./baseline.ts";
import { filesSchema } from "./common.ts";
import { reportOutputSchema, reportOutputValueSchema } from "./output.ts";
import { projectOptionsSchema } from "./project.ts";

export const lintOptionsSchema = projectOptionsSchema.pipe(
  z
    .object({
      configPath: z.string().optional(),
      projectRoot: z.string().optional(),
      noConfig: z.boolean().optional(),
      quiet: z.boolean().optional(),
      verbose: z.boolean().optional(),
      noColor: z.boolean().optional(),
      output: reportOutputSchema,
      reporter: reportOutputValueSchema.optional(),
      json: z.boolean().optional(),
      warningsAsErrors: z.boolean().optional(),
      maxWarnings: z.number().optional(),
      showSkipped: z.boolean().optional(),
      showSuppressed: z.boolean().optional(),
      fix: z.boolean().optional(),
    })
    .merge(baselineOptionsSchema)
    .merge(filesSchema)
    .transform((options) => ({
      ...options,
      output: options.json ? "json" : options.output,
      reporter: options.json ? "json" : (options.reporter ?? options.output),
      maxWarnings: options.warningsAsErrors ? 0 : options.maxWarnings,
    })),
);

export type LintOptions = z.infer<typeof lintOptionsSchema>;
