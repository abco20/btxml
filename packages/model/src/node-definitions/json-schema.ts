import { z } from "zod";
import { nodeDefinitionsFileSchema } from "./schema.js";

type JsonObject = Record<string, unknown>;

export function generateBtxmlNodesJsonSchema(): JsonObject {
  const schema = z.toJSONSchema(nodeDefinitionsFileSchema, { target: "draft-7" }) as JsonObject;
  schema.$schema = "http://json-schema.org/draft-07/schema#";
  schema.title = "BtxmlNodes";
  schema.description = "Node definition schema for btxml projects.";
  return schema;
}
