import type {
  ScriptAssignmentExpression,
  ScriptComparisonChain,
  ScriptConditionalExpression,
  ScriptExpression,
  ScriptIdentifier,
  ScriptProgram,
} from "../ast.js";
import type { ScriptIdentifierAccess, ScriptIdentifierAccessKind } from "./types.js";

export function collectScriptIdentifiers(program: ScriptProgram): ScriptIdentifierAccess[] {
  const identifiers: ScriptIdentifierAccess[] = [];

  program.statements.forEach((statement, statementIndex) => {
    visitExpression(statement, statementIndex, identifiers, "read");
  });

  return identifiers;
}

function visitExpression(
  expression: ScriptExpression,
  statementIndex: number,
  identifiers: ScriptIdentifierAccess[],
  defaultKind: ScriptIdentifierAccessKind,
) {
  switch (expression.kind) {
    case "Identifier":
      identifiers.push({
        name: expression.name,
        kind: defaultKind,
        range: expression.range,
        identifier: expression,
        statementIndex,
      });
      return;
    case "Literal":
      return;
    case "UnaryExpression":
      visitExpression(expression.argument, statementIndex, identifiers, "read");
      return;
    case "BinaryExpression":
      visitExpression(expression.left, statementIndex, identifiers, "read");
      visitExpression(expression.right, statementIndex, identifiers, "read");
      return;
    case "ComparisonChain":
      visitComparisonChain(expression, statementIndex, identifiers);
      return;
    case "ConditionalExpression":
      visitConditional(expression, statementIndex, identifiers);
      return;
    case "AssignmentExpression":
      visitAssignment(expression, statementIndex, identifiers);
      return;
  }
}

function visitComparisonChain(
  expression: ScriptComparisonChain,
  statementIndex: number,
  identifiers: ScriptIdentifierAccess[],
) {
  for (const operand of expression.operands) {
    visitExpression(operand, statementIndex, identifiers, "read");
  }
}

function visitConditional(
  expression: ScriptConditionalExpression,
  statementIndex: number,
  identifiers: ScriptIdentifierAccess[],
) {
  visitExpression(expression.condition, statementIndex, identifiers, "read");
  visitExpression(expression.thenExpression, statementIndex, identifiers, "read");
  visitExpression(expression.elseExpression, statementIndex, identifiers, "read");
}

function visitAssignment(
  expression: ScriptAssignmentExpression,
  statementIndex: number,
  identifiers: ScriptIdentifierAccess[],
) {
  if (expression.left.kind === "Identifier") {
    identifiers.push({
      name: expression.left.name,
      kind: assignmentKind(expression.operator),
      range: expression.left.range,
      identifier: expression.left,
      statementIndex,
    });
  } else {
    visitExpression(expression.left, statementIndex, identifiers, "read");
  }

  visitExpression(expression.right, statementIndex, identifiers, "read");
}

function assignmentKind(
  operator: ScriptAssignmentExpression["operator"],
): ScriptIdentifierAccessKind {
  if (operator === ":=") return "declare";
  if (operator === "=") return "write";
  return "readwrite";
}

export function isScriptIdentifier(node: ScriptExpression): node is ScriptIdentifier {
  return node.kind === "Identifier";
}
