import type { RuleModule } from "../../rule.js";
import { childCountRule } from "./child-count.js";
import { portValueRule } from "./port-value.js";
import { requiredPortRule } from "./required-port.js";
import { shapeRules } from "./shape.js";
import { unknownNodeRule } from "./unknown-node.js";
import { unknownPortRule } from "./unknown-port.js";

export const usageRules: RuleModule[] = [
  unknownNodeRule,
  unknownPortRule,
  requiredPortRule,
  portValueRule,
  ...shapeRules,
  childCountRule,
];
