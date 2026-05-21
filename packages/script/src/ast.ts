export type ScriptRange = {
  start: number;
  end: number;
};

export type ScriptNode =
  | ScriptProgram
  | ScriptIdentifier
  | ScriptLiteral
  | ScriptUnaryExpression
  | ScriptBinaryExpression
  | ScriptComparisonChain
  | ScriptAssignmentExpression
  | ScriptConditionalExpression;

export type ScriptProgram = {
  kind: "Program";
  statements: ScriptExpression[];
  range: ScriptRange;
};

export type ScriptExpression =
  | ScriptIdentifier
  | ScriptLiteral
  | ScriptUnaryExpression
  | ScriptBinaryExpression
  | ScriptComparisonChain
  | ScriptAssignmentExpression
  | ScriptConditionalExpression;

export type ScriptIdentifier = {
  kind: "Identifier";
  name: string;
  range: ScriptRange;
};

export type ScriptLiteral = {
  kind: "Literal";
  valueKind: "integer" | "real" | "string" | "boolean";
  raw: string;
  value?: unknown;
  range: ScriptRange;
};

export type ScriptUnaryExpression = {
  kind: "UnaryExpression";
  operator: "-" | "~" | "!";
  argument: ScriptExpression;
  range: ScriptRange;
};

export type ScriptBinaryExpression = {
  kind: "BinaryExpression";
  operator: "+" | "-" | "*" | "/" | ".." | "&" | "|" | "^" | "&&" | "||";
  left: ScriptExpression;
  right: ScriptExpression;
  range: ScriptRange;
};

export type ScriptComparisonChain = {
  kind: "ComparisonChain";
  operands: ScriptExpression[];
  operators: Array<"==" | "!=" | "<" | ">" | "<=" | ">=">;
  range: ScriptRange;
};

export type ScriptAssignmentExpression = {
  kind: "AssignmentExpression";
  operator: ":=" | "=" | "+=" | "-=" | "*=" | "/=";
  left: ScriptExpression;
  right: ScriptExpression;
  range: ScriptRange;
};

export type ScriptConditionalExpression = {
  kind: "ConditionalExpression";
  condition: ScriptExpression;
  thenExpression: ScriptExpression;
  elseExpression: ScriptExpression;
  range: ScriptRange;
};
