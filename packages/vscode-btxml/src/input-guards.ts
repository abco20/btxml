export function shouldHandleSlashSnippet(change: { text: string; rangeLength: number }) {
  return change.text === "/" && change.rangeLength === 0;
}

export function shouldHandleOnEnterIndent(text: string) {
  return /^\r?\n[ \t]*$/.test(text);
}
