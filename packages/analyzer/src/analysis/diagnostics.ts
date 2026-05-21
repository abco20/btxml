import {
  type DiagnosticData,
  type DiagnosticDetails,
  type RelatedInformation,
  createDiagnostic as diagnostic,
} from "@btxml/foundation";
import type { SourceRange } from "@btxml/foundation";

export type RuleReportInput = {
  code?: string;
  message: string;
  range?: SourceRange;
  details?: DiagnosticDetails;
  data?: DiagnosticData;
  relatedInformation?: RelatedInformation[];
};

export { diagnostic };
