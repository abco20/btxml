import type { z } from "zod";
import type { ConfigDiagnostic } from "./types.js";

export function zodIssuesToConfigDiagnostics(issues: z.core.$ZodIssue[]): ConfigDiagnostic[] {
  return issues.flatMap(zodIssueToConfigDiagnostic);
}

export function zodIssueToConfigDiagnostic(issue: z.core.$ZodIssue): ConfigDiagnostic[] {
  const code = String(issue.code);
  if (code === "unrecognized_keys") {
    const keys = Array.isArray((issue as { keys?: unknown }).keys)
      ? ((issue as { keys: unknown[] }).keys ?? [])
      : [];

    return keys.map((key) => {
      const path = configPath([...issue.path, String(key)]);
      return {
        code: "CFG002_UNKNOWN_CONFIG_FIELD",
        severity: "error",
        path,
        message: `unknown config field \`${path}\``,
      };
    });
  }

  const path = configPath(issue.path);
  if (isInvalidValueIssue(issue)) {
    return [
      {
        code: "CFG003_INVALID_CONFIG_VALUE",
        severity: "error",
        path,
        message: path ? `invalid config value at \`${path}\`` : "invalid config value",
      },
    ];
  }

  return [
    {
      code: "CFG001_INVALID_CONFIG",
      severity: "error",
      path,
      message: path ? `invalid config at \`${path}\`` : "invalid config",
    },
  ];
}

function configPath(path: readonly PropertyKey[]): string | undefined {
  return path.map(String).join(".") || undefined;
}

function isInvalidValueIssue(issue: z.core.$ZodIssue): boolean {
  const code = String(issue.code);
  if (code === "invalid_value" || code === "invalid_enum_value" || code === "invalid_literal") {
    return true;
  }

  if (code !== "invalid_union") return false;

  const unionErrors = (issue as { errors?: unknown; unionErrors?: unknown }).errors;
  if (Array.isArray(unionErrors)) {
    return unionErrors.flat().some(isZodIssueLikeInvalidValue);
  }

  const zodUnionErrors = (issue as { unionErrors?: { issues?: unknown[] }[] }).unionErrors;
  return Array.isArray(zodUnionErrors)
    ? zodUnionErrors.flatMap((error) => error.issues ?? []).some(isZodIssueLikeInvalidValue)
    : false;
}

function isZodIssueLikeInvalidValue(issue: unknown): boolean {
  return (
    typeof issue === "object" && issue !== null && isInvalidValueIssue(issue as z.core.$ZodIssue)
  );
}
