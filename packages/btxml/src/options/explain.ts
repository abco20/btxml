import { z } from "zod";
import { commonOptionsSchema } from "./common.ts";
import { reportOutputSchema } from "./output.ts";

export const explainOptionsSchema = commonOptionsSchema
  .extend({
    rule: z.string().optional(),
    output: reportOutputSchema,
    json: z.boolean().optional(),
  })
  .transform((options) => ({
    ...options,
    output: options.json ? "json" : options.output,
  }));

export type ExplainOptions = z.infer<typeof explainOptionsSchema>;
