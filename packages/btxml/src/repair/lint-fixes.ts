import type { Diagnostic, WorkspaceEdit } from "@btxml/foundation";
import type { BtDocument } from "@btxml/syntax";
import {
  getLintFixCandidates as getCandidates,
  mergeFixCandidatesToWorkspaceEdits,
} from "../fix/candidates.ts";
export { serializeTreeNodeModelDefinition } from "../fix/candidates.ts";

export function getLintFixCandidates(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}) {
  return getCandidates(input);
}

export function getSafeLintFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const candidates = getCandidates(input).filter((candidate) => candidate.safety === "safe");
  return mergeFixCandidatesToWorkspaceEdits(candidates);
}
