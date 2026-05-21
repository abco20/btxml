export type ScriptTokenType =
  | "Integer"
  | "Real"
  | "String"
  | "Boolean"
  | "Identifier"
  | "Plus"
  | "Minus"
  | "Star"
  | "Slash"
  | "DotDot"
  | "Ampersand"
  | "Pipe"
  | "Caret"
  | "Tilde"
  | "AmpAmp"
  | "PipePipe"
  | "Bang"
  | "EqualEqual"
  | "BangEqual"
  | "Less"
  | "Greater"
  | "LessEqual"
  | "GreaterEqual"
  | "ColonEqual"
  | "Equal"
  | "PlusEqual"
  | "MinusEqual"
  | "StarEqual"
  | "SlashEqual"
  | "Question"
  | "Colon"
  | "LeftParen"
  | "RightParen"
  | "Semicolon"
  | "EndOfInput"
  | "Error";

export type ScriptToken = {
  type: ScriptTokenType;
  text: string;
  start: number;
  end: number;
};

const TWO_CHAR_TOKENS = new Map<string, ScriptTokenType>([
  ["..", "DotDot"],
  ["&&", "AmpAmp"],
  ["||", "PipePipe"],
  ["==", "EqualEqual"],
  ["!=", "BangEqual"],
  ["<=", "LessEqual"],
  [">=", "GreaterEqual"],
  [":=", "ColonEqual"],
  ["+=", "PlusEqual"],
  ["-=", "MinusEqual"],
  ["*=", "StarEqual"],
  ["/=", "SlashEqual"],
]);

const ONE_CHAR_TOKENS = new Map<string, ScriptTokenType>([
  ["+", "Plus"],
  ["-", "Minus"],
  ["*", "Star"],
  ["/", "Slash"],
  ["&", "Ampersand"],
  ["|", "Pipe"],
  ["^", "Caret"],
  ["~", "Tilde"],
  ["!", "Bang"],
  ["<", "Less"],
  [">", "Greater"],
  ["=", "Equal"],
  ["?", "Question"],
  [":", "Colon"],
  ["(", "LeftParen"],
  [")", "RightParen"],
  [";", "Semicolon"],
]);

export function tokenizeScript(source: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  let offset = 0;

  while (offset < source.length) {
    const char = source[offset];

    if (isWhitespace(char)) {
      offset++;
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = offset;
      offset++;
      while (offset < source.length && isIdentifierContinue(source[offset])) offset++;
      const text = source.slice(start, offset);
      tokens.push({
        type: text === "true" || text === "false" ? "Boolean" : "Identifier",
        text,
        start,
        end: offset,
      });
      continue;
    }

    if (isDigit(char)) {
      const token = scanNumber(source, offset);
      tokens.push(token);
      offset = token.end;
      continue;
    }

    if (char === "'") {
      const token = scanString(source, offset);
      tokens.push(token);
      offset = token.end;
      continue;
    }

    const twoChar = source.slice(offset, offset + 2);
    const twoCharType = TWO_CHAR_TOKENS.get(twoChar);
    if (twoCharType) {
      tokens.push({ type: twoCharType, text: twoChar, start: offset, end: offset + 2 });
      offset += 2;
      continue;
    }

    const oneCharType = ONE_CHAR_TOKENS.get(char);
    if (oneCharType) {
      tokens.push({ type: oneCharType, text: char, start: offset, end: offset + 1 });
      offset += 1;
      continue;
    }

    tokens.push({ type: "Error", text: char, start: offset, end: offset + 1 });
    offset += 1;
  }

  tokens.push({ type: "EndOfInput", text: "", start: source.length, end: source.length });
  return tokens;
}

function scanString(source: string, start: number): ScriptToken {
  let offset = start + 1;
  while (offset < source.length && source[offset] !== "'") offset++;
  if (offset >= source.length) {
    return { type: "Error", text: source.slice(start), start, end: source.length };
  }
  return {
    type: "String",
    text: source.slice(start + 1, offset),
    start,
    end: offset + 1,
  };
}

function scanNumber(source: string, start: number): ScriptToken {
  let offset = start;

  if (source[offset] === "0" && (source[offset + 1] === "x" || source[offset + 1] === "X")) {
    offset += 2;
    const digitsStart = offset;
    while (offset < source.length && isHexDigit(source[offset])) offset++;
    if (digitsStart === offset) {
      offset = consumeNumberErrorTail(source, offset);
      return errorToken(source, start, offset);
    }
    if (isInvalidHexTail(source, offset)) {
      offset = consumeNumberErrorTail(source, offset);
      return errorToken(source, start, offset);
    }
    return { type: "Integer", text: source.slice(start, offset), start, end: offset };
  }

  while (offset < source.length && isDigit(source[offset])) offset++;

  let type: ScriptTokenType = "Integer";

  if (source[offset] === ".") {
    if (source[offset + 1] === ".") {
      return { type, text: source.slice(start, offset), start, end: offset };
    }
    if (!isDigit(source[offset + 1])) {
      offset = consumeNumberErrorTail(source, offset + 1);
      return errorToken(source, start, offset);
    }
    type = "Real";
    offset += 1;
    while (offset < source.length && isDigit(source[offset])) offset++;
  }

  if (source[offset] === "e" || source[offset] === "E") {
    const exponentStart = offset;
    offset += 1;
    if (source[offset] === "+" || source[offset] === "-") offset += 1;
    const digitsStart = offset;
    while (offset < source.length && isDigit(source[offset])) offset++;
    if (digitsStart === offset) {
      offset = consumeNumberErrorTail(source, Math.max(offset, exponentStart + 1));
      return errorToken(source, start, offset);
    }
    type = "Real";
  }

  if (isInvalidDecimalTail(source, offset)) {
    offset = consumeNumberErrorTail(source, offset);
    return errorToken(source, start, offset);
  }

  return { type, text: source.slice(start, offset), start, end: offset };
}

function consumeNumberErrorTail(source: string, offset: number): number {
  let current = offset;
  while (current < source.length) {
    const char = source[current];
    if (isWhitespace(char)) break;
    if (ONE_CHAR_TOKENS.has(char) || TWO_CHAR_TOKENS.has(source.slice(current, current + 2))) break;
    if (char === "." && source[current + 1] === ".") break;
    current++;
  }
  return current;
}

function errorToken(source: string, start: number, end: number): ScriptToken {
  return { type: "Error", text: source.slice(start, end), start, end };
}

function isWhitespace(char: string | undefined) {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isIdentifierStart(char: string | undefined) {
  return char !== undefined && /[A-Za-z_@]/.test(char);
}

function isIdentifierContinue(char: string | undefined) {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function isDigit(char: string | undefined) {
  return char !== undefined && /[0-9]/.test(char);
}

function isHexDigit(char: string | undefined) {
  return char !== undefined && /[0-9A-Fa-f]/.test(char);
}

function isInvalidDecimalTail(source: string, offset: number) {
  const char = source[offset];
  return isIdentifierStart(char) || isDigit(char);
}

function isInvalidHexTail(source: string, offset: number) {
  const char = source[offset];
  return char === "." || isIdentifierStart(char) || isDigit(char);
}
