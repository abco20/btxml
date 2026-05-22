import type { ModelAugmentationFile } from "@btxml/model";
import type { ScriptIdentifier, ScriptProgram, ScriptRange } from "../ast.js";
import type { ParseScriptResult } from "../parser.js";

export type ScriptType =
  | { kind: "number" }
  | { kind: "string" }
  | { kind: "bool" }
  | { kind: "custom"; name: string; canonical: string }
  | { kind: "any" }
  | { kind: "unknown" }
  | { kind: "error" };

export type ScriptAnalysisDiagnosticCode =
  | "assignment-to-unknown-variable"
  | "invalid-global-blackboard-identifier"
  | "invalid-compound-assignment"
  | "invalid-operand-type"
  | "variable-type-mismatch";

export type ScriptAnalysisDiagnostic = {
  code: ScriptAnalysisDiagnosticCode;
  message: string;
  range: ScriptRange;
  details: {
    primaryLabel: string;
    help?: string;
  };
};

export type ScriptSymbolSource =
  | { kind: "port-remap"; nodeType?: string; portName: string; direction: string }
  | {
      kind: "global-blackboard-remap";
      nodeType?: string;
      portName: string;
      direction: string;
      key: string;
    }
  | { kind: "subtree-port"; nodeType?: string; portName: string; direction: string }
  | { kind: "script-assignment"; attributeName: string; range: ScriptRange; originId?: string }
  | { kind: "global-blackboard"; key: string; range: ScriptRange; originId?: string }
  | { kind: "augmentation" }
  | { kind: "enum" };

export type ScriptSymbol = {
  name: string;
  type: ScriptType;
  source: ScriptSymbolSource;
  writable: boolean;
  readable: boolean;
  conflict?: boolean;
};

export type ScriptEnvironment = {
  symbols: Map<string, ScriptSymbol>;
  globalBlackboard: Map<string, ScriptSymbol>;
  enums: Map<string, number>;
};

export type ScriptEnvironmentSymbolInput = {
  name: string;
  type: ScriptType;
  source: ScriptSymbolSource;
  writable: boolean;
  readable: boolean;
  compatibilityKey?: string;
};

export type CreateScriptEnvironmentInput = {
  symbols?: readonly ScriptEnvironmentSymbolInput[];
  globalBlackboardSymbols?: readonly ScriptEnvironmentSymbolInput[];
  enums?: Readonly<Record<string, number>> | ReadonlyMap<string, number>;
  augmentations?: readonly ModelAugmentationFile[];
  areTypesCompatible?: (left: string | undefined, right: string | undefined) => boolean;
};

export type ScriptIdentifierAccessKind = "read" | "write" | "readwrite" | "declare";

export type ScriptIdentifierAccess = {
  name: string;
  kind: ScriptIdentifierAccessKind;
  range: ScriptRange;
  identifier: ScriptIdentifier;
  statementIndex: number;
};

export type AnalyzeScriptInput = {
  program: ScriptProgram;
  environment?: ScriptEnvironment;
  attributeName?: string;
  originId?: string;
};

export type ResolvedScriptIdentifier = {
  access: ScriptIdentifierAccess;
  resolution:
    | { kind: "symbol"; symbol: ScriptSymbol }
    | { kind: "global-blackboard"; key: string; symbol?: ScriptSymbol }
    | { kind: "enum"; name: string; value: number }
    | { kind: "unknown" };
};

export type ScriptGlobalBlackboardAccess = {
  key: string;
  rawName: string;
  kind: ScriptIdentifierAccessKind;
  range: ScriptRange;
  inferredType: ScriptType;
};

export type AnalyzeScriptResult = {
  environment: ScriptEnvironment;
  identifiers: ScriptIdentifierAccess[];
  resolvedIdentifiers: ResolvedScriptIdentifier[];
  unknownIdentifiers: ScriptIdentifierAccess[];
  globalBlackboardAccesses: ScriptGlobalBlackboardAccess[];
  invalidGlobalBlackboardIdentifiers: ScriptIdentifierAccess[];
  introducedSymbols: ScriptSymbol[];
  diagnostics: ScriptAnalysisDiagnostic[];
  statementTypes: ScriptType[];
  finalType?: ScriptType;
};

export type ScriptFlowEntry<TId = string> = {
  id: TId;
  source: string;
  attributeName?: string;
  originId?: string;
  parseResult?: ParseScriptResult;
};

export type ScriptFlowEntryResult<TId = string> = {
  id: TId;
  parseResult: ParseScriptResult;
  environmentBefore: ScriptEnvironment;
  environmentAfter: ScriptEnvironment;
  analysis?: AnalyzeScriptResult;
};
