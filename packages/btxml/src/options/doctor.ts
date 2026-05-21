import { z } from "zod";
import { filesSchema } from "./common.ts";
import { reportOutputSchema } from "./output.ts";
import { projectOptionsSchema } from "./project.ts";

export const doctorOptionsSchema = projectOptionsSchema.pipe(
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
    })
    .merge(filesSchema)
    .transform((options) => ({
      ...options,
      output: options.json ? "json" : options.output,
    })),
);

export type DoctorOptions = z.infer<typeof doctorOptionsSchema>;
