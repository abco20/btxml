import type { Diagnostic } from "@btxml/foundation";
import type { BtDocument } from "./ast.js";

export type ParseOptions = {
  readonly uri?: string;
  readonly path?: string;
  readonly kind?: "bt-xml" | "model-xml" | "unknown";
  readonly mode?: "strict" | "tolerant";
};

export type ParseResult =
  | {
      readonly ok: true;
      readonly document: BtDocument;
      readonly diagnostics: Diagnostic[];
      readonly partial: false;
    }
  | {
      readonly ok: false;
      readonly document?: BtDocument;
      readonly diagnostics: Diagnostic[];
      readonly partial: boolean;
    };

export type FormatOptions = {
  readonly indentWidth?: number;
  readonly xmlDeclaration?: "always" | "never" | "preserve";
  readonly blankLineBetweenBehaviorTrees?: boolean;
  readonly lineEnding?: "lf" | "crlf" | "auto";
  readonly force?: boolean;
};

export type FormatResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly changed: boolean;
      readonly skipped: false;
      readonly diagnostics: Diagnostic[];
    }
  | {
      readonly ok: true;
      readonly skipped: true;
      readonly diagnostics: Diagnostic[];
    }
  | {
      readonly ok: false;
      readonly text?: string;
      readonly skipped: false;
      readonly diagnostics: Diagnostic[];
    };
