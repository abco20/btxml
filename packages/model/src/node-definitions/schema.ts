import { z } from "zod";

export const configPortDefSchema = z
  .object({
    direction: z.enum(["input", "output", "inout"]).optional(),
    type: z.string().optional(),
    required: z.boolean().optional(),
    default: z.string().optional(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
  })
  .strict();

export const configNodeModelSchema = z
  .object({
    kind: z.enum(["Action", "Condition", "Control", "Decorator", "SubTree"]),
    ports: z.record(z.string(), configPortDefSchema).optional(),
    description: z.string().optional(),
  })
  .strict();

export const nodeDefinitionsFileSchema = z
  .object({
    nodes: z.record(z.string(), configNodeModelSchema),
  })
  .strict();

export type ConfigPortDef = z.infer<typeof configPortDefSchema>;
export type ConfigNodeModel = z.infer<typeof configNodeModelSchema>;
export type NodeDefinitionsFile = z.infer<typeof nodeDefinitionsFileSchema>;
