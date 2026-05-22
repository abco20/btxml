import type { ScriptAssignmentExpression, ScriptExpression } from "../ast.js";
import { classifyScriptIdentifier } from "./blackboard.js";
import {
  cloneScriptEnvironment,
  commonScriptType,
  isScriptTypeAssignable,
  isScriptTypeBoolCompatible,
} from "./environment.js";
import type {
  AnalyzeScriptInput,
  AnalyzeScriptResult,
  ResolvedScriptIdentifier,
  ScriptAnalysisDiagnostic,
  ScriptEnvironment,
  ScriptIdentifierAccess,
  ScriptSymbol,
  ScriptType,
} from "./types.js";

const NUMBER_TYPE: ScriptType = { kind: "number" };
const STRING_TYPE: ScriptType = { kind: "string" };
const BOOL_TYPE: ScriptType = { kind: "bool" };
const UNKNOWN_TYPE: ScriptType = { kind: "unknown" };
const ERROR_TYPE: ScriptType = { kind: "error" };

export function analyzeScript(input: AnalyzeScriptInput): AnalyzeScriptResult {
  const environment = cloneScriptEnvironment(input.environment);
  const identifiers: ScriptIdentifierAccess[] = [];
  const resolvedIdentifiers: ResolvedScriptIdentifier[] = [];
  const unknownIdentifiers: ScriptIdentifierAccess[] = [];
  const globalBlackboardAccesses: AnalyzeScriptResult["globalBlackboardAccesses"] = [];
  const invalidGlobalBlackboardIdentifiers: AnalyzeScriptResult["invalidGlobalBlackboardIdentifiers"] =
    [];
  const introducedSymbols: ScriptSymbol[] = [];
  const diagnostics: ScriptAnalysisDiagnostic[] = [];
  const statementTypes: ScriptType[] = [];

  input.program.statements.forEach((statement, statementIndex) => {
    statementTypes.push(
      analyzeExpression({
        expression: statement,
        statementIndex,
        environment,
        identifiers,
        resolvedIdentifiers,
        unknownIdentifiers,
        globalBlackboardAccesses,
        invalidGlobalBlackboardIdentifiers,
        introducedSymbols,
        diagnostics,
        attributeName: input.attributeName ?? "code",
        originId: input.originId,
      }),
    );
  });

  return {
    environment,
    identifiers,
    resolvedIdentifiers,
    unknownIdentifiers,
    globalBlackboardAccesses,
    invalidGlobalBlackboardIdentifiers,
    introducedSymbols,
    diagnostics,
    statementTypes,
    finalType: statementTypes.at(-1),
  };
}

type AnalyzeExpressionContext = {
  expression: ScriptExpression;
  statementIndex: number;
  environment: ScriptEnvironment;
  identifiers: ScriptIdentifierAccess[];
  resolvedIdentifiers: ResolvedScriptIdentifier[];
  unknownIdentifiers: ScriptIdentifierAccess[];
  globalBlackboardAccesses: AnalyzeScriptResult["globalBlackboardAccesses"];
  invalidGlobalBlackboardIdentifiers: AnalyzeScriptResult["invalidGlobalBlackboardIdentifiers"];
  introducedSymbols: ScriptSymbol[];
  diagnostics: ScriptAnalysisDiagnostic[];
  attributeName: string;
  originId?: string;
};

function analyzeExpression(context: AnalyzeExpressionContext): ScriptType {
  const { expression } = context;

  switch (expression.kind) {
    case "Literal":
      if (expression.valueKind === "integer" || expression.valueKind === "real") return NUMBER_TYPE;
      if (expression.valueKind === "string") return STRING_TYPE;
      if (expression.valueKind === "boolean") return BOOL_TYPE;
      return UNKNOWN_TYPE;
    case "Identifier":
      return analyzeReadIdentifier(context, expression.name, expression.range);
    case "UnaryExpression": {
      const argument = analyzeExpression({ ...context, expression: expression.argument });
      if (expression.operator === "!") {
        if (!isScriptTypeBoolCompatible(argument)) {
          reportDiagnostic(
            context,
            "invalid-operand-type",
            expression.range,
            `operator \`${expression.operator}\` requires a bool-compatible operand`,
            `operand for \`${expression.operator}\` is not bool-compatible`,
            "use a boolean, number, or unknown-compatible expression here",
          );
          return ERROR_TYPE;
        }
        return BOOL_TYPE;
      }

      if (argument.kind === "number") return NUMBER_TYPE;
      if (argument.kind === "unknown" || argument.kind === "any" || argument.kind === "error") {
        return argument.kind === "any"
          ? argument
          : argument.kind === "error"
            ? ERROR_TYPE
            : UNKNOWN_TYPE;
      }

      reportDiagnostic(
        context,
        "invalid-operand-type",
        expression.range,
        `operator \`${expression.operator}\` requires a numeric operand`,
        `operand for \`${expression.operator}\` is not numeric`,
        "use a number expression here",
      );
      return ERROR_TYPE;
    }
    case "BinaryExpression": {
      const left = analyzeExpression({ ...context, expression: expression.left });
      const right = analyzeExpression({ ...context, expression: expression.right });

      switch (expression.operator) {
        case "&&":
        case "||":
          if (isKnownInvalidBoolOperand(left) || isKnownInvalidBoolOperand(right)) {
            reportDiagnostic(
              context,
              "invalid-operand-type",
              expression.range,
              `operator \`${expression.operator}\` requires bool-compatible operands`,
              `operands for \`${expression.operator}\` are not bool-compatible`,
              "use boolean or numeric expressions here",
            );
            return ERROR_TYPE;
          }
          return BOOL_TYPE;
        case "+":
          if (left.kind === "string" && right.kind === "string") return STRING_TYPE;
          if (left.kind === "number" && right.kind === "number") return NUMBER_TYPE;
          if (mightBeCompatible(left, right)) return UNKNOWN_TYPE;
          reportBinaryOperandDiagnostic(context, expression.range, expression.operator);
          return ERROR_TYPE;
        case "-":
        case "*":
        case "/":
        case "&":
        case "|":
        case "^":
          if (left.kind === "number" && right.kind === "number") return NUMBER_TYPE;
          if (mightBeCompatible(left, right)) return UNKNOWN_TYPE;
          reportBinaryOperandDiagnostic(context, expression.range, expression.operator);
          return ERROR_TYPE;
        case "..":
          if (
            (left.kind === "string" && (right.kind === "string" || right.kind === "number")) ||
            (right.kind === "string" && (left.kind === "string" || left.kind === "number"))
          ) {
            return STRING_TYPE;
          }
          if (mightBeCompatible(left, right)) return UNKNOWN_TYPE;
          reportBinaryOperandDiagnostic(context, expression.range, expression.operator);
          return ERROR_TYPE;
      }
      return UNKNOWN_TYPE;
    }
    case "ComparisonChain": {
      const operandTypes = expression.operands.map((operand) =>
        analyzeExpression({ ...context, expression: operand }),
      );

      for (let index = 0; index < expression.operators.length; index += 1) {
        const operator = expression.operators[index];
        const left = operandTypes[index];
        const right = operandTypes[index + 1];
        if (!isValidComparison(operator, left, right)) {
          reportDiagnostic(
            context,
            "invalid-operand-type",
            {
              start: expression.operands[index]?.range.start ?? expression.range.start,
              end: expression.operands[index + 1]?.range.end ?? expression.range.end,
            },
            `operator \`${operator}\` cannot compare these operand types`,
            `comparison operands for \`${operator}\` are not compatible`,
            "compare values of the same primitive type, or use == / != for matching custom types",
          );
          return ERROR_TYPE;
        }
      }

      return BOOL_TYPE;
    }
    case "ConditionalExpression": {
      const conditionType = analyzeExpression({ ...context, expression: expression.condition });
      if (!isScriptTypeBoolCompatible(conditionType)) {
        reportDiagnostic(
          context,
          "invalid-operand-type",
          expression.condition.range,
          "ternary condition must be bool-compatible",
          "ternary condition is not bool-compatible",
          "use a boolean or numeric condition expression here",
        );
      }

      const thenType = analyzeExpression({ ...context, expression: expression.thenExpression });
      const elseType = analyzeExpression({ ...context, expression: expression.elseExpression });
      const commonType = commonScriptType(thenType, elseType);
      if (commonType) return commonType;

      reportDiagnostic(
        context,
        "invalid-operand-type",
        expression.range,
        "ternary branches must produce compatible types",
        "then and else branches have incompatible types",
        "return the same type from both ternary branches",
      );
      return ERROR_TYPE;
    }
    case "AssignmentExpression":
      return analyzeAssignment(context);
  }
}

function analyzeAssignment(context: AnalyzeExpressionContext): ScriptType {
  const { environment, attributeName, identifiers, introducedSymbols } = context;
  const expression = context.expression as ScriptAssignmentExpression;
  const rightType = analyzeExpression({ ...context, expression: expression.right });

  if (expression.left.kind !== "Identifier") {
    analyzeExpression({ ...context, expression: expression.left });
    reportDiagnostic(
      context,
      "invalid-operand-type",
      expression.left.range,
      "assignment target must be an identifier",
      "this assignment target is not writable",
      "assign to a variable name instead of an expression",
    );
    return ERROR_TYPE;
  }

  const left = expression.left;
  const accessKind =
    expression.operator === ":=" ? "declare" : expression.operator === "=" ? "write" : "readwrite";
  const access: ScriptIdentifierAccess = {
    name: left.name,
    kind: accessKind,
    range: left.range,
    identifier: left,
    statementIndex: context.statementIndex,
  };
  identifiers.push(access);

  const classified = classifyScriptIdentifier(left.name);

  if (classified.kind === "invalid-global-blackboard") {
    context.invalidGlobalBlackboardIdentifiers.push(access);
    reportInvalidGlobalBlackboardIdentifier(
      context,
      left.range,
      classified.raw,
      classified.message,
    );
    return ERROR_TYPE;
  }

  if (classified.kind === "global-blackboard") {
    const existingSymbol = environment.globalBlackboard.get(classified.key);
    const accessType =
      expression.operator === ":="
        ? rightType
        : expression.operator === "="
          ? existingSymbol && isScriptTypeAssignable(existingSymbol.type, rightType)
            ? rightType
            : !existingSymbol
              ? rightType
              : undefined
          : compoundAssignmentResult(
              existingSymbol?.type ?? UNKNOWN_TYPE,
              rightType,
              expression.operator,
            );

    if (expression.operator !== ":=" && expression.operator !== "=" && !accessType) {
      reportDiagnostic(
        context,
        "invalid-compound-assignment",
        expression.range,
        `operator \`${expression.operator}\` is not valid for these operand types`,
        `compound assignment \`${expression.operator}\` is not allowed here`,
        expression.operator === "+="
          ? "use number += number or string += string"
          : "use numeric operands for this compound assignment",
      );
      return ERROR_TYPE;
    }

    if (
      (expression.operator === ":=" || expression.operator === "=") &&
      existingSymbol &&
      !isScriptTypeAssignable(existingSymbol.type, rightType)
    ) {
      reportTypeMismatch(context, left, existingSymbol.type, rightType);
      return ERROR_TYPE;
    }

    const symbol: ScriptSymbol = existingSymbol
      ? { ...existingSymbol }
      : {
          name: classified.key,
          type: rightType,
          source: {
            kind: "global-blackboard",
            key: classified.key,
            range: left.range,
            originId: context.originId,
          },
          readable: true,
          writable: true,
        };
    symbol.type = accessType ?? rightType;
    environment.globalBlackboard.set(classified.key, symbol);
    context.resolvedIdentifiers.push({
      access,
      resolution: { kind: "global-blackboard", key: classified.key, symbol },
    });
    context.globalBlackboardAccesses.push({
      key: classified.key,
      rawName: left.name,
      kind: accessKind,
      range: left.range,
      inferredType: symbol.type,
    });
    return symbol.type;
  }

  const existingSymbol = environment.symbols.get(left.name);

  if (expression.operator === ":=" && !existingSymbol) {
    const symbol: ScriptSymbol = {
      name: left.name,
      type: rightType,
      source: {
        kind: "script-assignment",
        attributeName,
        range: left.range,
        originId: context.originId,
      },
      readable: true,
      writable: true,
    };
    environment.symbols.set(left.name, symbol);
    context.resolvedIdentifiers.push({
      access,
      resolution: { kind: "symbol", symbol },
    });
    introducedSymbols.push(symbol);
    return rightType;
  }

  if (!existingSymbol) {
    context.resolvedIdentifiers.push({ access, resolution: { kind: "unknown" } });
    reportDiagnostic(
      context,
      "assignment-to-unknown-variable",
      left.range,
      `assignment target \`${left.name}\` is not defined`,
      `\`${left.name}\` must already exist before this assignment`,
      "introduce the variable earlier with `:=` or add a matching blackboard remap",
    );
    return ERROR_TYPE;
  }

  context.resolvedIdentifiers.push({
    access,
    resolution: { kind: "symbol", symbol: existingSymbol },
  });

  if (expression.operator === "=") {
    if (!isScriptTypeAssignable(existingSymbol.type, rightType)) {
      reportTypeMismatch(context, left, existingSymbol.type, rightType);
      return ERROR_TYPE;
    }
    refineLocalSymbol(existingSymbol, rightType);
    return rightType;
  }

  if (expression.operator === ":=") {
    if (!isScriptTypeAssignable(existingSymbol.type, rightType)) {
      reportTypeMismatch(context, left, existingSymbol.type, rightType);
      return ERROR_TYPE;
    }
    refineLocalSymbol(existingSymbol, rightType);
    return rightType;
  }

  const resultType = compoundAssignmentResult(existingSymbol.type, rightType, expression.operator);
  if (!resultType) {
    reportDiagnostic(
      context,
      "invalid-compound-assignment",
      expression.range,
      `operator \`${expression.operator}\` is not valid for these operand types`,
      `compound assignment \`${expression.operator}\` is not allowed here`,
      expression.operator === "+="
        ? "use number += number or string += string"
        : "use numeric operands for this compound assignment",
    );
    return ERROR_TYPE;
  }

  refineLocalSymbol(existingSymbol, resultType);
  return resultType;
}

function analyzeReadIdentifier(
  context: AnalyzeExpressionContext,
  name: string,
  range: ScriptExpression["range"],
): ScriptType {
  const access: ScriptIdentifierAccess = {
    name,
    kind: "read",
    range,
    identifier: context.expression as Extract<ScriptExpression, { kind: "Identifier" }>,
    statementIndex: context.statementIndex,
  };
  context.identifiers.push(access);

  const classified = classifyScriptIdentifier(name);
  if (classified.kind === "invalid-global-blackboard") {
    context.invalidGlobalBlackboardIdentifiers.push(access);
    reportInvalidGlobalBlackboardIdentifier(context, range, classified.raw, classified.message);
    return ERROR_TYPE;
  }

  if (classified.kind === "global-blackboard") {
    const symbol = context.environment.globalBlackboard.get(classified.key);
    context.globalBlackboardAccesses.push({
      key: classified.key,
      rawName: name,
      kind: "read",
      range,
      inferredType: symbol?.type ?? UNKNOWN_TYPE,
    });
    context.resolvedIdentifiers.push({
      access,
      resolution: { kind: "global-blackboard", key: classified.key, ...(symbol ? { symbol } : {}) },
    });
    return symbol?.type ?? UNKNOWN_TYPE;
  }

  const enumValue = context.environment.enums.get(name);
  if (enumValue !== undefined) {
    context.resolvedIdentifiers.push({
      access,
      resolution: { kind: "enum", name, value: enumValue },
    });
    return NUMBER_TYPE;
  }

  const symbol = context.environment.symbols.get(name);
  if (symbol) {
    context.resolvedIdentifiers.push({
      access,
      resolution: { kind: "symbol", symbol },
    });
    return symbol.type;
  }

  context.resolvedIdentifiers.push({ access, resolution: { kind: "unknown" } });
  context.unknownIdentifiers.push(access);
  return UNKNOWN_TYPE;
}

function compoundAssignmentResult(
  left: ScriptType,
  right: ScriptType,
  operator: ScriptAssignmentExpression["operator"],
): ScriptType | undefined {
  if (left.kind === "error" || right.kind === "error") return ERROR_TYPE;
  if (left.kind === "unknown" || right.kind === "unknown") return UNKNOWN_TYPE;
  if (left.kind === "any" || right.kind === "any") return UNKNOWN_TYPE;

  if (operator === "+=") {
    if (left.kind === "number" && right.kind === "number") return NUMBER_TYPE;
    if (left.kind === "string" && right.kind === "string") return STRING_TYPE;
    return undefined;
  }

  return left.kind === "number" && right.kind === "number" ? NUMBER_TYPE : undefined;
}

function mightBeCompatible(left: ScriptType, right: ScriptType): boolean {
  return isDeferredType(left) || isDeferredType(right);
}

function isDeferredType(type: ScriptType): boolean {
  return type.kind === "unknown" || type.kind === "any" || type.kind === "error";
}

function isKnownInvalidBoolOperand(type: ScriptType): boolean {
  return !isScriptTypeBoolCompatible(type);
}

function isValidComparison(
  operator: "==" | "!=" | "<" | ">" | "<=" | ">=",
  left: ScriptType,
  right: ScriptType,
): boolean {
  if (isDeferredType(left) || isDeferredType(right)) return true;

  if (operator === "==" || operator === "!=") {
    if (left.kind === "custom" || right.kind === "custom") {
      return (
        left.kind === "custom" && right.kind === "custom" && left.canonical === right.canonical
      );
    }
    return left.kind === right.kind;
  }

  if (left.kind === "custom" || right.kind === "custom") return false;
  return (
    (left.kind === "number" && right.kind === "number") ||
    (left.kind === "string" && right.kind === "string")
  );
}

function reportBinaryOperandDiagnostic(
  context: AnalyzeExpressionContext,
  range: ScriptExpression["range"],
  operator: string,
) {
  reportDiagnostic(
    context,
    "invalid-operand-type",
    range,
    `operator \`${operator}\` cannot be applied to these operand types`,
    `operands for \`${operator}\` are not compatible`,
    "use operands with the types required by this operator",
  );
}

function reportTypeMismatch(
  context: AnalyzeExpressionContext,
  identifier: Extract<ScriptExpression, { kind: "Identifier" }>,
  targetType: ScriptType,
  sourceType: ScriptType,
) {
  reportDiagnostic(
    context,
    "variable-type-mismatch",
    identifier.range,
    `cannot assign ${formatScriptType(sourceType)} to variable \`${identifier.name}\` of type ${formatScriptType(targetType)}`,
    `\`${identifier.name}\` expects ${formatScriptType(targetType)} here`,
    "assign a compatible value or change the variable's source type",
  );
}

function reportInvalidGlobalBlackboardIdentifier(
  context: AnalyzeExpressionContext,
  range: ScriptExpression["range"],
  rawName: string,
  message: string,
) {
  reportDiagnostic(
    context,
    "invalid-global-blackboard-identifier",
    range,
    message,
    `\`${rawName}\` is not a valid global blackboard identifier`,
    "use `@name` with a valid blackboard key that starts with a letter or underscore",
  );
}

function refineLocalSymbol(symbol: ScriptSymbol, nextType: ScriptType) {
  if (symbol.source.kind !== "script-assignment") return;
  if (symbol.type.kind !== "unknown" && symbol.type.kind !== "error") return;
  if (nextType.kind === "unknown" || nextType.kind === "any" || nextType.kind === "error") return;
  symbol.type = nextType;
}

function reportDiagnostic(
  context: AnalyzeExpressionContext,
  code: ScriptAnalysisDiagnostic["code"],
  range: ScriptExpression["range"],
  message: string,
  primaryLabel: string,
  help?: string,
) {
  context.diagnostics.push({
    code,
    range,
    message,
    details: {
      primaryLabel,
      help,
    },
  });
}

function formatScriptType(type: ScriptType): string {
  switch (type.kind) {
    case "custom":
      return type.name;
    default:
      return type.kind;
  }
}
