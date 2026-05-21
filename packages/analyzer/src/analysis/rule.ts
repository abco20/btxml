import type { ConfigSeverity as Severity } from "@btxml/config";
import type { TreeNodeModelDef } from "@btxml/model";
import type { BtXmlElement } from "@btxml/syntax";
import type { z } from "zod";
import type { RuleName } from "../rules/registry.js";
import type { RuleContext } from "./context.js";

export type RuleMeta = {
  description: string;
};

export type RuleVisitor = {
  Document?(): void;
  Element?(element: BtXmlElement): void;
  TreeNodeModel?(model: TreeNodeModelDef): void;
  ProgramExit?(): void;
};

export type RuleModule<TOptions = unknown> = {
  name: RuleName;
  code: string;
  defaultSeverity: Severity;
  optionsSchema?: z.ZodType<TOptions>;
  meta: RuleMeta;
  create(context: RuleContext<TOptions>): RuleVisitor;
};
