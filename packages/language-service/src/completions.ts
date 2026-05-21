import type { SourceRange, TextEdit } from "@btxml/foundation";
import type { CompletionItem } from "./public-types.js";

export function completion(
  label: string,
  kind: CompletionItem["kind"],
  detail?: string,
  textEdit?: TextEdit,
  extra?: Partial<CompletionItem>,
): CompletionItem {
  return { label, kind, detail, textEdit, insertText: label, sortText: label, ...extra };
}

export function snippetCompletion(
  label: string,
  detail: string | undefined,
  insertText: string,
  textEdit?: TextEdit,
): CompletionItem {
  return completion(label, "Snippet", detail, textEdit, {
    insertText,
    insertTextFormat: "snippet",
  });
}

export function escapeSnippetPlaceholder(value: string): string {
  return value.replace(/[\\}$]/g, "\\$&");
}

export function replaceRange(range: SourceRange | undefined, label: string): TextEdit | undefined {
  return range ? { range, newText: label } : undefined;
}

export function uniqueItems(items: CompletionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.label}:${item.insertText || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
