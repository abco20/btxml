import type { TextDocument } from "@btxml/foundation";
import type { BtEditorService } from "@btxml/language-service";
import type {
  CodeActionParams,
  CompletionParams,
  DocumentFormattingParams,
  DocumentSymbolParams,
  SymbolKind,
  TextDocumentPositionParams,
} from "vscode-languageserver/node.js";
import {
  type GetChildCapabilityParams,
  type GetNodeModelByIdParams,
  toCodeAction,
  toCompletionItem,
  toDocumentSymbol,
  toLocation,
  toRange,
  toTextEdit,
} from "./protocol.ts";

function toCorePosition(document: TextDocument, position: { line: number; character: number }) {
  return document.positionAt(document.offsetAt(position));
}

export function handleCompletion(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: CompletionParams,
) {
  if (!document) return [];
  const result = workspace.getCompletions(
    params.textDocument.uri,
    toCorePosition(document, params.position),
  );
  return result.items.map(toCompletionItem);
}

export function handleHover(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: TextDocumentPositionParams,
) {
  if (!document) return null;
  const result = workspace.getHover(
    params.textDocument.uri,
    toCorePosition(document, params.position),
  );
  return result.contents
    ? {
        contents: { kind: "markdown", value: result.contents },
        range: toRange(result.range),
      }
    : null;
}

export function handleDefinition(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: TextDocumentPositionParams,
) {
  if (!document) return [];
  const result = workspace.getDefinition(
    params.textDocument.uri,
    toCorePosition(document, params.position),
  );
  return result.locations.map(toLocation);
}

export function handleReferences(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: TextDocumentPositionParams,
) {
  if (!document) return [];
  const result = workspace.getReferences(
    params.textDocument.uri,
    toCorePosition(document, params.position),
  );
  return result.locations.map(toLocation);
}

export function handleDocumentSymbols(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: DocumentSymbolParams,
  lspSymbolKind: typeof SymbolKind,
) {
  if (!document) return [];
  const result = workspace.getDocumentSymbols(params.textDocument.uri);
  return result.symbols.map((symbol) => toDocumentSymbol(symbol, lspSymbolKind));
}

export function handleFormatting(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: DocumentFormattingParams,
) {
  if (!document) return [];
  const result = workspace.getFormattingEdits(params.textDocument.uri);
  return result.edits.map(toTextEdit);
}

export function handleCodeActions(
  workspace: BtEditorService,
  document: TextDocument | undefined,
  params: CodeActionParams,
) {
  if (!document) return [];

  const result = workspace.getCodeActions(
    params.textDocument.uri,
    params.range
      ? {
          start: toCorePosition(document, params.range.start),
          end: toCorePosition(document, params.range.end),
        }
      : undefined,
    (params.context?.diagnostics || []).map((d) => ({
      code: String(d.code || ""),
      severity: d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info",
      message: d.message,
      uri: params.textDocument.uri,
      range: d.range
        ? {
            start: toCorePosition(document, d.range.start),
            end: toCorePosition(document, d.range.end),
          }
        : undefined,
    })),
  );
  return result.actions.map((action) => toCodeAction(action, params));
}

export function handleGetNodeModelById(workspace: BtEditorService, params: GetNodeModelByIdParams) {
  return workspace.getNodeModelById(params.modelId, params.uri);
}

export function handleGetChildCapability(
  workspace: BtEditorService,
  params: GetChildCapabilityParams,
) {
  return workspace.getChildCapability(params.uri, params.tagName, params.attributes);
}
