import { classifyScriptIdentifier } from "./analysis/blackboard.js";
import { cloneScriptEnvironment } from "./analysis/environment.js";
import { analyzeScript } from "./analysis/infer.js";
import type { ScriptEnvironment, ScriptSymbol, ScriptType } from "./analysis/types.js";
import type { ScriptRange } from "./ast.js";
import type { ScriptAttributeInfo } from "./classifier.js";
import { parseScript } from "./parser.js";
import { type ScriptToken, tokenizeScript } from "./tokenizer.js";

export type ScriptCursorContext =
  | { kind: "identifier"; prefix: string; range: ScriptRange }
  | { kind: "operator"; prefix: string; range: ScriptRange }
  | { kind: "after-assignment-lhs"; prefix: string; range: ScriptRange }
  | { kind: "literal"; range: ScriptRange }
  | { kind: "unknown"; range: ScriptRange };

export type ScriptCompletionItem = {
  label: string;
  kind: "identifier" | "enum" | "value" | "operator" | "snippet";
  detail?: string;
  replaceRange: ScriptRange;
  insertText?: string;
  insertTextFormat?: "plainText" | "snippet";
  filterText?: string;
  sortText?: string;
};

export type ScriptCompletionInput = {
  source: string;
  cursorOffset: number;
  environment?: ScriptEnvironment;
  attributeName?: string;
  attributeInfo?: ScriptAttributeInfo;
};

const OPERAND_TOKENS = new Set<ScriptToken["type"]>([
  "Identifier",
  "Integer",
  "Real",
  "String",
  "Boolean",
  "RightParen",
]);

const EXPRESSION_START_TOKENS = new Set<ScriptToken["type"]>([
  "LeftParen",
  "Semicolon",
  "Question",
  "Colon",
  "Plus",
  "Minus",
  "Star",
  "Slash",
  "DotDot",
  "Ampersand",
  "Pipe",
  "Caret",
  "Tilde",
  "AmpAmp",
  "PipePipe",
  "Bang",
  "EqualEqual",
  "BangEqual",
  "Less",
  "Greater",
  "LessEqual",
  "GreaterEqual",
  "ColonEqual",
  "Equal",
  "PlusEqual",
  "MinusEqual",
  "StarEqual",
  "SlashEqual",
]);

const EXPRESSION_OPERATORS = [
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "..",
  "?",
  ":",
] as const;
const ASSIGNMENT_OPERATORS = [":=", "=", "+=", "-=", "*=", "/="] as const;
const OPERATOR_PREFIX_CHARS = new Set([
  "!",
  "<",
  ">",
  "=",
  ":",
  "+",
  "-",
  "*",
  "/",
  "&",
  "|",
  "^",
  "?",
  ".",
]);

export function getScriptCompletions(input: ScriptCompletionInput): ScriptCompletionItem[] {
  const source = input.source;
  const cursorOffset = clampOffset(source, input.cursorOffset);
  const cursor = getScriptCursorContext({ source, cursorOffset });
  const items: ScriptCompletionItem[] = [];

  if (cursor.kind === "identifier") {
    items.push(...identifierCompletionItems(input, cursor));
    if (shouldSuggestAssignmentSnippets(input.attributeInfo, source, cursorOffset)) {
      items.push(...assignmentSnippetItems(cursor.range));
    }
  }

  if (cursor.kind === "operator" || cursor.kind === "after-assignment-lhs") {
    items.push(...operatorCompletionItems(cursor.range, cursor.prefix));
  }

  if (cursor.kind === "after-assignment-lhs") {
    items.push(...assignmentOperatorCompletionItems(cursor.range, cursor.prefix));
  }

  return uniqueCompletionItems(items);
}

export function getScriptCursorContext(input: {
  source: string;
  cursorOffset: number;
}): ScriptCursorContext {
  const source = input.source;
  const cursorOffset = clampOffset(source, input.cursorOffset);
  const tokens = tokenizeScript(source).filter((token) => token.type !== "EndOfInput");
  const containing = tokens.find(
    (token) => token.start <= cursorOffset && cursorOffset <= token.end,
  );

  if (containing?.type === "Identifier") {
    return {
      kind: "identifier",
      prefix: containing.text.slice(0, Math.max(0, cursorOffset - containing.start)),
      range: { start: containing.start, end: containing.end },
    };
  }

  if (
    containing &&
    (containing.type === "Integer" ||
      containing.type === "Real" ||
      containing.type === "String" ||
      containing.type === "Boolean")
  ) {
    return {
      kind: "literal",
      range: { start: containing.start, end: containing.end },
    };
  }

  const operatorRange = scanOperatorRange(source, cursorOffset);
  const previousBeforeOperator = previousToken(tokens, operatorRange.start);
  if (
    operatorRange.start < operatorRange.end &&
    previousBeforeOperator &&
    OPERAND_TOKENS.has(previousBeforeOperator.type)
  ) {
    return {
      kind:
        previousBeforeOperator.type === "Identifier" &&
        isAssignmentLhsCandidate(tokens, previousBeforeOperator)
          ? "after-assignment-lhs"
          : "operator",
      prefix: source.slice(operatorRange.start, cursorOffset),
      range: operatorRange,
    };
  }

  const previous = previousToken(tokens, cursorOffset);
  if (previous && OPERAND_TOKENS.has(previous.type) && previous.end <= cursorOffset) {
    return {
      kind:
        previous.type === "Identifier" && isAssignmentLhsCandidate(tokens, previous)
          ? "after-assignment-lhs"
          : "operator",
      prefix: "",
      range: { start: cursorOffset, end: cursorOffset },
    };
  }

  if (!previous || EXPRESSION_START_TOKENS.has(previous.type)) {
    return {
      kind: "identifier",
      prefix: "",
      range: { start: cursorOffset, end: cursorOffset },
    };
  }

  return { kind: "unknown", range: { start: cursorOffset, end: cursorOffset } };
}

function identifierCompletionItems(
  input: ScriptCompletionInput,
  cursor: Extract<ScriptCursorContext, { kind: "identifier" }>,
): ScriptCompletionItem[] {
  const environment = environmentBeforeCursor(input);
  const prefix = cursor.prefix.toLowerCase();
  const items: ScriptCompletionItem[] = [];

  for (const [name, value] of environment.enums) {
    if (!matchesPrefix(name, prefix)) continue;
    items.push({
      label: name,
      kind: "enum",
      detail: `enum value ${value}`,
      replaceRange: cursor.range,
      sortText: `0-${name}`,
    });
  }

  for (const symbol of environment.symbols.values()) {
    if (symbol.conflict) continue;
    if (!symbol.readable) continue;
    if (!matchesPrefix(symbol.name, prefix)) continue;
    items.push({
      label: symbol.name,
      kind: "identifier",
      detail: describeScriptSymbol(symbol),
      replaceRange: cursor.range,
      sortText:
        symbol.source.kind === "script-assignment" ? `1-${symbol.name}` : `2-${symbol.name}`,
    });
  }

  for (const symbol of environment.globalBlackboard.values()) {
    if (symbol.conflict) continue;
    if (!symbol.readable) continue;
    const label = `@${symbol.name}`;
    if (!matchesPrefix(label, prefix)) continue;
    items.push({
      label,
      kind: "identifier",
      detail: describeScriptSymbol(symbol),
      replaceRange: cursor.range,
      sortText: `2-${label}`,
    });
  }

  for (const value of ["true", "false"]) {
    if (!matchesPrefix(value, prefix)) continue;
    items.push({
      label: value,
      kind: "value",
      detail: "bool",
      replaceRange: cursor.range,
      sortText: `3-${value}`,
    });
  }

  return items;
}

function operatorCompletionItems(range: ScriptRange, prefix: string): ScriptCompletionItem[] {
  return EXPRESSION_OPERATORS.filter((operator) => matchesPrefix(operator, prefix)).map(
    (operator) => ({
      label: operator,
      kind: "operator",
      detail: "script operator",
      replaceRange: range,
      sortText: `4-${operator}`,
    }),
  );
}

function assignmentOperatorCompletionItems(
  range: ScriptRange,
  prefix: string,
): ScriptCompletionItem[] {
  return ASSIGNMENT_OPERATORS.filter((operator) => matchesPrefix(operator, prefix)).map(
    (operator) => ({
      label: operator,
      kind: "operator",
      detail: "assignment operator",
      replaceRange: range,
      sortText: `5-${operator}`,
    }),
  );
}

function assignmentSnippetItems(range: ScriptRange): ScriptCompletionItem[] {
  return [
    {
      label: "name := value",
      kind: "snippet",
      detail: "Declare local script variable",
      replaceRange: range,
      insertText: "${1:name} := ${2:value}",
      insertTextFormat: "snippet",
      sortText: "6-name := value",
    },
    {
      label: "name = value",
      kind: "snippet",
      detail: "Assign existing variable",
      replaceRange: range,
      insertText: "${1:name} = ${2:value}",
      insertTextFormat: "snippet",
      sortText: "6-name = value",
    },
  ];
}

function environmentBeforeCursor(input: ScriptCompletionInput): ScriptEnvironment {
  const environment = cloneScriptEnvironment(input.environment);
  const tokens = tokenizeScript(input.source);
  const parsed = parseScript(input.source);
  if (parsed.ok) {
    const analyzed = analyzeScript({
      program: parsed.program,
      environment,
      attributeName: input.attributeName,
    });
    const next = cloneScriptEnvironment(input.environment);

    for (const symbol of analyzed.introducedSymbols) {
      if (symbol.source.kind !== "script-assignment") continue;
      if (symbol.source.range.end > input.cursorOffset) continue;
      next.symbols.set(symbol.name, symbol);
    }

    for (const access of analyzed.globalBlackboardAccesses) {
      if (access.kind === "read") continue;
      if (access.range.end > input.cursorOffset) continue;

      const analyzedSymbol = analyzed.environment.globalBlackboard.get(access.key);
      const existing = next.globalBlackboard.get(access.key);
      let symbol: ScriptSymbol;
      if (analyzedSymbol) {
        symbol = { ...analyzedSymbol };
      } else if (existing) {
        symbol = { ...existing, type: access.inferredType };
      } else {
        symbol = {
          name: access.key,
          type: access.inferredType,
          source: {
            kind: "global-blackboard",
            key: access.key,
            range: access.range,
          },
          readable: true,
          writable: true,
        };
      }
      next.globalBlackboard.set(access.key, symbol);
    }

    return next;
  }

  for (const token of tokens) {
    if (token.type !== "Identifier") continue;
    if (token.end > input.cursorOffset) break;
    const next = nextToken(tokens, token.end);
    if (next?.type !== "ColonEqual") continue;
    if (next.end > input.cursorOffset) continue;
    const classified = classifyScriptIdentifier(token.text);
    if (classified.kind === "invalid-global-blackboard") continue;

    if (classified.kind === "global-blackboard") {
      if (environment.globalBlackboard.has(classified.key)) continue;
      environment.globalBlackboard.set(classified.key, {
        name: classified.key,
        type: { kind: "unknown" },
        source: {
          kind: "global-blackboard",
          key: classified.key,
          range: { start: token.start, end: token.end },
        },
        readable: true,
        writable: true,
      });
      continue;
    }

    if (environment.symbols.has(classified.name)) continue;
    environment.symbols.set(classified.name, {
      name: classified.name,
      type: { kind: "unknown" },
      source: {
        kind: "script-assignment",
        attributeName: input.attributeName ?? "code",
        range: { start: token.start, end: token.end },
      },
      readable: true,
      writable: true,
    });
  }

  return environment;
}

function describeScriptSymbol(symbol: ScriptSymbol): string {
  const typeLabel = formatScriptType(symbol.type);

  switch (symbol.source.kind) {
    case "port-remap":
      return `${typeLabel} from ${symbol.source.nodeType ?? "node"}.${symbol.source.portName}`;
    case "global-blackboard-remap":
      return `${typeLabel} from global blackboard ${symbol.source.nodeType ?? "node"}.${symbol.source.portName}`;
    case "subtree-port":
      return `${typeLabel} from ${symbol.source.nodeType ?? "SubTree"}.${symbol.source.portName}`;
    case "script-assignment":
      return `${typeLabel} from earlier ${symbol.source.attributeName} declaration`;
    case "global-blackboard":
      return `${typeLabel} from global blackboard @${symbol.source.key}`;
    case "augmentation":
      return `${typeLabel} from augmentation`;
    case "enum":
      return `${typeLabel} enum`;
  }
}

function formatScriptType(type: ScriptType): string {
  switch (type.kind) {
    case "number":
    case "string":
    case "bool":
    case "any":
    case "unknown":
    case "error":
      return type.kind;
    case "custom":
      return type.name;
  }
}

function shouldSuggestAssignmentSnippets(
  attributeInfo: ScriptAttributeInfo | undefined,
  source: string,
  cursorOffset: number,
) {
  if (attributeInfo?.expectedResult !== "ignored") return false;
  const tokens = tokenizeScript(source).filter((token) => token.type !== "EndOfInput");
  const previous = previousToken(tokens, cursorOffset);
  return !previous || previous.type === "Semicolon";
}

function scanOperatorRange(source: string, cursorOffset: number): ScriptRange {
  let start = cursorOffset;
  while (start > 0 && OPERATOR_PREFIX_CHARS.has(source[start - 1] ?? "")) start -= 1;

  let end = cursorOffset;
  while (end < source.length && OPERATOR_PREFIX_CHARS.has(source[end] ?? "")) end += 1;

  return { start, end };
}

function previousToken(tokens: ScriptToken[], cursorOffset: number) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.end <= cursorOffset) return token;
  }
  return undefined;
}

function isAssignmentLhsCandidate(tokens: ScriptToken[], identifier: ScriptToken) {
  if (identifier.type !== "Identifier") return false;
  const previous = previousToken(tokens, identifier.start);
  return !previous || previous.type === "Semicolon";
}

function nextToken(tokens: ScriptToken[], cursorOffset: number) {
  return tokens.find((token) => token.start >= cursorOffset && token.type !== "EndOfInput");
}

function matchesPrefix(value: string, prefix: string) {
  return prefix.length === 0 || value.toLowerCase().startsWith(prefix.toLowerCase());
}

function clampOffset(source: string, cursorOffset: number) {
  return Math.max(0, Math.min(source.length, cursorOffset));
}

function uniqueCompletionItems(items: ScriptCompletionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.label}:${item.insertText ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
