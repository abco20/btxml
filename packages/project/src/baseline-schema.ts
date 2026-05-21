import { z } from "zod";

export const diagnosticBaselineSchema = z
  .object({
    version: z.literal(1),
    diagnostics: z.array(
      z
        .object({
          path: z.string(),
          code: z.string(),
          messageHash: z.string(),
          range: z
            .object({
              start: z
                .object({
                  line: z.number(),
                  character: z.number(),
                  offset: z.number(),
                })
                .strict(),
              end: z
                .object({
                  line: z.number(),
                  character: z.number(),
                  offset: z.number(),
                })
                .strict(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type { DiagnosticBaseline, DiagnosticBaselineEntry } from "./types.js";
