import { z } from "zod";

export const baselineOptionsSchema = z.object({
  baseline: z.string().optional(),
  updateBaseline: z.string().optional(),
  noBaseline: z.boolean().optional(),
});
