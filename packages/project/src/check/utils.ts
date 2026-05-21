import { type Diagnostic, DiagnosticSeverity } from "@btxml/foundation";

const severityRank: Record<Diagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function hasFailingDiagnostics(diagnostics: Diagnostic[], maxWarnings?: number): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === DiagnosticSeverity.Error ||
      (maxWarnings === 0 && diagnostic.severity === DiagnosticSeverity.Warning),
  );
}

export function collectDiagnostics(groups: Diagnostic[][]): Diagnostic[] {
  return groups.flat().sort((a, b) => {
    const uri = a.uri.localeCompare(b.uri);
    if (uri !== 0) return uri;

    const aOffset = a.range?.start.offset ?? -1;
    const bOffset = b.range?.start.offset ?? -1;
    if (aOffset !== bOffset) return aOffset - bOffset;

    const severity = severityRank[a.severity] - severityRank[b.severity];
    if (severity !== 0) return severity;

    const code = a.code.localeCompare(b.code);
    if (code !== 0) return code;

    return a.message.localeCompare(b.message);
  });
}
