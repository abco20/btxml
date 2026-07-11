import type { RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import type { Diagnostic, TextDocument } from "@btxml/foundation";
import type { ModelAugmentationFile, TreeNodeModelDef } from "@btxml/model";
import type { SemanticIndex } from "@btxml/semantic";
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

export type WorkspaceAnalysisSnapshot = {
  rootDir?: string;
  documents: readonly BtDocument[];
  semanticIndex: SemanticIndex;
  nodeDefinitionModels: readonly TreeNodeModelDef[];
  augmentations?: readonly ModelAugmentationFile[];
};

export type WorkspaceLoadResult = {
  ok: boolean;
  projectOk?: boolean;
  diagnostics: Diagnostic[];
  resolvedConfig?: ResolvedBtxmlConfig;
  workspace?: WorkspaceAnalysisSnapshot;
  rawConfig?: RawBtxmlConfig;
};

export type WorkspaceRuntimeState = {
  version: number;
  diagnostics: readonly Diagnostic[];
  workspace?: WorkspaceAnalysisSnapshot;
  rawConfig?: RawBtxmlConfig;
  resolvedConfig?: ResolvedBtxmlConfig;
};

export type InternalDiagnosticsInput = DiagnosticsInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
};

export type InternalCompletionInput = CompletionInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
};

export type InternalHoverInput = HoverInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
};

export type InternalDefinitionInput = DefinitionInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
};

export type InternalReferencesInput = ReferencesInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
};

export type InternalDocumentSymbolsInput = DocumentSymbolsInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
};

export type InternalCodeActionsInput = CodeActionsInput & {
  document: TextDocument;
  workspace?: WorkspaceAnalysisSnapshot;
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
