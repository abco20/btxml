import { z } from "zod";
import { filesSchema } from "./common.ts";
import { humanOutputSchema } from "./output.ts";
import { projectOptionsSchema } from "./project.ts";

export const formatOptionsSchema = projectOptionsSchema.pipe(
  z
    .object({
      configPath: z.string().optional(),
      projectRoot: z.string().optional(),
      noConfig: z.boolean().optional(),
      quiet: z.boolean().optional(),
      verbose: z.boolean().optional(),
      noColor: z.boolean().optional(),
      check: z.boolean().optional(),
      diff: z.boolean().optional(),
      stdout: z.boolean().optional(),
      write: z.boolean().optional(),
      force: z.boolean().optional(),
      output: humanOutputSchema,
    })
    .merge(filesSchema)
    .transform((options) => ({ ...options })),
);

export type FormatOptions = z.infer<typeof formatOptionsSchema>;
