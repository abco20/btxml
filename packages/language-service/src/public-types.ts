import type { EffectiveFileConfig, RawBtxmlConfig, ResolvedBtxmlConfig } from "@btxml/config";
import type {
  Diagnostic,
  SourcePosition,
  SourceRange,
  TextDocument,
  TextEdit,
  WorkspaceEdit,
} from "@btxml/foundation";
import type { PortDef, TreeNodeModelDef } from "@btxml/model";
import type { ModelAugmentationFile } from "@btxml/model";
import type {
  NodeUsageResolution,
  PortUsageResolution,
  SemanticDocumentView,
  SemanticPortBindingView,
  SemanticTreeNodeView,
} from "@btxml/semantic";
export type { TextDocument } from "@btxml/foundation";

export type FileStat = {
  type: "file" | "directory" | "other";
  size?: number;
};

export type DirEntry = {
  name: string;
  type: FileStat["type"];
};

export interface WorkspaceHost {
  readFile(uri: string): Promise<string>;
  exists(uri: string): Promise<boolean>;
  readDir(uri: string): Promise<readonly DirEntry[]>;
  stat?(uri: string): Promise<FileStat | undefined>;
  realpath?(uri: string): Promise<string>;
}

export type Location = {
  uri: string;
  range: SourceRange;
};

export type CompletionItemKind =
  | "Text"
  | "Method"
  | "Function"
  | "Constructor"
  | "Field"
  | "Variable"
  | "Class"
  | "Interface"
  | "Module"
  | "Property"
  | "Unit"
  | "Value"
  | "Enum"
  | "Keyword"
  | "Snippet"
  | "File"
  | "Reference";

export type CompletionItem = {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: "plainText" | "snippet";
  textEdit?: TextEdit;
  sortText?: string;
  filterText?: string;
  data?: unknown;
};

export type CompletionInput = {
  document: TextDocument;
  position: SourcePosition;
  triggerCharacter?: string;
  config?: EffectiveFileConfig;
};

export type CompletionResult = {
  items: CompletionItem[];
  isIncomplete?: boolean;
};

export type HoverInput = {
  document: TextDocument;
  position: SourcePosition;
  config?: EffectiveFileConfig;
};

export type HoverResult = {
  contents?: string;
  range?: SourceRange;
};

export type DefinitionInput = {
  document: TextDocument;
  position: SourcePosition;
  config?: EffectiveFileConfig;
};

export type DefinitionResult = {
  locations: Location[];
};

export type ReferencesInput = {
  document: TextDocument;
  position: SourcePosition;
  config?: EffectiveFileConfig;
};

export type ReferencesResult = {
  locations: Location[];
};

export type DocumentSymbol = {
  name: string;
  detail?: string;
  kind: string;
  range: SourceRange;
  selectionRange: SourceRange;
  children?: DocumentSymbol[];
};

export type DocumentSymbolsInput = {
  document: TextDocument;
  config?: EffectiveFileConfig;
};

export type DocumentSymbolsResult = {
  symbols: DocumentSymbol[];
};

export type CodeAction = {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  edits: TextEdit[];
  workspaceEdits?: WorkspaceEdit[];
  command?: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
};

export type CodeActionsInput = {
  document: TextDocument;
  range?: SourceRange;
  diagnostics?: Diagnostic[];
  config?: EffectiveFileConfig;
};

export type CodeActionsResult = {
  actions: CodeAction[];
};

export type FormattingInput = {
  document: TextDocument;
  config?: EffectiveFileConfig;
};

export type FormattingResult = {
  edits: TextEdit[];
  diagnostics: Diagnostic[];
};

export type DiagnosticsInput = {
  document: TextDocument;
  config?: EffectiveFileConfig;
  mode?: "strict" | "tolerant";
};

export type DiagnosticsResult = {
  diagnostics: Diagnostic[];
  partial?: boolean;
};

export type SemanticDocumentViewResult = {
  view?: SemanticDocumentView;
  diagnostics: Diagnostic[];
  partial?: boolean;
};

export type WorkspaceDiagnosticsResult = {
  diagnostics: Diagnostic[];
};

export type NodeCatalogResult = {
  models: readonly TreeNodeModelDef[];
};

export type SemanticNodeResult = {
  node?: SemanticTreeNodeView;
};

export type NodeUsageAtResult = {
  node?: SemanticTreeNodeView;
  usage?: NodeUsageResolution;
};

export type NodeModelResult = {
  model?: TreeNodeModelDef;
};

export type ChildCapabilityReason =
  | "behavior-tree"
  | "generic-control"
  | "generic-decorator"
  | "generic-leaf"
  | "model-kind"
  | "unknown-model";

export type ChildCapabilityResult = {
  capable: boolean;
  reason: ChildCapabilityReason;
  modelId?: string;
  kind?: TreeNodeModelDef["kind"];
};

export type PortInfoResult = {
  node?: SemanticTreeNodeView;
  binding?: SemanticPortBindingView;
  port?: PortDef;
  usage?: PortUsageResolution;
  nodeUsage?: NodeUsageResolution;
};

export type LanguageServiceOptions = {
  config?: EffectiveFileConfig;
  augmentations?: readonly ModelAugmentationFile[];
};

export interface LanguageService {
  getDiagnostics(input: DiagnosticsInput): DiagnosticsResult;
  getCompletions(input: CompletionInput): CompletionResult;
  getHover(input: HoverInput): HoverResult;
  getDefinition(input: DefinitionInput): DefinitionResult;
  getReferences(input: ReferencesInput): ReferencesResult;
  getDocumentSymbols(input: DocumentSymbolsInput): DocumentSymbolsResult;
  getCodeActions(input: CodeActionsInput): CodeActionsResult;
  getFormattingEdits(input: FormattingInput): FormattingResult;
}

export type LoadProjectOptions = {
  cwd?: string;
  configPath?: string;
  projectRoot?: string;
};

export type ProjectLoadResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
};

export type WorkspaceServiceOptions = {
  config?: RawBtxmlConfig;
  configBasePath?: string;
};

export type BtEditorServiceOptions = WorkspaceServiceOptions;

// Node/project-aware types are only re-exported from the ./node entrypoint.
export type NodeWorkspaceServiceOptions = LoadProjectOptions & {
  config?: RawBtxmlConfig;
  host?: WorkspaceHost;
};

export interface BtEditorService {
  openDocument(
    uri: string,
    text: string,
    version?: number,
    languageId?: TextDocument["languageId"],
  ): void;
  updateDocument(
    uri: string,
    text: string,
    version?: number,
    languageId?: TextDocument["languageId"],
  ): void;
  closeDocument(uri: string): void;
  getResolvedConfig(): ResolvedBtxmlConfig | undefined;
  getEffectiveConfigForDocument(uri: string): EffectiveFileConfig | undefined;
  getDocument(uri: string): TextDocument | undefined;
  getDiagnostics(uri: string): DiagnosticsResult;
  getWorkspaceDiagnostics(): WorkspaceDiagnosticsResult;
  getSemanticDocumentView(uri: string): SemanticDocumentViewResult;
  getNodeCatalog(uri: string): NodeCatalogResult;
  getSemanticNode(uri: string, nodeId: string): SemanticNodeResult;
  getNodeUsageAt(uri: string, position: SourcePosition): NodeUsageAtResult;
  getNodeModelById(modelId: string, uri?: string): NodeModelResult;
  getChildCapability(
    uri: string,
    tagName: string,
    attributes?: Record<string, string | undefined>,
  ): ChildCapabilityResult;
  getPortInfoAt(uri: string, position: SourcePosition): PortInfoResult;
  getFormattingEdits(uri: string): FormattingResult;
  getCompletions(
    uri: string,
    position: SourcePosition,
    triggerCharacter?: string,
  ): CompletionResult;
  getHover(uri: string, position: SourcePosition): HoverResult;
  getDefinition(uri: string, position: SourcePosition): DefinitionResult;
  getReferences(uri: string, position: SourcePosition): ReferencesResult;
  getDocumentSymbols(uri: string): DocumentSymbolsResult;
  getCodeActions(uri: string, range?: SourceRange, diagnostics?: Diagnostic[]): CodeActionsResult;
  getLanguageService(): LanguageService;
  dispose(): void;
}

export interface BtProjectEditorService extends BtEditorService {
  loadProject(options?: LoadProjectOptions): Promise<ProjectLoadResult>;
  refreshProject(options?: LoadProjectOptions): Promise<ProjectLoadResult>;
  notifyWatchedFileChanged(uri: string): Promise<ProjectLoadResult | undefined>;
  getProjectConfig(): RawBtxmlConfig | undefined;
}
