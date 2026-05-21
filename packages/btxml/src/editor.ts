import { createLanguageService, createWorkspaceService } from "@btxml/language-service";
import type { BtEditorService, BtEditorServiceOptions } from "@btxml/language-service";

export function createBtEditorService(options: BtEditorServiceOptions = {}): BtEditorService {
  return createWorkspaceService(options);
}

export { createLanguageService };

export type {
  BtEditorService,
  BtEditorServiceOptions,
  CodeAction,
  CodeActionsInput,
  CodeActionsResult,
  CompletionInput,
  CompletionItem,
  CompletionItemKind,
  CompletionResult,
  DefinitionInput,
  DefinitionResult,
  DiagnosticsInput,
  DiagnosticsResult,
  DocumentSymbol,
  DocumentSymbolsInput,
  DocumentSymbolsResult,
  FormattingInput,
  FormattingResult,
  HoverInput,
  HoverResult,
  LanguageService,
  LanguageServiceOptions,
  Location,
  NodeCatalogResult,
  NodeUsageAtResult,
  NodeModelResult,
  PortInfoResult,
  ReferencesInput,
  ReferencesResult,
  SemanticDocumentViewResult,
  SemanticNodeResult,
  WorkspaceDiagnosticsResult,
  WorkspaceHost,
} from "@btxml/language-service";
