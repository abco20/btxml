import { z } from "zod";
import { filesSchema } from "./common.ts";
import { reportOutputSchema } from "./output.ts";
import { projectOptionsSchema } from "./project.ts";

export const repairOptionsSchema = projectOptionsSchema.pipe(
  z
    .object({
      configPath: z.string().optional(),
      projectRoot: z.string().optional(),
      noConfig: z.boolean().optional(),
      quiet: z.boolean().optional(),
      verbose: z.boolean().optional(),
      noColor: z.boolean().optional(),
      output: reportOutputSchema,
      json: z.boolean().optional(),
      write: z.boolean().optional(),
      show: z.string().optional(),
      source: z.enum(["model-files"]).optional(),
      mode: z.enum(["auto", "sync", "dedupe"]).optional(),
    })
    .merge(filesSchema)
    .transform((options) => ({
      ...options,
      output: options.json ? "json" : options.output,
    })),
);

export type RepairOptions = z.infer<typeof repairOptionsSchema>;
