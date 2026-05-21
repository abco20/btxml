import {
  type SourcePosition,
  type SourceRange,
  containsOffset,
  sourceRange,
} from "@btxml/foundation";
import type { BtDocument, BtXmlAttribute, BtXmlElement } from "./ast.js";
import { findElementAt } from "./query.js";

export type XmlCursorContext =
  | {
      kind: "tag-name";
      element?: BtXmlElement;
      replacementRange?: SourceRange;
    }
  | {
      kind: "attribute-name";
      element: BtXmlElement;
      attribute?: BtXmlAttribute;
    }
  | {
      kind: "attribute-value";
      element: BtXmlElement;
      attribute: BtXmlAttribute;
      valuePrefix: string;
    }
  | {
      kind: "closing-tag-name";
      tagNamePrefix: string;
      tagText?: string;
      replacementRange: SourceRange;
    }
  | {
      kind: "comment";
    }
  | {
      kind: "element";
      element: BtXmlElement;
    }
  | {
      kind: "text";
    }
  | {
      kind: "unknown";
    };

export type TextLikeDocument = {
  readonly text: string;
  readonly uri: string;
  readonly languageId: string;
  readonly version: number;
  positionAt(offset: number): SourcePosition;
  offsetAt(position: { line: number; character: number }): number;
  getText(range?: SourceRange): string;
};

const XML_NAME_RE = /^[A-Za-z_:][A-Za-z0-9_.:-]*/;
const XML_ATTRIBUTE_RE = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/gs;

function findNearestUnclosedTagNameBefore(text: string, endOffset: number) {
  const stack: string[] = [];
  let offset = 0;

  while (offset < endOffset) {
    const nextOpen = text.indexOf("<", offset);
    if (nextOpen < 0 || nextOpen >= endOffset) break;

    if (text.startsWith("<!--", nextOpen)) {
      const end = text.indexOf("-->", nextOpen + 4);
      if (end < 0 || end + 3 > endOffset) break;
      offset = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", nextOpen)) {
      const end = text.indexOf("]]>", nextOpen + 9);
      if (end < 0 || end + 3 > endOffset) break;
      offset = end + 3;
      continue;
    }
    if (text.startsWith("<?", nextOpen)) {
      const end = text.indexOf("?>", nextOpen + 2);
      if (end < 0 || end + 2 > endOffset) break;
      offset = end + 2;
      continue;
    }
    if (text.startsWith("<!", nextOpen)) {
      const end = text.indexOf(">", nextOpen + 2);
      if (end < 0 || end + 1 > endOffset) break;
      offset = end + 1;
      continue;
    }

    if (text[nextOpen + 1] === "/") {
      const afterSlash = text.slice(nextOpen + 2);
      const name = afterSlash.match(XML_NAME_RE)?.[0];
      if (name) {
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index] !== name) continue;
          stack.length = index;
          break;
        }
      }
      const end = text.indexOf(">", nextOpen + 2);
      if (end < 0 || end >= endOffset) break;
      offset = end + 1;
      continue;
    }

    const afterOpen = text.slice(nextOpen + 1);
    const name = afterOpen.match(/^\s*([A-Za-z_:][A-Za-z0-9_.:-]*)/)?.[1];
    if (!name) {
      offset = nextOpen + 1;
      continue;
    }
    const end = text.indexOf(">", nextOpen + 1);
    if (end < 0 || end >= endOffset) break;
    const inner = text.slice(nextOpen + 1, end);
    if (!inner.trimEnd().endsWith("/")) stack.push(name);
    offset = end + 1;
  }

  return stack.at(-1);
}

function emptyRange(document: TextLikeDocument, offset: number): SourceRange {
  const position = document.positionAt(offset);
  return sourceRange(position, position);
}

function rangeFromOffsets(
  document: TextLikeDocument,
  startOffset: number,
  endOffset: number,
): SourceRange {
  return sourceRange(document.positionAt(startOffset), document.positionAt(endOffset));
}

function createAttributeFromOffsets(input: {
  document: TextLikeDocument;
  name: string;
  value: string;
  nameStart: number;
  nameEnd: number;
  equalsStart?: number;
  equalsEnd?: number;
  valueStart: number;
  valueEnd: number;
  valueContentStart?: number;
  valueContentEnd?: number;
}): BtXmlAttribute {
  return {
    name: input.name,
    value: input.value,
    range: rangeFromOffsets(input.document, input.nameStart, input.valueEnd),
    fullRange: rangeFromOffsets(input.document, input.nameStart, input.valueEnd),
    nameRange: rangeFromOffsets(input.document, input.nameStart, input.nameEnd),
    equalsRange:
      input.equalsStart !== undefined && input.equalsEnd !== undefined
        ? rangeFromOffsets(input.document, input.equalsStart, input.equalsEnd)
        : undefined,
    valueRange: rangeFromOffsets(input.document, input.valueStart, input.valueEnd),
    valueContentRange:
      input.valueContentStart !== undefined && input.valueContentEnd !== undefined
        ? rangeFromOffsets(input.document, input.valueContentStart, input.valueContentEnd)
        : undefined,
  };
}

function parseAttributesBeforeCursor(
  document: TextLikeDocument,
  tagText: string,
  absoluteTagContentStart: number,
): BtXmlAttribute[] {
  const attributes: BtXmlAttribute[] = [];
  for (const match of tagText.matchAll(XML_ATTRIBUTE_RE)) {
    const relativeStart = match.index ?? 0;
    const name = match[1];
    const quotedValue = match[2];
    const doubleQuotedValue = match[3];
    const singleQuotedValue = match[4];
    const nameOffsetInMatch = match[0].indexOf(name);
    const equalsOffsetInMatch = match[0].indexOf("=", nameOffsetInMatch + name.length);
    const valueOffsetInMatch = match[0].indexOf(quotedValue, equalsOffsetInMatch + 1);
    const valueStart = absoluteTagContentStart + relativeStart + valueOffsetInMatch;
    const valueEnd = valueStart + quotedValue.length;
    attributes.push(
      createAttributeFromOffsets({
        document,
        name,
        value: doubleQuotedValue ?? singleQuotedValue ?? "",
        nameStart: absoluteTagContentStart + relativeStart + nameOffsetInMatch,
        nameEnd: absoluteTagContentStart + relativeStart + nameOffsetInMatch + name.length,
        equalsStart: absoluteTagContentStart + relativeStart + equalsOffsetInMatch,
        equalsEnd: absoluteTagContentStart + relativeStart + equalsOffsetInMatch + 1,
        valueStart,
        valueEnd,
        valueContentStart: valueStart + 1,
        valueContentEnd: valueEnd - 1,
      }),
    );
  }
  return attributes;
}

function inspectClosingTagName(
  document: TextLikeDocument,
  offset: number,
): Extract<XmlCursorContext, { kind: "closing-tag-name" }> | undefined {
  const windowStart = Math.max(0, offset - 4000);
  const before = document.text.slice(windowStart, offset);
  const lastOpen = before.lastIndexOf("<");
  const lastClose = before.lastIndexOf(">");
  if (lastOpen < 0 || lastOpen < lastClose) return undefined;
  if (!before.startsWith("</", lastOpen)) return undefined;

  const absoluteTagStart = windowStart + lastOpen;
  const prefix = before.slice(lastOpen + 2);
  if (/\s/.test(prefix)) return undefined;

  return {
    kind: "closing-tag-name",
    tagNamePrefix: prefix,
    replacementRange: rangeFromOffsets(document, absoluteTagStart + 2, offset),
  };
}

function inspectOpenTagTail(
  document: TextLikeDocument,
  offset: number,
): XmlCursorContext | undefined {
  const windowStart = Math.max(0, offset - 4000);
  const before = document.text.slice(windowStart, offset);
  const lastOpen = before.lastIndexOf("<");
  const lastClose = before.lastIndexOf(">");
  if (lastOpen < 0 || lastOpen < lastClose) return undefined;

  const absoluteTagStart = windowStart + lastOpen;
  const absoluteTagContentStart = absoluteTagStart + 1;
  const tagText = before.slice(lastOpen + 1);
  if (/^\s*[!?/]/.test(tagText)) return undefined;

  const leadingWhitespace = tagText.match(/^\s*/)?.[0].length ?? 0;
  const nameMatch = tagText.slice(leadingWhitespace).match(XML_NAME_RE);

  if (!nameMatch) {
    return {
      kind: "tag-name",
    };
  }

  const name = nameMatch[0];
  const relativeNameStart = leadingWhitespace;
  const relativeNameEnd = relativeNameStart + name.length;
  const nameRange = rangeFromOffsets(
    document,
    absoluteTagContentStart + relativeNameStart,
    absoluteTagContentStart + relativeNameEnd,
  );

  const element: BtXmlElement = {
    kind: "element",
    name,
    attributes: parseAttributesBeforeCursor(document, tagText, absoluteTagContentStart),
    children: [],
    range: rangeFromOffsets(document, absoluteTagStart, offset),
    fullRange: rangeFromOffsets(document, absoluteTagStart, offset),
    openTagRange: rangeFromOffsets(document, absoluteTagStart, offset),
    startTagRange: rangeFromOffsets(document, absoluteTagStart, offset),
    nameRange,
    selfClosing: false,
  };

  if (tagText.length <= relativeNameEnd && !/\s/.test(tagText.slice(relativeNameEnd))) {
    return {
      kind: "tag-name",
      element,
      replacementRange: nameRange,
    };
  }

  const unfinishedValue = tagText.match(
    /(?:^|\s)([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:(['"])([^"']*)|([^\s>"']*))?$/s,
  );
  if (unfinishedValue) {
    const raw = unfinishedValue[0];
    const nameInRaw = raw.indexOf(unfinishedValue[1]);
    const relativeAttrStart = (unfinishedValue.index ?? 0) + nameInRaw;
    const unfinishedNameEnd = relativeAttrStart + unfinishedValue[1].length;
    const relativeEquals = tagText.indexOf("=", unfinishedNameEnd);
    const quote = unfinishedValue[2];
    const unquotedValue = unfinishedValue[4] ?? "";

    if (quote) {
      const relativeValueStart = tagText.indexOf(quote, relativeEquals + 1);
      const valueContentStart = absoluteTagContentStart + relativeValueStart + 1;
      const attribute = createAttributeFromOffsets({
        document,
        name: unfinishedValue[1],
        value: unfinishedValue[3] ?? "",
        nameStart: absoluteTagContentStart + relativeAttrStart,
        nameEnd: absoluteTagContentStart + unfinishedNameEnd,
        equalsStart: absoluteTagContentStart + relativeEquals,
        equalsEnd: absoluteTagContentStart + relativeEquals + 1,
        valueStart: absoluteTagContentStart + relativeValueStart,
        valueEnd: offset,
        valueContentStart,
        valueContentEnd: offset,
      });
      return {
        kind: "attribute-value",
        element,
        attribute,
        valuePrefix: document.text.slice(valueContentStart, offset),
      };
    }

    const relativeValueStart =
      unquotedValue.length > 0
        ? offset - absoluteTagContentStart - unquotedValue.length
        : offset - absoluteTagContentStart;
    return {
      kind: "attribute-value",
      element,
      attribute: createAttributeFromOffsets({
        document,
        name: unfinishedValue[1],
        value: unquotedValue,
        nameStart: absoluteTagContentStart + relativeAttrStart,
        nameEnd: absoluteTagContentStart + unfinishedNameEnd,
        equalsStart: absoluteTagContentStart + relativeEquals,
        equalsEnd: absoluteTagContentStart + relativeEquals + 1,
        valueStart: absoluteTagContentStart + relativeValueStart,
        valueEnd: offset,
        valueContentStart: absoluteTagContentStart + relativeValueStart,
        valueContentEnd: offset,
      }),
      valuePrefix: document.text.slice(absoluteTagContentStart + relativeValueStart, offset),
    };
  }

  const attributeNameMatch = tagText.match(/(?:^|\s)([A-Za-z_:][A-Za-z0-9_.:-]*)?$/s);
  if (attributeNameMatch) {
    const partialName = attributeNameMatch[1] ?? "";
    const partialNameStart = offset - absoluteTagContentStart - partialName.length;
    return {
      kind: "attribute-name",
      element,
      attribute: createAttributeFromOffsets({
        document,
        name: partialName,
        value: "",
        nameStart: absoluteTagContentStart + partialNameStart,
        nameEnd: offset,
        valueStart: offset,
        valueEnd: offset,
      }),
    };
  }

  return {
    kind: "attribute-name",
    element,
    attribute: {
      name: "",
      value: "",
      range: emptyRange(document, offset),
      fullRange: emptyRange(document, offset),
      nameRange: emptyRange(document, offset),
      valueRange: emptyRange(document, offset),
    },
  };
}

export function inspectXmlCursor(input: {
  document: TextLikeDocument;
  parsed?: BtDocument;
  position: SourcePosition;
}): XmlCursorContext {
  const { document, parsed, position } = input;
  const offset = position.offset;
  let fallbackContext: XmlCursorContext =
    document.text.length > 0 ? { kind: "text" } : { kind: "unknown" };

  const closingTagResult = inspectClosingTagName(document, offset);
  if (closingTagResult) {
    return {
      kind: "closing-tag-name",
      tagNamePrefix: closingTagResult.tagNamePrefix,
      replacementRange: closingTagResult.replacementRange,
      tagText: findNearestUnclosedTagNameBefore(document.text, offset),
    };
  }

  if (parsed?.root) {
    const element = findElementAt(parsed.root, offset);
    if (element) {
      for (const attribute of element.attributes) {
        if (containsOffset(attribute.nameRange, offset)) {
          return {
            kind: "attribute-name",
            element,
            attribute,
          };
        }
        if (
          containsOffset(attribute.valueRange, offset) ||
          containsOffset(attribute.valueContentRange, offset)
        ) {
          return {
            kind: "attribute-value",
            element,
            attribute,
            valuePrefix:
              attribute.valueContentRange && offset >= attribute.valueContentRange.start.offset
                ? document.text.slice(attribute.valueContentRange.start.offset, offset)
                : "",
          };
        }
      }
      if (containsOffset(element.nameRange || element.openTagRange, offset)) {
        return {
          kind: "tag-name",
          element,
          replacementRange: element.nameRange,
        };
      }
      if (containsOffset(element.openTagRange, offset)) {
        const openTagResult = inspectOpenTagTail(document, offset);
        if (openTagResult) {
          return openTagResult.kind === "tag-name"
            ? { ...openTagResult, element: openTagResult.element ?? element }
            : openTagResult;
        }
      }
      fallbackContext = {
        kind: "element",
        element,
      };
    }
  }

  const openTagResult = inspectOpenTagTail(document, offset);
  if (openTagResult) return openTagResult;

  const before = document.text.slice(Math.max(0, offset - 200), offset);
  if (/<!--\s*btxml-disable-next-line\s+[A-Z0-9_]*$/.test(before)) {
    return { kind: "comment" };
  }

  return fallbackContext;
}
