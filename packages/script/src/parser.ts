import type {
  ScriptAssignmentExpression,
  ScriptBinaryExpression,
  ScriptComparisonChain,
  ScriptConditionalExpression,
  ScriptExpression,
  ScriptIdentifier,
  ScriptLiteral,
  ScriptProgram,
  ScriptRange,
  ScriptUnaryExpression,
} from "./ast.js";
import { type ScriptToken, tokenizeScript } from "./tokenizer.js";

export type ScriptParseErrorKind =
  | "invalid-token"
  | "expected-operand"
  | "expected-right-paren"
  | "expected-ternary-colon"
  | "empty-script"
  | "unexpected-token-after-expression";

export type ScriptParseError = {
  kind: ScriptParseErrorKind;
  message: string;
  range: ScriptRange;
};

export type ParseScriptResult =
  | { ok: true; program: ScriptProgram; tokens: ScriptToken[] }
  | { ok: false; errors: ScriptParseError[]; tokens: ScriptToken[] };

const ASSIGNMENT_OPERATORS = new Map<ScriptToken["type"], ScriptAssignmentExpression["operator"]>([
  ["ColonEqual", ":="],
  ["Equal", "="],
  ["PlusEqual", "+="],
  ["MinusEqual", "-="],
  ["StarEqual", "*="],
  ["SlashEqual", "/="],
]);

const BINARY_OPERATORS = new Map<ScriptToken["type"], ScriptBinaryExpression["operator"]>([
  ["PipePipe", "||"],
  ["AmpAmp", "&&"],
  ["Pipe", "|"],
  ["Caret", "^"],
  ["Ampersand", "&"],
  ["Plus", "+"],
  ["Minus", "-"],
  ["DotDot", ".."],
  ["Star", "*"],
  ["Slash", "/"],
]);

const COMPARISON_OPERATORS = new Map<
  ScriptToken["type"],
  ScriptComparisonChain["operators"][number]
>([
  ["EqualEqual", "=="],
  ["BangEqual", "!="],
  ["Less", "<"],
  ["Greater", ">"],
  ["LessEqual", "<="],
  ["GreaterEqual", ">="],
]);

const PRECEDENCE = {
  assignment: 2,
  ternary: 4,
  pipePipe: 6,
  ampAmp: 8,
  comparison: 10,
  pipeCaret: 12,
  ampersand: 14,
  additive: 16,
  multiplicative: 18,
} as const;

export function parseScript(source: string): ParseScriptResult {
  const tokens = tokenizeScript(source);
  const invalidTokens = tokens.filter((token) => token.type === "Error");
  if (invalidTokens.length > 0) {
    return {
      ok: false,
      errors: invalidTokens.map((token) => ({
        kind: "invalid-token",
        message: `invalid token \`${token.text}\``,
        range: { start: token.start, end: token.end },
      })),
      tokens,
    };
  }

  return parseProgram(tokens, source);
}

export function parseProgram(tokens: ScriptToken[], source = ""): ParseScriptResult {
  const parser = new Parser(tokens, source);
  const statements: ScriptExpression[] = [];

  if (parser.peek().type === "EndOfInput") {
    return {
      ok: false,
      errors: [
        {
          kind: "empty-script",
          message: "empty script",
          range: { start: 0, end: 0 },
        },
      ],
      tokens,
    };
  }

  while (parser.peek().type !== "EndOfInput") {
    const expression = parser.parseExpression(0);
    if (!expression) {
      return { ok: false, errors: parser.errors, tokens };
    }
    statements.push(expression);
    while (parser.match("Semicolon")) {
      // BT.CPP accepts redundant semicolons between statements.
    }
  }

  if (parser.errors.length > 0) {
    return { ok: false, errors: parser.errors, tokens };
  }

  const range = rangeFromStatements(statements);
  return {
    ok: true,
    program: {
      kind: "Program",
      statements,
      range,
    },
    tokens,
  };
}

class Parser {
  readonly errors: ScriptParseError[] = [];

  constructor(
    private readonly tokens: ScriptToken[],
    private readonly source: string,
    private index = 0,
  ) {}

  parseExpression(minBindingPower: number): ScriptExpression | undefined {
    let left = this.parsePrefix();
    if (!left) return undefined;

    while (true) {
      const token = this.peek();

      if (
        token.type === "EndOfInput" ||
        token.type === "Semicolon" ||
        token.type === "RightParen" ||
        token.type === "Colon"
      ) {
        break;
      }

      const assignmentOperator = ASSIGNMENT_OPERATORS.get(token.type);
      if (assignmentOperator) {
        if (minBindingPower >= PRECEDENCE.assignment) break;
        this.consume();
        const right = this.parseExpression(0);
        if (!right) return undefined;
        left = {
          kind: "AssignmentExpression",
          operator: assignmentOperator,
          left,
          right,
          range: span(left.range, right.range),
        };
        break;
      }

      if (token.type === "Question") {
        if (minBindingPower >= PRECEDENCE.ternary) break;
        this.consume();
        const thenExpression = this.parseExpression(0);
        if (!thenExpression) return undefined;

        if (!this.match("Colon")) {
          this.reportError(
            "expected-ternary-colon",
            "expected ':' in ternary expression",
            this.peek(),
          );
          return undefined;
        }

        const elseExpression = this.parseExpression(PRECEDENCE.ternary);
        if (!elseExpression) return undefined;
        left = {
          kind: "ConditionalExpression",
          condition: left,
          thenExpression,
          elseExpression,
          range: span(left.range, elseExpression.range),
        };
        break;
      }

      const comparisonOperator = COMPARISON_OPERATORS.get(token.type);
      if (comparisonOperator) {
        if (minBindingPower >= PRECEDENCE.comparison) break;
        this.consume();
        const operands: ScriptExpression[] = [left];
        const operators: ScriptComparisonChain["operators"] = [comparisonOperator];
        const firstRight = this.parseExpression(PRECEDENCE.comparison);
        if (!firstRight) return undefined;
        operands.push(firstRight);

        while (true) {
          const nextOperator = COMPARISON_OPERATORS.get(this.peek().type);
          if (!nextOperator) break;
          this.consume();
          const operand = this.parseExpression(PRECEDENCE.comparison);
          if (!operand) return undefined;
          operators.push(nextOperator);
          operands.push(operand);
        }

        left = {
          kind: "ComparisonChain",
          operands,
          operators,
          range: span(operands[0].range, operands[operands.length - 1].range),
        };
        continue;
      }

      const binaryOperator = BINARY_OPERATORS.get(token.type);
      const precedence = binaryOperator ? binaryPrecedence(token.type) : undefined;
      if (binaryOperator && precedence !== undefined) {
        if (minBindingPower >= precedence) break;
        this.consume();
        const right = this.parseExpression(precedence);
        if (!right) return undefined;
        left = {
          kind: "BinaryExpression",
          operator: binaryOperator,
          left,
          right,
          range: span(left.range, right.range),
        };
        continue;
      }

      this.reportError(
        "unexpected-token-after-expression",
        `unexpected token after expression: \`${token.text || token.type}\``,
        token,
      );
      return undefined;
    }

    return left;
  }

  parsePrefix(): ScriptExpression | undefined {
    const token = this.peek();

    switch (token.type) {
      case "Identifier":
        this.consume();
        return { kind: "Identifier", name: token.text, range: tokenRange(token) };
      case "Integer":
      case "Real":
      case "Boolean":
      case "String":
        this.consume();
        return literalFromToken(token, this.source);
      case "Minus":
      case "Tilde":
      case "Bang": {
        this.consume();
        const argument = this.parseExpression(20);
        if (!argument) return undefined;
        return {
          kind: "UnaryExpression",
          operator: unaryOperator(token.type),
          argument,
          range: span(tokenRange(token), argument.range),
        };
      }
      case "LeftParen": {
        const open = this.consume();
        const expression = this.parseExpression(0);
        if (!expression) return undefined;
        const close = this.peek();
        if (close.type !== "RightParen") {
          this.reportError("expected-right-paren", "expected ')'", close);
          return undefined;
        }
        this.consume();
        return withRange(expression, { start: open.start, end: close.end });
      }
      default:
        this.reportError("expected-operand", "expected operand", token);
        return undefined;
    }
  }

  peek() {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  consume() {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  match(type: ScriptToken["type"]) {
    if (this.peek().type !== type) return false;
    this.consume();
    return true;
  }

  private reportError(kind: ScriptParseErrorKind, message: string, token: ScriptToken) {
    this.errors.push({ kind, message, range: tokenRange(token) });
  }
}

function literalFromToken(token: ScriptToken, source: string): ScriptLiteral {
  switch (token.type) {
    case "Integer":
      return {
        kind: "Literal",
        valueKind: "integer",
        raw: source.slice(token.start, token.end),
        value:
          token.text.startsWith("0x") || token.text.startsWith("0X")
            ? Number(token.text)
            : Number.parseInt(token.text, 10),
        range: tokenRange(token),
      };
    case "Real":
      return {
        kind: "Literal",
        valueKind: "real",
        raw: source.slice(token.start, token.end),
        value: Number(token.text),
        range: tokenRange(token),
      };
    case "Boolean":
      return {
        kind: "Literal",
        valueKind: "boolean",
        raw: source.slice(token.start, token.end),
        value: token.text === "true",
        range: tokenRange(token),
      };
    case "String":
      return {
        kind: "Literal",
        valueKind: "string",
        raw: source.slice(token.start, token.end),
        value: token.text,
        range: tokenRange(token),
      };
    default:
      throw new Error(`unsupported literal token ${token.type}`);
  }
}

function unaryOperator(type: ScriptToken["type"]): ScriptUnaryExpression["operator"] {
  switch (type) {
    case "Minus":
      return "-";
    case "Tilde":
      return "~";
    case "Bang":
      return "!";
    default:
      throw new Error(`unsupported unary token ${type}`);
  }
}

function binaryPrecedence(type: ScriptToken["type"]) {
  switch (type) {
    case "PipePipe":
      return PRECEDENCE.pipePipe;
    case "AmpAmp":
      return PRECEDENCE.ampAmp;
    case "Pipe":
    case "Caret":
      return PRECEDENCE.pipeCaret;
    case "Ampersand":
      return PRECEDENCE.ampersand;
    case "Plus":
    case "Minus":
    case "DotDot":
      return PRECEDENCE.additive;
    case "Star":
    case "Slash":
      return PRECEDENCE.multiplicative;
    default:
      return undefined;
  }
}

function tokenRange(token: ScriptToken): ScriptRange {
  return { start: token.start, end: token.end };
}

function span(start: ScriptRange, end: ScriptRange): ScriptRange {
  return { start: start.start, end: end.end };
}

function withRange(expression: ScriptExpression, range: ScriptRange): ScriptExpression {
  return { ...expression, range };
}

function rangeFromStatements(statements: ScriptExpression[]): ScriptRange {
  return {
    start: statements[0]?.range.start ?? 0,
    end: statements[statements.length - 1]?.range.end ?? 0,
  };
}
