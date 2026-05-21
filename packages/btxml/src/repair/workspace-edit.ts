export { applyTextEdits } from "@btxml/foundation";

import type { TextEdit, WorkspaceEdit } from "@btxml/foundation";

export function groupWorkspaceEditsByUri(workspaceEdits: WorkspaceEdit[]): WorkspaceEdit[] {
  const byUri = new Map<string, TextEdit[]>();
  for (const workspaceEdit of workspaceEdits) {
    const edits = byUri.get(workspaceEdit.uri) ?? [];
    edits.push(...workspaceEdit.edits);
    byUri.set(workspaceEdit.uri, edits);
  }
  return Array.from(byUri.entries()).map(([uri, edits]) => ({ uri, edits }));
}
