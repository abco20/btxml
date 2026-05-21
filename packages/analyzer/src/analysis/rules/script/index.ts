import type { RuleModule } from "../../rule.js";
import { scriptNoUnknownVariableRule } from "./no-unknown-variable.js";
import { scriptValidAssignmentRule } from "./valid-assignment.js";
import { scriptValidExpressionTypeRule } from "./valid-expression-type.js";
import { scriptValidResultTypeRule } from "./valid-result-type.js";
import { scriptValidSyntaxRule } from "./valid-syntax.js";

export const scriptRules: RuleModule[] = [
  scriptValidSyntaxRule,
  scriptNoUnknownVariableRule,
  scriptValidAssignmentRule,
  scriptValidExpressionTypeRule,
  scriptValidResultTypeRule,
];
