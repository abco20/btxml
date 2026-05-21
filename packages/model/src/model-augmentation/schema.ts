import { z } from "zod";

export const typeLiteralValidatorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("pattern"),
      pattern: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("enum"),
      values: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tuple"),
      separator: z.string(),
      items: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("json-schema"),
      schema: z.unknown(),
    })
    .strict(),
]);

export const typeDefinitionSchema = z
  .object({
    kind: z.enum(["primitive", "opaque", "any"]),
    canonical: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    compatibleWith: z.array(z.string()).optional(),
    validate: typeLiteralValidatorSchema.optional(),
  })
  .strict();

export const portTypeRefinementSchema = z
  .object({
    from: z.string().optional(),
    to: z.string(),
  })
  .strict();

export const portAugmentationSchema = z
  .object({
    typeRefinement: portTypeRefinementSchema.optional(),
    validate: typeLiteralValidatorSchema.optional(),
    required: z.boolean().optional(),
    enum: z.array(z.string()).optional(),
    description: z.string().optional(),
  })
  .strict();

export const nodeAugmentationSchema = z
  .object({
    ports: z.record(z.string(), portAugmentationSchema).optional(),
  })
  .strict();

export const scriptAugmentationSchema = z
  .object({
    enums: z.record(z.string(), z.number().finite()).optional(),
  })
  .strict();

export const modelAugmentationFileSchema = z
  .object({
    version: z.literal(1),
    types: z.record(z.string(), typeDefinitionSchema).optional(),
    augment: z.record(z.string(), nodeAugmentationSchema).optional(),
    script: scriptAugmentationSchema.optional(),
  })
  .strict();

export type TypeLiteralValidator = z.infer<typeof typeLiteralValidatorSchema>;
export type TypeDefinition = z.infer<typeof typeDefinitionSchema>;
export type PortTypeRefinement = z.infer<typeof portTypeRefinementSchema>;
export type PortAugmentation = z.infer<typeof portAugmentationSchema>;
export type NodeAugmentation = z.infer<typeof nodeAugmentationSchema>;
export type ScriptAugmentation = z.infer<typeof scriptAugmentationSchema>;
export type ModelAugmentationFile = z.infer<typeof modelAugmentationFileSchema> & {
  readonly uri?: string;
  readonly path?: string;
};
