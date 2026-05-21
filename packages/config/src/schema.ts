import { SUPPORTED_BUILTIN_MODEL_SETS } from "@btxml/model";
import { configNodeModelSchema } from "@btxml/model/zod";
import { z } from "zod";

export const severitySchema = z.enum(["off", "info", "warn", "error"]);

export const ruleConfigSchema = z.union([
  severitySchema,
  z.tuple([severitySchema, z.record(z.string(), z.unknown())]),
]);

export const filesConfigSchema = z
  .object({
    include: z.array(z.string()).optional(),
    ignore: z.array(z.string()).optional(),
    useGitignore: z.boolean().optional(),
    followSymlinks: z.boolean().optional(),
    maxSize: z.number().int().positive().optional(),
  })
  .strict();

const resolverEntrypointSchema = z.string();

const resolverIncludesElementSchema = z
  .object({
    name: z.string(),
    attribute: z.string(),
    base: z.enum(["file", "project-root"]).optional(),
  })
  .strict();

const resolverIncludesConfigSchema = z
  .object({
    elements: z.array(resolverIncludesElementSchema).optional(),
    variables: z.record(z.string(), z.string()).optional(),
    allowOutsideRoot: z.boolean().optional(),
    maxDepth: z.number().int().min(1).optional(),
    maxFiles: z.number().int().min(1).optional(),
  })
  .strict();

export const resolverConfigSchema = z
  .object({
    entrypoints: z.array(resolverEntrypointSchema).optional(),
    includes: resolverIncludesConfigSchema.optional(),
    behaviorTreeIds: z.enum(["workspace-unique", "file-local-first", "allow-ambiguous"]).optional(),
  })
  .strict();

export const modelsConfigSchema = z
  .object({
    builtins: z.array(z.enum(SUPPORTED_BUILTIN_MODEL_SETS)).optional(),
    files: z.array(z.string()).optional(),
    augmentations: z.array(z.string()).optional(),
    definitions: z.array(z.string()).optional(),
    inline: z.record(z.string(), configNodeModelSchema).optional(),
  })
  .strict();

const linterSuppressionsConfigSchema = z
  .object({
    inline: z.enum(["allow", "deny"]).optional(),
  })
  .strict();

export const linterConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    rules: z.record(z.string(), ruleConfigSchema).optional(),
    baseline: z.string().optional(),
    suppressions: linterSuppressionsConfigSchema.optional(),
  })
  .strict();

const linterOverrideConfigSchema = z
  .object({
    rules: z.record(z.string(), ruleConfigSchema).optional(),
    suppressions: linterSuppressionsConfigSchema.optional(),
  })
  .strict();

export const formatterConfigSchema = z
  .object({
    indentWidth: z.number().int().min(1).max(8).optional(),
    xmlDeclaration: z.enum(["always", "never", "preserve"]).optional(),
    blankLineBetweenBehaviorTrees: z.boolean().optional(),
    lineEnding: z.enum(["lf", "crlf", "auto"]).optional(),
  })
  .strict();

export const overrideConfigSchema = z
  .object({
    files: z.array(z.string()),
    linter: linterOverrideConfigSchema.optional(),
    formatter: formatterConfigSchema.optional(),
  })
  .strict();

export const rawBtxmlConfigSchema = z
  .object({
    $schema: z.string().optional(),
    strict: z.boolean().optional(),
    files: filesConfigSchema.optional(),
    resolver: resolverConfigSchema.optional(),
    models: modelsConfigSchema.optional(),
    linter: linterConfigSchema.optional(),
    formatter: formatterConfigSchema.optional(),
    overrides: z.array(overrideConfigSchema).optional(),
  })
  .strict();

export type RawBtxmlConfigInput = z.input<typeof rawBtxmlConfigSchema>;
export type RawBtxmlConfig = z.output<typeof rawBtxmlConfigSchema>;
export type ConfigSeverity = z.output<typeof severitySchema>;
export type RuleConfig = z.output<typeof ruleConfigSchema>;
export type RawFilesConfig = z.output<typeof filesConfigSchema>;
export type ResolverEntrypoint = z.output<typeof resolverEntrypointSchema>;
export type RawResolverIncludesConfig = z.output<typeof resolverIncludesConfigSchema>;
export type RawResolverConfig = z.output<typeof resolverConfigSchema>;
export type RawModelsConfig = z.output<typeof modelsConfigSchema>;
export type RawLinterSuppressionsConfig = z.output<typeof linterSuppressionsConfigSchema>;
export type RawLinterConfig = z.output<typeof linterConfigSchema>;
export type RawFormatterConfig = z.output<typeof formatterConfigSchema>;
export type RawOverrideConfig = z.output<typeof overrideConfigSchema>;
