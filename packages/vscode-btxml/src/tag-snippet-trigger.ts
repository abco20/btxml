const COMPLETION_COMMIT_GREATER_THAN_RE = /^[A-Za-z_:][A-Za-z0-9_.:-]*>$/;

export type TagSnippetTrigger = "slash" | "greater-than" | undefined;

export function getTagSnippetTrigger(change: {
  text: string;
  rangeLength: number;
}): TagSnippetTrigger {
  if (change.text === "/") {
    return change.rangeLength === 0 ? "slash" : undefined;
  }
  if (change.text === ">") {
    return change.rangeLength === 0 ? "greater-than" : undefined;
  }
  if (COMPLETION_COMMIT_GREATER_THAN_RE.test(change.text)) {
    return "greater-than";
  }
  return undefined;
}
