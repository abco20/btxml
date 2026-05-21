import type { z } from "zod";
import { commonOptionsSchema } from "./common.ts";

export const projectOptionsSchema: z.ZodTypeAny = commonOptionsSchema.transform((options) => {
  const { config, ...rest } = options;
  return { ...rest, configPath: config };
});
