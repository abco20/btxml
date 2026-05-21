import { z } from "zod";
import { rawBtxmlConfigSchema } from "./schema.js";

type JsonObject = Record<string, unknown>;

const DRAFT_07_SCHEMA = "http://json-schema.org/draft-07/schema#";

export type GenerateBtxmlConfigJsonSchemaOptions = {
  ruleNames?: readonly string[];
};

export function generateBtxmlConfigJsonSchema(
  options: GenerateBtxmlConfigJsonSchemaOptions = {},
): JsonObject {
  const schema = z.toJSONSchema(rawBtxmlConfigSchema, { target: "draft-7" }) as JsonObject;
  schema.$schema = DRAFT_07_SCHEMA;
  schema.title = "BTXMLConfig";
  schema.description = "Configuration schema for btxml projects.";
  postprocessConfigSchema(schema, options);
  return schema;
}

function postprocessConfigSchema(
  value: unknown,
  options: GenerateBtxmlConfigJsonSchemaOptions,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      postprocessConfigSchema(item, options);
    }
    return;
  }

  if (!isJsonObject(value)) return;

  enforceTupleLength(value);
  enforceLinterRuleNames(value, options.ruleNames);

  for (const child of Object.values(value)) {
    postprocessConfigSchema(child, options);
  }
}

function enforceTupleLength(schema: JsonObject): void {
  if (Array.isArray(schema.items)) {
    schema.minItems = schema.items.length;
    schema.maxItems = schema.items.length;
    schema.additionalItems = false;
  }
}

function enforceLinterRuleNames(schema: JsonObject, ruleNames?: readonly string[]): void {
  if (!ruleNames) return;
  if (schema.type !== "object" || !isJsonObject(schema.properties)) return;

  const rulesSchema = schema.properties.rules;
  if (!isJsonObject(rulesSchema) || rulesSchema.type !== "object") return;

  rulesSchema.propertyNames = {
    enum: [...ruleNames].sort(),
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
