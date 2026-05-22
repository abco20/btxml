export type BlackboardScope = "local" | "global";

export type BlackboardReferenceSyntax = "braced" | "shorthand" | "script";

export type BlackboardReference = {
  readonly scope: BlackboardScope;
  readonly key: string;
  readonly raw: string;
  readonly syntax: BlackboardReferenceSyntax;
};

export type BlackboardReferenceParseErrorKind =
  | "empty-key"
  | "invalid-key"
  | "invalid-global-key"
  | "unbalanced-braces"
  | "not-a-reference";

export type BlackboardReferenceParseError = {
  readonly kind: BlackboardReferenceParseErrorKind;
  readonly raw: string;
  readonly message: string;
};

export type ParseBlackboardReferenceResult =
  | { readonly ok: true; readonly reference: BlackboardReference }
  | { readonly ok: false; readonly error: BlackboardReferenceParseError };

type ParseBlackboardReferenceSuccess = Extract<
  ParseBlackboardReferenceResult,
  { readonly ok: true }
>;
type ParseBlackboardReferenceFailure = Extract<
  ParseBlackboardReferenceResult,
  { readonly ok: false }
>;

const BLACKBOARD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_./:-]*$/;

function ok(reference: BlackboardReference): ParseBlackboardReferenceSuccess {
  return { ok: true, reference };
}

function error(
  kind: BlackboardReferenceParseErrorKind,
  raw: string,
  message: string,
): ParseBlackboardReferenceFailure {
  return {
    ok: false,
    error: {
      kind,
      raw,
      message,
    },
  };
}

function isValidKey(key: string): boolean {
  return BLACKBOARD_KEY_RE.test(key);
}

function parseScopedKey(
  raw: string,
):
  | { readonly ok: true; readonly scope: BlackboardScope; readonly key: string }
  | { readonly ok: false; readonly error: BlackboardReferenceParseError } {
  if (!raw) {
    return error("empty-key", raw, "Blackboard reference key must not be empty");
  }

  if (raw[0] === "@") {
    const key = raw.slice(1);
    if (!key) {
      return error("empty-key", raw, "Global blackboard reference key must not be empty");
    }
    if (!isValidKey(key)) {
      return error("invalid-global-key", raw, `Invalid global blackboard reference key: ${raw}`);
    }
    return { ok: true, scope: "global", key };
  }

  if (!isValidKey(raw)) {
    return error("invalid-key", raw, `Invalid blackboard reference key: ${raw}`);
  }

  return { ok: true, scope: "local", key: raw };
}

export function parsePortBlackboardReference(input: {
  portName: string;
  rawValue: string;
}): ParseBlackboardReferenceResult {
  const { portName } = input;
  const rawValue = input.rawValue.trim();

  if (rawValue === "=" || rawValue === "{=}") {
    return ok({
      scope: "local",
      key: portName,
      raw: rawValue,
      syntax: "shorthand",
    });
  }

  if (!rawValue.startsWith("{") && !rawValue.endsWith("}")) {
    return error("not-a-reference", rawValue, `Not a blackboard reference: ${rawValue}`);
  }

  if (!(rawValue.startsWith("{") && rawValue.endsWith("}"))) {
    return error(
      "unbalanced-braces",
      rawValue,
      `Unbalanced blackboard reference braces: ${rawValue}`,
    );
  }

  const body = rawValue.slice(1, -1).trim();
  const parsed = parseScopedKey(body);
  if (!parsed.ok) {
    return parsed;
  }

  return ok({
    scope: parsed.scope,
    key: parsed.key,
    raw: rawValue,
    syntax: "braced",
  });
}

export function parseScriptBlackboardIdentifier(input: {
  rawName: string;
}): ParseBlackboardReferenceResult {
  const { rawName } = input;
  if (!rawName.startsWith("@")) {
    return error("not-a-reference", rawName, `Not a script blackboard identifier: ${rawName}`);
  }

  const parsed = parseScopedKey(rawName);
  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.scope !== "global") {
    return error(
      "not-a-reference",
      rawName,
      `Script blackboard identifiers must use the global scope marker: ${rawName}`,
    );
  }

  return ok({
    scope: parsed.scope,
    key: parsed.key,
    raw: rawName,
    syntax: "script",
  });
}

export function formatBlackboardReference(
  reference: Pick<BlackboardReference, "scope" | "key">,
): string {
  return reference.scope === "global" ? `{@${reference.key}}` : `{${reference.key}}`;
}

export function formatScriptBlackboardIdentifier(
  reference: Pick<BlackboardReference, "scope" | "key">,
): string {
  return reference.scope === "global" ? `@${reference.key}` : reference.key;
}

export function makeBlackboardIdentity(
  reference: Pick<BlackboardReference, "scope" | "key">,
): string {
  return `${reference.scope}:${reference.key}`;
}
