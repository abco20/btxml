import {
  DiagnosticSeverity,
  createDiagnostic,
  sourcePosition,
  sourceRange,
} from "@btxml/foundation";

import type { SourcePosition } from "@btxml/foundation";

import type {
  BtDocument,
  BtXmlAttribute,
  BtXmlComment,
  BtXmlElement,
  BtXmlNode,
  BtXmlText,
  XmlDeclaration,
} from "../ast.js";

import type { ParseOptions, ParseResult } from "../types.js";
import { finalizeDocumentKind, walkMixedContent } from "./document-kind.js";
import {
  decodeXmlEntities,
  decodeXmlEntitiesWithOffsets,
  validateXmlEntities,
} from "./entities.js";

function clonePos(position: ReturnType<typeof sourcePosition>): ReturnType<typeof sourcePosition> {
  return sourcePosition(position.line, position.character, position.offset);
}

type AddDiagnostic = (
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  start: SourcePosition,
  end: SourcePosition,
  details?: { primaryLabel?: string; help?: string; notes?: string[] },
) => void;

function isNameStart(ch: string | undefined): boolean {
  return Boolean(ch) && /[A-Za-z_:]/.test(ch || "");
}

function isNameChar(ch: string | undefined): boolean {
  return Boolean(ch) && /[A-Za-z0-9_.:\-]/.test(ch || "");
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isInvalidXmlChar(ch: string): boolean {
  const code = ch.codePointAt(0);
  return code !== undefined && code < 0x20 && ch !== "\t" && ch !== "\n" && ch !== "\r";
}

export function parseBtXml(text: string, options: ParseOptions = {}): ParseResult {
  const diagnostics: ParseResult["diagnostics"] = [];
  const tolerant = options.mode === "tolerant";
  const document: BtDocument = {
    uri: options.uri || "",
    path: options.path,
    kind: "generic-xml",
    isBtXml: false,
    xmlDeclaration: undefined,
    root: undefined,
    nodes: [],
    diagnostics,
    originalText: text,
  };

  let index = 0;
  let line = 0;
  let character = 0;
  const stack: BtXmlElement[] = [];
  let partial = false;

  function currentPos() {
    return sourcePosition(line, character, index);
  }

  function atEnd() {
    return index >= text.length;
  }

  function peek(offset = 0): string | undefined {
    return text[index + offset];
  }

  function advance(count = 1) {
    for (let i = 0; i < count; i += 1) {
      const ch = text[index++];
      if (ch === "\n") {
        line += 1;
        character = 0;
      } else {
        character += 1;
      }
    }
  }

  function skipWhitespace() {
    while (!atEnd() && isWhitespace(peek())) advance();
  }

  const addDiagnostic: AddDiagnostic = (code, severity, message, start, end, details) => {
    diagnostics.push(
      createDiagnostic(code, severity, message, sourceRange(start, end), document.uri, details),
    );
  };

  function addOptionalDiagnostic(
    code: string,
    severity: DiagnosticSeverity,
    message: string,
    startPos?: ReturnType<typeof sourcePosition>,
    endPos?: ReturnType<typeof sourcePosition>,
    details?: { primaryLabel?: string; help?: string; notes?: string[] },
  ) {
    diagnostics.push(
      createDiagnostic(
        code,
        severity,
        message,
        startPos && endPos ? sourceRange(startPos, endPos) : undefined,
        document.uri,
        details,
      ),
    );
  }

  function parseName(): string {
    if (!isNameStart(peek())) return "";
    const start = index;
    advance();
    while (!atEnd() && isNameChar(peek())) advance();
    return text.slice(start, index);
  }

  function parseQuotedValue(): {
    value: string;
    valueOffsets?: number[];
    ok: boolean;
    valueRange?: ReturnType<typeof sourceRange>;
    valueContentRange?: ReturnType<typeof sourceRange>;
  } {
    const quote = peek();
    if (quote !== '"' && quote !== "'") return { value: "", ok: false };
    const quotedStart = currentPos();
    advance();
    const contentStart = currentPos();
    const start = index;
    while (!atEnd() && peek() !== quote) {
      if (peek() === "<") break;
      advance();
    }
    const contentEnd = currentPos();
    if (atEnd() || peek() !== quote) {
      return {
        value: text.slice(start, index),
        ok: false,
        valueRange: sourceRange(quotedStart, contentEnd),
        valueContentRange: sourceRange(contentStart, contentEnd),
      };
    }
    const raw = text.slice(start, index);
    advance();
    validateXmlEntities(raw, contentStart.offset, text, addDiagnostic);
    const decoded = decodeXmlEntitiesWithOffsets(raw);
    return {
      value: decoded.value,
      valueOffsets: decoded.offsets,
      ok: true,
      valueRange: sourceRange(quotedStart, currentPos()),
      valueContentRange: sourceRange(contentStart, contentEnd),
    };
  }

  function parseAttributes(): BtXmlAttribute[] {
    const attributes: BtXmlAttribute[] = [];
    const seen = new Set<string>();
    while (true) {
      skipWhitespace();
      const ch = peek();
      if (!ch || ch === ">" || (ch === "/" && peek(1) === ">")) break;
      const nameStart = currentPos();
      const name = parseName();
      const nameEnd = currentPos();
      if (!name) break;
      skipWhitespace();
      const equalsStart = currentPos();
      if (peek() !== "=") {
        addDiagnostic(
          "XML001_INVALID_SYNTAX",
          DiagnosticSeverity.Error,
          "invalid attribute syntax",
          nameStart,
          nameEnd,
          {
            primaryLabel: `expected \`=\` after attribute \`${name}\``,
            help: `write the attribute as \`${name}="..."\``,
          },
        );
        partial = true;
        if (tolerant) continue;
        break;
      }
      advance();
      const equalsEnd = currentPos();
      skipWhitespace();
      const valueStart = currentPos();
      const parsed = parseQuotedValue();
      const valueEnd = currentPos();
      if (!parsed.ok) {
        addDiagnostic(
          "XML005_INVALID_ATTRIBUTE_VALUE",
          DiagnosticSeverity.Error,
          "invalid attribute value",
          valueStart,
          valueEnd,
          {
            primaryLabel: "expected a quoted attribute value",
            help: `write the value with quotes, for example \`${name}="value"\``,
          },
        );
        partial = true;
        if (!tolerant) break;
      }
      if (seen.has(name)) {
        addDiagnostic(
          "XML004_DUPLICATE_ATTRIBUTE",
          DiagnosticSeverity.Error,
          `duplicate attribute \`${name}\``,
          nameStart,
          valueEnd,
          {
            primaryLabel: `attribute \`${name}\` is already defined on this element`,
            help: `remove one of the duplicate \`${name}\` attributes`,
          },
        );
      } else {
        seen.add(name);
      }
      attributes.push({
        name,
        value: parsed.value,
        ...(parsed.valueOffsets ? { valueOffsets: parsed.valueOffsets } : {}),
        range: sourceRange(nameStart, valueEnd),
        fullRange: sourceRange(nameStart, valueEnd),
        nameRange: sourceRange(nameStart, nameEnd),
        equalsRange: sourceRange(equalsStart, equalsEnd),
        valueRange: parsed.valueRange || sourceRange(valueStart, valueEnd),
        valueContentRange: parsed.valueContentRange || sourceRange(valueStart, valueEnd),
      });
      if (!parsed.ok && tolerant) break;
    }
    return attributes;
  }

  function attachNode(node: BtXmlNode) {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      document.nodes.push(node);
      if (!document.root && node.kind === "element") document.root = node;
    }
  }

  function parseText() {
    const startPos = currentPos();
    const start = index;
    while (!atEnd() && peek() !== "<") advance();
    const raw = text.slice(start, index);
    if (raw.length === 0) return;
    for (const ch of raw) {
      if (isInvalidXmlChar(ch)) {
        addDiagnostic(
          "XML007_INVALID_CHARACTER",
          DiagnosticSeverity.Error,
          "invalid XML character",
          startPos,
          currentPos(),
          {
            primaryLabel: "this control character is not allowed in XML",
            help: "remove the character or replace it with valid text",
          },
        );
        break;
      }
    }
    validateXmlEntities(raw, start, text, addDiagnostic);
    const node: BtXmlText = {
      kind: "text",
      text: decodeXmlEntities(raw),
      range: sourceRange(startPos, currentPos()),
      fullRange: sourceRange(startPos, currentPos()),
    };
    attachNode(node);
  }

  function parseComment() {
    const startPos = currentPos();
    advance(4);
    const contentStart = currentPos();
    const start = index;
    while (!atEnd() && !(peek() === "-" && peek(1) === "-" && peek(2) === ">")) advance();
    const raw = text.slice(start, index);
    if (atEnd()) {
      addDiagnostic(
        "XML001_INVALID_SYNTAX",
        DiagnosticSeverity.Error,
        "unterminated XML comment",
        startPos,
        currentPos(),
        {
          primaryLabel: "comment started here but no closing `-->` was found",
          help: "close the comment with `-->`",
        },
      );
      partial = true;
      if (!tolerant) return;
      const node: BtXmlComment = {
        kind: "comment",
        text: raw,
        range: sourceRange(startPos, currentPos()),
        fullRange: sourceRange(startPos, currentPos()),
        contentRange: sourceRange(contentStart, currentPos()),
      };
      attachNode(node);
      return;
    }
    if (raw.includes("--") || raw.endsWith("-")) {
      addDiagnostic(
        "XML001_INVALID_SYNTAX",
        DiagnosticSeverity.Error,
        "invalid XML comment",
        contentStart,
        currentPos(),
        {
          primaryLabel: "XML comments cannot contain `--`",
          help: "remove `--` from the comment body or split it into separate comments",
        },
      );
    }
    const contentEnd = currentPos();
    advance(3);
    const node: BtXmlComment = {
      kind: "comment",
      text: raw,
      range: sourceRange(startPos, currentPos()),
      fullRange: sourceRange(startPos, currentPos()),
      contentRange: sourceRange(contentStart, contentEnd),
    };
    attachNode(node);
  }

  function parseDeclaration() {
    const startPos = currentPos();
    advance(5);
    skipWhitespace();
    const attrs = parseAttributes();
    skipWhitespace();
    if (peek() === "?" && peek(1) === ">") {
      advance(2);
    } else {
      addDiagnostic(
        "XML001_INVALID_SYNTAX",
        DiagnosticSeverity.Error,
        "invalid XML declaration",
        startPos,
        currentPos(),
        {
          primaryLabel: "expected `?>` to close the XML declaration",
          help: 'close the declaration as `<?xml version="1.0" encoding="UTF-8"?>`',
        },
      );
    }
    const decl: XmlDeclaration = { range: sourceRange(startPos, currentPos()), attributes: attrs };
    for (const attr of attrs) {
      if (attr.name === "version") decl.version = attr.value;
      if (attr.name === "encoding") decl.encoding = attr.value;
      if (attr.name === "standalone") decl.standalone = attr.value;
    }
    document.xmlDeclaration = decl;
  }

  function parseClosingTag() {
    const startPos = currentPos();
    advance(2);
    skipWhitespace();
    const nameStart = currentPos();
    const name = parseName();
    const nameEnd = currentPos();
    skipWhitespace();
    if (peek() !== ">") {
      addDiagnostic(
        "XML001_INVALID_SYNTAX",
        DiagnosticSeverity.Error,
        "invalid closing tag syntax",
        startPos,
        currentPos(),
        { primaryLabel: "expected `>` to close the tag", help: "close the tag with `>`" },
      );
      partial = true;
      while (!atEnd() && peek() !== ">") advance();
    }
    if (peek() === ">") advance();
    const open = stack.pop();
    if (!open || open.name !== name) {
      const opening = open ? open.name : name || "";
      const closing = name || "";
      addDiagnostic(
        "XML006_MISSING_CLOSING_TAG",
        DiagnosticSeverity.Error,
        `mismatched closing tag \`</${closing}>\``,
        startPos,
        currentPos(),
        {
          primaryLabel: `opened as \`<${opening}>\` but closed as \`</${closing}>\``,
          help: `change the closing tag to \`</${opening}>\` or fix the nesting`,
        },
      );
      return;
    }
    open.closeTagRange = sourceRange(startPos, currentPos());
    open.endTagRange = sourceRange(startPos, currentPos());
    if (!open.nameRange) {
      open.nameRange = sourceRange(nameStart, nameEnd);
    }
    open.range = sourceRange(open.range.start, currentPos());
    open.fullRange = sourceRange(open.range.start, currentPos());
  }

  while (!atEnd()) {
    if (peek() === "<") {
      if (peek(1) === "?") {
        if (
          text.slice(index, index + 5).toLowerCase() === "<?xml" &&
          text.charAt(index + 5) === " "
        ) {
          parseDeclaration();
        } else {
          const startPos = currentPos();
          while (!atEnd() && !(peek() === "?" && peek(1) === ">")) advance();
          if (!atEnd()) advance(2);
          addDiagnostic(
            "XML012_UNSUPPORTED_PROCESSING_INSTRUCTION",
            DiagnosticSeverity.Error,
            "processing instruction is not supported",
            startPos,
            currentPos(),
            {
              primaryLabel: "only the XML declaration is supported",
              help: "remove this processing instruction",
            },
          );
        }
      } else if (peek(1) === "!" && peek(2) === "-" && peek(3) === "-") {
        parseComment();
      } else if (
        peek(1) === "!" &&
        peek(2) === "[" &&
        text.slice(index + 3, index + 9) === "CDATA["
      ) {
        const startPos = currentPos();
        advance(8);
        while (!atEnd() && !(peek() === "]" && peek(1) === "]" && peek(2) === ">")) advance();
        if (!atEnd()) advance(3);
        addDiagnostic(
          "XML010_UNSUPPORTED_CDATA",
          DiagnosticSeverity.Error,
          "CDATA is not supported",
          startPos,
          currentPos(),
          {
            primaryLabel: "CDATA sections are not supported by btxml",
            help: "replace the CDATA section with normal escaped XML text",
            notes: ["escape `<` as `&lt;`, `>` as `&gt;`, and `&` as `&amp;`"],
          },
        );
      } else if (peek(1) === "!" && text.slice(index + 2, index + 9) === "DOCTYPE") {
        const startPos = currentPos();
        advance(8);
        while (!atEnd() && peek() !== ">") advance();
        if (!atEnd()) advance(1);
        addDiagnostic(
          "XML011_UNSUPPORTED_DOCTYPE",
          DiagnosticSeverity.Error,
          "DOCTYPE is not supported",
          startPos,
          currentPos(),
          {
            primaryLabel: "DOCTYPE declarations are not supported by btxml",
            help: "remove the DOCTYPE declaration",
          },
        );
      } else if (peek(1) === "/") {
        parseClosingTag();
      } else {
        const startPos = currentPos();
        advance();
        const nameStart = currentPos();
        const name = parseName();
        const nameEnd = currentPos();
        if (!name) {
          addDiagnostic(
            "XML001_INVALID_SYNTAX",
            DiagnosticSeverity.Error,
            "invalid XML tag",
            startPos,
            currentPos(),
            {
              primaryLabel: "expected an XML element name after `<`",
              help: "start the tag with a valid XML name such as `<root>` or `<BehaviorTree>`",
            },
          );
          partial = true;
          if (tolerant) {
            advance();
            continue;
          }
          break;
        }
        const element: BtXmlElement = {
          kind: "element",
          name,
          attributes: [],
          children: [],
          range: sourceRange(startPos, startPos),
          fullRange: sourceRange(startPos, startPos),
          openTagRange: sourceRange(startPos, startPos),
          startTagRange: sourceRange(startPos, startPos),
          nameRange: sourceRange(nameStart, nameEnd),
          selfClosing: false,
        };
        element.attributes = parseAttributes();
        skipWhitespace();
        if (peek() === "/" && peek(1) === ">") {
          advance(2);
          element.selfClosing = true;
          element.openTagRange = sourceRange(startPos, currentPos());
          element.startTagRange = element.openTagRange;
          element.range = sourceRange(startPos, currentPos());
          element.fullRange = sourceRange(startPos, currentPos());
          attachNode(element);
          continue;
        }
        if (peek() !== ">") {
          addDiagnostic(
            "XML001_INVALID_SYNTAX",
            DiagnosticSeverity.Error,
            "invalid XML tag",
            startPos,
            currentPos(),
            {
              primaryLabel: "expected `>` or `/>` to close the start tag",
              help: "close the start tag with `>` or make it self-closing with `/>`",
            },
          );
          partial = true;
          if (tolerant) {
            element.openTagRange = sourceRange(startPos, currentPos());
            element.startTagRange = element.openTagRange;
            element.range = sourceRange(startPos, currentPos());
            element.fullRange = sourceRange(startPos, currentPos());
            attachNode(element);
            continue;
          }
          break;
        }
        advance();
        element.openTagRange = sourceRange(startPos, currentPos());
        element.startTagRange = element.openTagRange;
        element.range = sourceRange(startPos, currentPos());
        element.fullRange = sourceRange(startPos, currentPos());
        attachNode(element);
        stack.push(element);
      }
    } else {
      parseText();
    }
  }

  if (stack.length > 0) {
    const open = stack[stack.length - 1];
    addDiagnostic(
      "XML006_MISSING_CLOSING_TAG",
      DiagnosticSeverity.Error,
      `missing closing tag for \`<${open.name}>\``,
      open.openTagRange.start,
      open.openTagRange.end,
      {
        primaryLabel: "this tag is not closed",
        help: `add \`</${open.name}>\` before the end of the file`,
      },
    );
    partial = true;
    if (tolerant) {
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) break;
        node.range = sourceRange(node.range.start, currentPos());
        node.fullRange = sourceRange(node.range.start, currentPos());
      }
    }
  }

  const elementNodes = document.nodes.filter(
    (node): node is BtXmlElement => node.kind === "element",
  );
  if (elementNodes.length === 0) {
    addOptionalDiagnostic(
      "XML002_MISSING_ROOT",
      DiagnosticSeverity.Error,
      "missing root element",
      undefined,
      undefined,
      { help: 'add a single root element, usually `<root BTCPP_format="4">...</root>`' },
    );
  } else if (elementNodes.length > 1) {
    addOptionalDiagnostic(
      "XML003_MULTIPLE_ROOTS",
      DiagnosticSeverity.Error,
      "multiple root elements",
      undefined,
      undefined,
      {
        primaryLabel: "this document has more than one top-level element",
        help: 'wrap the document content in one `<root BTCPP_format="4">...</root>` element',
      },
    );
  }

  const root = document.root;
  if (root) {
    for (const node of document.nodes) {
      if (node === root) continue;
      if (node.kind === "text" && node.text.trim().length > 0) {
        addDiagnostic(
          "XML016_TEXT_OUTSIDE_ROOT",
          DiagnosticSeverity.Error,
          "text outside root element",
          node.range.start,
          node.range.end,
          {
            primaryLabel: "non-whitespace text appears outside the root element",
            help: "move this text inside `<root>` or remove it",
          },
        );
      }
    }
  }

  if (!document.xmlDeclaration) {
    addOptionalDiagnostic(
      "XML008_MISSING_DECLARATION",
      DiagnosticSeverity.Warning,
      "missing XML declaration",
      undefined,
      undefined,
      {
        help: 'add `<?xml version="1.0" encoding="UTF-8"?>` at the top of the file',
        notes: [
          "this is a warning because BehaviorTree.CPP can still parse many files without a declaration",
        ],
      },
    );
  } else if (
    document.xmlDeclaration.encoding &&
    document.xmlDeclaration.encoding.toUpperCase() !== "UTF-8"
  ) {
    const encoding = document.xmlDeclaration.encoding;
    addDiagnostic(
      "XML009_INVALID_ENCODING",
      DiagnosticSeverity.Warning,
      "XML encoding should be UTF-8",
      document.xmlDeclaration.range.start,
      document.xmlDeclaration.range.end,
      {
        primaryLabel: `declared encoding is \`${encoding}\``,
        help: 'change the XML declaration to `encoding="UTF-8"`',
      },
    );
  }

  if (root) {
    walkMixedContent(root, (node) => {
      addDiagnostic(
        "XML015_UNSUPPORTED_MIXED_CONTENT",
        DiagnosticSeverity.Warning,
        "mixed XML content is not supported",
        clonePos(node.range.start),
        clonePos(node.range.end),
        {
          primaryLabel: "this element contains both text and child elements",
          help: "move the text into an attribute or split it into separate elements",
          notes: ["text inside `<input_port>` and `<output_port>` remains allowed"],
        },
      );
    });
  }

  return finalizeDocumentKind({ document, diagnostics, partial, options });
}
