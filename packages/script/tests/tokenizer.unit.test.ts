import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeScript } from "@btxml/script";

test("tokenizeScript tokenizes BT.CPP operators and literals", () => {
  const tokens = tokenizeScript(
    "A:=1; A = 1; A += 1; A==B; A!=B; A<=B; A>=B; A && B || C; A .. 'suffix'; 0xFF; 1.23; 1e-3; 'hello world'; true; false",
  );

  assert.deepEqual(
    tokens.map((token) => token.type),
    [
      "Identifier",
      "ColonEqual",
      "Integer",
      "Semicolon",
      "Identifier",
      "Equal",
      "Integer",
      "Semicolon",
      "Identifier",
      "PlusEqual",
      "Integer",
      "Semicolon",
      "Identifier",
      "EqualEqual",
      "Identifier",
      "Semicolon",
      "Identifier",
      "BangEqual",
      "Identifier",
      "Semicolon",
      "Identifier",
      "LessEqual",
      "Identifier",
      "Semicolon",
      "Identifier",
      "GreaterEqual",
      "Identifier",
      "Semicolon",
      "Identifier",
      "AmpAmp",
      "Identifier",
      "PipePipe",
      "Identifier",
      "Semicolon",
      "Identifier",
      "DotDot",
      "String",
      "Semicolon",
      "Integer",
      "Semicolon",
      "Real",
      "Semicolon",
      "Real",
      "Semicolon",
      "String",
      "Semicolon",
      "Boolean",
      "Semicolon",
      "Boolean",
      "EndOfInput",
    ],
  );
});

test("tokenizeScript reports invalid tokens for malformed literals", () => {
  const cases = ["'unterminated", "65.", "0x", "0x1.2", "1e+", "@"];

  const expected = ["Error", "Error", "Error", "Error", "Error", "Identifier"];

  cases.forEach((source, index) => {
    const tokens = tokenizeScript(source);
    assert.equal(tokens[0]?.type, expected[index], source);
  });
});
