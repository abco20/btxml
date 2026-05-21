import { z } from "zod";
import { commonOptionsSchema } from "./common.ts";
import { reportOutputSchema } from "./output.ts";

export const initOptionsSchema = commonOptionsSchema
  .extend({
    type: z.string().optional(),
    force: z.boolean().optional(),
    output: reportOutputSchema,
    json: z.boolean().optional(),
  })
  .transform((options) => ({
    ...options,
    output: options.json ? "json" : options.output,
  }));

export type InitOptions = z.infer<typeof initOptionsSchema>;
