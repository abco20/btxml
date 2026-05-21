import { checkBtWorkspace } from "../check-workspace.js";
import type { WorkspaceCheckInput, WorkspaceCheckResult } from "../types.js";

export type CheckNodeWorkspaceInput = WorkspaceCheckInput;

export async function checkNodeWorkspace(
  input: CheckNodeWorkspaceInput,
): Promise<WorkspaceCheckResult> {
  return checkBtWorkspace(input);
}
