import type { ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic } from "@btxml/foundation";
import type { ModelAugmentationFile } from "@btxml/model";
import type { BtDocument } from "@btxml/syntax";
import type { CheckProjectInput, CheckProjectResult, FileCheckResult } from "../types.js";

export type InternalFileCheckResult = FileCheckResult & {
  needsFormat?: boolean;
  formatted?: string;
  originalText?: string;
};

export type InternalCheckProjectInput = CheckProjectInput & {
  documents: BtDocument[];
  externalModelDocuments?: BtDocument[];
  augmentations?: ModelAugmentationFile[];
  resolutionMode?: "workspace" | "entrypoints" | "single-file";
  resolvedConfig?: ResolvedBtxmlConfig;
};

export type InternalCheckProjectResult = CheckProjectResult & {
  files: InternalFileCheckResult[];
  suppressedDiagnostics?: Diagnostic[];
  baselineDiagnostics?: Diagnostic[];
  rawFiles?: InternalFileCheckResult[];
};
