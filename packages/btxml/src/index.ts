export {
  checkBtXml,
  validateBtXml,
  formatBtXml,
  createInitConfig,
  parseBtxmlConfig,
  normalizeBtxmlConfig,
  getEffectiveConfigForFile,
  getEffectiveConfigForUri,
} from "@btxml/core";

export { checkBtWorkspace } from "@btxml/project";
export { jsonCheckReportSchema, jsonRepairReportSchema } from "./report/schema.ts";

export type { CheckResult } from "@btxml/core";
export type { WorkspaceCheckResult } from "@btxml/project";
