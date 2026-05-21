import type { RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic, TextDocument } from "@btxml/foundation";
import type { TreeNodeModelDef } from "@btxml/model";
import type { BtDocument } from "@btxml/syntax";
import type {
  BtEditorService,
  CodeActionsInput,
  CompletionInput,
  DefinitionInput,
  DiagnosticsInput,
  DocumentSymbolsInput,
  FormattingInput,
  HoverInput,
  LoadProjectOptions,
  NodeWorkspaceServiceOptions,
  ReferencesInput,
  WorkspaceHost,
} from "./public-types.js";

export type InternalDiagnosticsResult = import("./public-types.js").DiagnosticsResult & {
  document?: BtDocument;
};

export type BtTextDocument = TextDocument;

export type WorkspaceSnapshot = {
  rootDir?: string;
  documents: BtDocument[];
  nodeDefinitionModels: readonly TreeNodeModelDef[];
};

export type WorkspaceLoadResult = {
  ok: boolean;
  projectOk?: boolean;
  diagnostics: Diagnostic[];
  resolvedConfig?: ResolvedBtxmlConfig;
  workspace?: WorkspaceSnapshot;
  rawConfig?: RawBtxmlConfig;
};

export type WorkspaceRuntimeState = {
  version: number;
  diagnostics: readonly Diagnostic[];
  workspace?: WorkspaceSnapshot;
  rawConfig?: RawBtxmlConfig;
  resolvedConfig?: ResolvedBtxmlConfig;
};

export type InternalDiagnosticsInput = DiagnosticsInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalCompletionInput = CompletionInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalHoverInput = HoverInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalDefinitionInput = DefinitionInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalReferencesInput = ReferencesInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalDocumentSymbolsInput = DocumentSymbolsInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalCodeActionsInput = CodeActionsInput & {
  document: TextDocument;
  workspace?: WorkspaceSnapshot;
};

export type InternalFormattingInput = FormattingInput & {
  document: TextDocument;
};

export type InternalWorkspaceServiceOptions = NodeWorkspaceServiceOptions & {
  host?: WorkspaceHost;
  getRuntimeState?: () => WorkspaceRuntimeState | undefined;
};

export type InternalLoadProjectOptions = LoadProjectOptions & {
  host?: WorkspaceHost;
};

export interface InternalWorkspaceService extends BtEditorService {
  loadProject(options?: InternalLoadProjectOptions): Promise<WorkspaceLoadResult>;
  refreshProject(options?: InternalLoadProjectOptions): Promise<WorkspaceLoadResult>;
  getDocument(uri: string): TextDocument | undefined;
}
