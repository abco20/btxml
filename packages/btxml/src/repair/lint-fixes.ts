import type { Diagnostic, WorkspaceEdit } from "@btxml/foundation";
import type { BtDocument } from "@btxml/syntax";

export function getSafeLintFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const editsByUri = new Map<string, WorkspaceEdit>();

  for (const diagnostic of input.diagnostics) {
    if (diagnostic.code !== "BT002_MISSING_BTCPP_FORMAT") continue;
    const document = input.documents.find((doc) => doc.uri === diagnostic.uri);
    if (!document?.root) continue;
    if (document.root.name !== "root") continue;
    if (document.root.attributes.some((attribute) => attribute.name === "BTCPP_format")) continue;

    let insertOffset: number | undefined;
    if (document.root.nameRange) {
      insertOffset = document.root.nameRange.end.offset;
    } else if (document.root.openTagRange) {
      insertOffset = document.root.openTagRange.start.offset + "<root".length;
    }
    if (insertOffset === undefined) continue;

    const existing = editsByUri.get(document.uri);
    const edit = {
      range: {
        start: { line: 0, character: 0, offset: insertOffset },
        end: { line: 0, character: 0, offset: insertOffset },
      },
      newText: ' BTCPP_format="4"',
    };

    editsByUri.set(
      document.uri,
      existing
        ? { uri: document.uri, edits: [...existing.edits, edit] }
        : { uri: document.uri, edits: [edit] },
    );
  }

  return [...editsByUri.values()];
}
