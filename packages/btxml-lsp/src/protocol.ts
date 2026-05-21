import type { Diagnostic as CoreDiagnostic, TextEdit as CoreTextEdit } from "@btxml/foundation";
import type {
  ChildCapabilityResult,
  CodeAction as CoreCodeAction,
  CompletionItem as CoreCompletionItem,
  DocumentSymbol as CoreDocumentSymbol,
  NodeModelResult,
} from "@btxml/language-service";
import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver/node.js";
import type {
  CodeActionParams,
  CompletionItem,
  DocumentSymbol as LspDocumentSymbol,
  Location as LspLocation,
  Range as LspRange,
  SymbolKind,
  TextEdit,
} from "vscode-languageserver/node.js";

export type GetNodeModelByIdParams = {
  uri: string;
  modelId: string;
};

export type GetChildCapabilityParams = {
  uri: string;
  tagName: string;
  attributes?: Record<string, string | undefined>;
};

export type GetNodeModelByIdResponse = NodeModelResult;

export type GetChildCapabilityResponse = ChildCapabilityResult;

export function toRange(range?: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): LspRange | undefined {
  if (!range) return undefined;
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

export function toLocation(location: {
  uri: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}): LspLocation {
  return {
    uri: location.uri,
    range: toRange(location.range) || {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  };
}

export function toDiagnostic(diag: CoreDiagnostic) {
  let severity = 3;
  if (diag.severity === "error") severity = 1;
  else if (diag.severity === "warning") severity = 2;
  return {
    range: toRange(diag.range) || {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    severity,
    code: diag.code,
    message: diag.message,
    source: "btxml",
  };
}

export function completionKind(kind: string, completionItemKind: typeof CompletionItemKind) {
  const map: Record<string, CompletionItemKind> = {
    Text: completionItemKind.Text,
    Method: completionItemKind.Method,
    Function: completionItemKind.Function,
    Constructor: completionItemKind.Constructor,
    Field: completionItemKind.Field,
    Variable: completionItemKind.Variable,
    Class: completionItemKind.Class,
    Interface: completionItemKind.Interface,
    Module: completionItemKind.Module,
    Property: completionItemKind.Property,
    Unit: completionItemKind.Unit,
    Value: completionItemKind.Value,
    Enum: completionItemKind.Enum,
    Keyword: completionItemKind.Keyword,
    Snippet: completionItemKind.Snippet,
    File: completionItemKind.File,
    Reference: completionItemKind.Reference,
  };
  return map[kind] || completionItemKind.Text;
}

export function symbolKind(kind: string, symbol: typeof SymbolKind): SymbolKind {
  const map: Record<string, SymbolKind> = {
    File: symbol.File,
    Module: symbol.Module,
    Namespace: symbol.Namespace,
    Package: symbol.Package,
    Class: symbol.Class,
    Method: symbol.Method,
    Property: symbol.Property,
    Field: symbol.Field,
    Constructor: symbol.Constructor,
    Enum: symbol.Enum,
    Interface: symbol.Interface,
    Function: symbol.Function,
    Variable: symbol.Variable,
    Constant: symbol.Constant,
    String: symbol.String,
    Number: symbol.Number,
    Boolean: symbol.Boolean,
    Array: symbol.Array,
    Object: symbol.Object,
    Key: symbol.Key,
    Null: symbol.Null,
    EnumMember: symbol.EnumMember,
    Struct: symbol.Struct,
    Event: symbol.Event,
    Operator: symbol.Operator,
    TypeParameter: symbol.TypeParameter,
  };
  return map[kind] || symbol.File;
}

export function toCompletionItem(item: CoreCompletionItem): CompletionItem {
  return {
    label: item.label,
    kind: completionKind(item.kind, CompletionItemKind),
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText,
    insertTextFormat:
      item.insertTextFormat === "snippet" ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    textEdit: item.textEdit ? toTextEdit(item.textEdit) : undefined,
    sortText: item.sortText,
    filterText: item.filterText,
    data: item.data,
  };
}

export function toDocumentSymbol(
  symbol: CoreDocumentSymbol,
  lspSymbolKind: typeof SymbolKind,
): LspDocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbolKind(symbol.kind, lspSymbolKind),
    range: toRange(symbol.range) || {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    selectionRange: toRange(symbol.selectionRange) || {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    children: symbol.children?.map((child) => toDocumentSymbol(child, lspSymbolKind)),
  };
}

export function toTextEdit(edit: CoreTextEdit): TextEdit {
  return {
    range: toRange(edit.range) || {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    newText: edit.newText,
  };
}

export function toCodeAction(action: CoreCodeAction, params: CodeActionParams) {
  return {
    title: action.title,
    kind: action.kind,
    diagnostics: action.diagnostics?.map((d) => ({
      range: toRange(d.range),
      code: d.code,
      message: d.message,
      severity: d.severity === "error" ? 1 : d.severity === "warning" ? 2 : 3,
      source: "btxml",
    })),
    edit: {
      changes: {
        [params.textDocument.uri]: action.edits.map(toTextEdit),
      },
    },
  };
}
