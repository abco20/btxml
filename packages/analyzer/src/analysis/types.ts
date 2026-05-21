import type { EffectiveFileConfig, RuleConfig, ConfigSeverity as Severity } from "@btxml/config";
import type {
  Diagnostic,
  DiagnosticSeverity,
  RelatedInformation,
  SourceRange,
} from "@btxml/foundation";
import type { ModelAugmentationFile } from "@btxml/model";
import type { BtDocumentView } from "@btxml/semantic/ast-view";

export type ValidateOptions = {
  config: EffectiveFileConfig;
  augmentations?: readonly ModelAugmentationFile[];
  uri?: string;
  path?: string;
};

export type ValidateResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
};

export type DiagnosticOptions = {
  config: EffectiveFileConfig;
  documentView?: BtDocumentView;
};

export type JsonDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  uri: string;
  range?: SourceRange;
  relatedInformation?: RelatedInformation[];
};

export type { RuleName } from "../rules/registry.js";
export type { RuleConfig, Severity };
