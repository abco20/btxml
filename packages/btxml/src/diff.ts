export function unifiedDiff(before: string, after: string, filePath = "file.xml") {
  if (before === after) return "";
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const lines = [`--- ${filePath}`, `+++ ${filePath}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`- ${a[i]}`);
    if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
  }
  return lines.join("\n");
}
