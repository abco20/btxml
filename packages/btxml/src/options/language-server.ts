import { z } from "zod";

export const languageServerOptionsSchema = z
  .object({
    stdio: z.boolean().optional(),
  })
  .transform((options) => ({ ...options, stdio: options.stdio ?? false }));

export type LanguageServerOptions = z.infer<typeof languageServerOptionsSchema>;
