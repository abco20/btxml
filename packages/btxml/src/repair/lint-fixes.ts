import type { Diagnostic, WorkspaceEdit } from "@btxml/foundation";
import type { BtDocument } from "@btxml/syntax";

type TextEdit = WorkspaceEdit["edits"][number];

function mergeWorkspaceEdits(edits: WorkspaceEdit[]): WorkspaceEdit[] {
  const byUri = new Map<string, TextEdit[]>();

  for (const edit of edits) {
    const list = byUri.get(edit.uri) ?? [];
    list.push(...edit.edits);
    byUri.set(edit.uri, list);
  }

  return [...byUri.entries()].map(([uri, uriEdits]) => ({
    uri,
    edits: [...uriEdits].sort((left, right) => right.range.start.offset - left.range.start.offset),
  }));
}

function getBtcppFormatFixes(input: {
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

function getModelConventionFixes(input: {
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const edits: WorkspaceEdit[] = [];

  for (const diagnostic of input.diagnostics) {
    const data = diagnostic.data;
    if (!data || typeof data !== "object") continue;

    if (diagnostic.code === "BT121_UNUSED_MODEL_DEFINITION") {
      const fix = (data as { fix?: unknown }).fix;
      if (!fix || typeof fix !== "object") continue;
      const deleteFix = fix as {
        kind?: string;
        uri?: string;
        range?: TextEdit["range"];
      };
      if (deleteFix.kind !== "delete-definition") continue;
      if (!deleteFix.uri || !deleteFix.range) continue;
      edits.push({
        uri: deleteFix.uri,
        edits: [{ range: deleteFix.range, newText: "" }],
      });
      continue;
    }

    if (diagnostic.code === "BT122_DUPLICATE_MODEL_DEFINITION") {
      const fix = (data as { fix?: unknown }).fix;
      if (!fix || typeof fix !== "object") continue;
      const duplicateFix = fix as {
        kind?: string;
        delete?: Array<{ uri?: string; range?: TextEdit["range"] }>;
      };
      if (duplicateFix.kind !== "delete-non-canonical-definitions") continue;
      for (const target of duplicateFix.delete ?? []) {
        if (!target.uri || !target.range) continue;
        edits.push({
          uri: target.uri,
          edits: [{ range: target.range, newText: "" }],
        });
      }
    }
  }

  return edits;
}

export function getSafeLintFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  return mergeWorkspaceEdits([
    ...getBtcppFormatFixes(input),
    ...getModelConventionFixes({ diagnostics: input.diagnostics }),
  ]);
}
