import { z } from "zod";
import { baselineOptionsSchema } from "./baseline.ts";
import { filesSchema } from "./common.ts";
import { reportOutputSchema, reportOutputValueSchema } from "./output.ts";
import { projectOptionsSchema } from "./project.ts";

export const checkOptionsSchema = projectOptionsSchema.pipe(
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
      noFormat: z.boolean().optional(),
      noLint: z.boolean().optional(),
      formatOnly: z.boolean().optional(),
      lintOnly: z.boolean().optional(),
      maxWarnings: z.number().optional(),
      showSkipped: z.boolean().optional(),
      showSuppressed: z.boolean().optional(),
      diff: z.boolean().optional(),
      fix: z.boolean().optional(),
    })
    .merge(baselineOptionsSchema)
    .merge(filesSchema)
    .superRefine((options, ctx) => {
      if (options.noFormat && options.formatOnly) {
        ctx.addIssue({
          code: "custom",
          message: "`--no-format` and `--format-only` cannot be used together",
        });
      }
      if (options.noLint && options.lintOnly) {
        ctx.addIssue({
          code: "custom",
          message: "`--no-lint` and `--lint-only` cannot be used together",
        });
      }
      if (options.fix) {
        ctx.addIssue({ code: "custom", message: "error: `--fix` is only supported for `lint`" });
      }
    })
    .transform((options) => ({
      ...options,
      output: options.json ? "json" : options.output,
      reporter: options.json ? "json" : (options.reporter ?? options.output),
      maxWarnings: options.warningsAsErrors ? 0 : options.maxWarnings,
    })),
);

export type CheckOptions = z.infer<typeof checkOptionsSchema>;
