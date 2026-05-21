export type XmlPrefixContext = "text" | "attribute-value" | "comment" | "cdata" | "pi" | "doctype";

export type XmlPrefixScanResult = {
  context: XmlPrefixContext;
  stack: string[];
};

export type XmlOpenStartTag = {
  tagName: string;
  tagStartOffset: number;
  tagEndOffset?: number;
  firstAttributeOffset?: number;
};

export type XmlClosedStartTag = XmlOpenStartTag & {
  attributes: Readonly<Record<string, string | undefined>>;
  closingToken: ">" | "/>";
};

const XML_NAME_RE = /[A-Za-z_:][A-Za-z0-9_.:-]*/y;

function parseName(text: string, offset: number) {
  XML_NAME_RE.lastIndex = offset;
  const match = XML_NAME_RE.exec(text);
  if (!match) return undefined;
  return { name: match[0], end: XML_NAME_RE.lastIndex };
}

function popStack(stack: string[], name: string) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index] !== name) continue;
    stack.length = index;
    return;
  }
}

function findMarkupDeclarationEnd(text: string, startOffset: number, endOffset: number) {
  let cursor = startOffset + 2;
  let quote: '"' | "'" | undefined;
  let subsetDepth = 0;

  while (cursor < endOffset) {
    if (!quote && subsetDepth > 0) {
      if (text.startsWith("<!--", cursor)) {
        const end = text.indexOf("-->", cursor + 4);
        if (end < 0 || end + 3 > endOffset) return undefined;
        cursor = end + 3;
        continue;
      }
      if (text.startsWith("<![CDATA[", cursor)) {
        const end = text.indexOf("]]>", cursor + 9);
        if (end < 0 || end + 3 > endOffset) return undefined;
        cursor = end + 3;
        continue;
      }
      if (text.startsWith("<?", cursor)) {
        const end = text.indexOf("?>", cursor + 2);
        if (end < 0 || end + 2 > endOffset) return undefined;
        cursor = end + 2;
        continue;
      }
    }

    const char = text[cursor];
    if (quote) {
      if (char === quote) quote = undefined;
      cursor += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      cursor += 1;
      continue;
    }
    if (char === "[") {
      subsetDepth += 1;
      cursor += 1;
      continue;
    }
    if (char === "]" && subsetDepth > 0) {
      subsetDepth -= 1;
      cursor += 1;
      continue;
    }
    if (char === ">" && subsetDepth === 0) return cursor;
    cursor += 1;
  }

  return undefined;
}

export function scanXmlPrefix(text: string, endOffset: number): XmlPrefixScanResult {
  const stack: string[] = [];
  let offset = 0;

  while (offset < endOffset) {
    const nextOpen = text.indexOf("<", offset);
    if (nextOpen < 0 || nextOpen >= endOffset) break;
    offset = nextOpen;

    if (text.startsWith("<!--", offset)) {
      const end = text.indexOf("-->", offset + 4);
      if (end < 0 || end + 3 > endOffset) return { context: "comment", stack };
      offset = end + 3;
      continue;
    }

    if (text.startsWith("<![CDATA[", offset)) {
      const end = text.indexOf("]]>", offset + 9);
      if (end < 0 || end + 3 > endOffset) return { context: "cdata", stack };
      offset = end + 3;
      continue;
    }

    if (text.startsWith("<?", offset)) {
      const end = text.indexOf("?>", offset + 2);
      if (end < 0 || end + 2 > endOffset) return { context: "pi", stack };
      offset = end + 2;
      continue;
    }

    if (text.startsWith("<!", offset)) {
      const end = findMarkupDeclarationEnd(text, offset, endOffset);
      if (end === undefined) return { context: "doctype", stack };
      offset = end + 1;
      continue;
    }

    if (text[offset + 1] === "/") {
      let nameOffset = offset + 2;
      while (nameOffset < endOffset && /\s/.test(text[nameOffset] || "")) nameOffset += 1;
      const parsed = parseName(text, nameOffset);
      const cursor = parsed?.end ?? nameOffset;
      const closeIndex = text.indexOf(">", cursor);
      if (closeIndex < 0 || closeIndex >= endOffset) return { context: "text", stack };
      if (parsed) popStack(stack, parsed.name);
      offset = closeIndex + 1;
      continue;
    }

    let nameOffset = offset + 1;
    while (nameOffset < endOffset && /\s/.test(text[nameOffset] || "")) nameOffset += 1;
    const parsed = parseName(text, nameOffset);
    if (!parsed) {
      offset += 1;
      continue;
    }

    let cursor = parsed.end;
    let quote: '"' | "'" | undefined;

    while (cursor < endOffset) {
      const char = text[cursor];
      if (quote) {
        if (char === quote) quote = undefined;
        cursor += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        cursor += 1;
        continue;
      }
      if (char === ">") break;
      cursor += 1;
    }

    if (quote) return { context: "attribute-value", stack };
    if (cursor >= endOffset) return { context: "text", stack };

    let tail = cursor - 1;
    while (tail > parsed.end && /\s/.test(text[tail] || "")) tail -= 1;
    if (text[tail] !== "/") stack.push(parsed.name);
    offset = cursor + 1;
  }

  return { context: "text", stack };
}

function findFirstAttributeOffset(text: string, parsedEnd: number, endOffset: number) {
  let cursor = parsedEnd;

  while (cursor < endOffset) {
    const char = text[cursor];
    if (char === ">") return undefined;
    if (char === "/") {
      cursor += 1;
      continue;
    }
    if (!/\s/.test(char)) return cursor;
    cursor += 1;
  }

  return undefined;
}

function parseStartTagAttributes(
  text: string,
  contentStartOffset: number,
  contentEndOffset: number,
): Record<string, string | undefined> {
  const attributes: Record<string, string | undefined> = {};
  let cursor = contentStartOffset;

  while (cursor < contentEndOffset) {
    while (cursor < contentEndOffset && /\s/.test(text[cursor] || "")) cursor += 1;
    if (cursor >= contentEndOffset) break;
    if (text[cursor] === "/") {
      cursor += 1;
      continue;
    }

    const parsed = parseName(text, cursor);
    if (!parsed) {
      cursor += 1;
      continue;
    }

    cursor = parsed.end;
    while (cursor < contentEndOffset && /\s/.test(text[cursor] || "")) cursor += 1;

    if (text[cursor] !== "=") {
      attributes[parsed.name] = undefined;
      continue;
    }

    cursor += 1;
    while (cursor < contentEndOffset && /\s/.test(text[cursor] || "")) cursor += 1;

    if (cursor >= contentEndOffset) {
      attributes[parsed.name] = undefined;
      break;
    }

    const delimiter = text[cursor];
    if (delimiter === '"' || delimiter === "'") {
      const valueStart = cursor + 1;
      cursor = valueStart;
      while (cursor < contentEndOffset && text[cursor] !== delimiter) cursor += 1;
      attributes[parsed.name] = text.slice(valueStart, cursor);
      if (cursor < contentEndOffset) cursor += 1;
      continue;
    }

    const valueStart = cursor;
    while (cursor < contentEndOffset && !/\s/.test(text[cursor] || "")) cursor += 1;
    attributes[parsed.name] = text.slice(valueStart, cursor);
  }

  return attributes;
}

type StartTagInteriorScan = {
  firstAttributeOffset?: number;
  hasTagEnd: boolean;
  quote?: '"' | "'";
  sawSlashOutsideQuotes: boolean;
  valueState: "none" | "expect-value" | "unquoted-value";
};

function scanStartTagInterior(
  text: string,
  contentStartOffset: number,
  contentEndOffset: number,
): StartTagInteriorScan {
  let cursor = contentStartOffset;
  let quote: '"' | "'" | undefined;
  let sawSlashOutsideQuotes = false;
  let valueState: StartTagInteriorScan["valueState"] = "none";
  const firstAttributeOffset = findFirstAttributeOffset(text, contentStartOffset, contentEndOffset);

  while (cursor < contentEndOffset) {
    const char = text[cursor];

    if (quote) {
      if (char === quote) quote = undefined;
      cursor += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      if (valueState === "expect-value") valueState = "none";
      quote = char;
      cursor += 1;
      continue;
    }

    if (char === ">") {
      return { firstAttributeOffset, hasTagEnd: true, quote, sawSlashOutsideQuotes, valueState };
    }

    if (char === "=") {
      valueState = "expect-value";
      cursor += 1;
      continue;
    }

    if (/\s/.test(char)) {
      if (valueState === "unquoted-value") valueState = "none";
      cursor += 1;
      continue;
    }

    if (char === "/") {
      if (valueState === "none") {
        sawSlashOutsideQuotes = true;
      } else {
        valueState = "unquoted-value";
      }
      cursor += 1;
      continue;
    }

    if (valueState === "expect-value") valueState = "unquoted-value";
    cursor += 1;
  }

  return { firstAttributeOffset, hasTagEnd: false, quote, sawSlashOutsideQuotes, valueState };
}

export function findOpenStartTagAtSlash(
  text: string,
  slashOffset: number,
): XmlOpenStartTag | undefined {
  if (slashOffset < 2) return undefined;
  const scan = scanXmlPrefix(text, slashOffset);
  if (scan.context !== "text") return undefined;

  const openIndex = text.lastIndexOf("<", slashOffset - 1);
  if (openIndex < 0) return undefined;
  if (text[openIndex + 1] === "/" || text[openIndex + 1] === "!" || text[openIndex + 1] === "?") {
    return undefined;
  }
  if (text.slice(openIndex, slashOffset).includes(">")) return undefined;

  let nameOffset = openIndex + 1;
  while (/\s/.test(text[nameOffset] || "")) nameOffset += 1;
  const parsed = parseName(text, nameOffset);
  if (!parsed || parsed.end > slashOffset - 1) return undefined;

  const interior = scanStartTagInterior(text, parsed.end, slashOffset - 1);
  if (interior.hasTagEnd || interior.quote) return undefined;
  if (interior.sawSlashOutsideQuotes) return undefined;
  if (interior.valueState !== "none") return undefined;

  return {
    tagName: parsed.name,
    tagStartOffset: openIndex,
    firstAttributeOffset: interior.firstAttributeOffset,
  };
}

export function findJustClosedStartTag(
  text: string,
  positionOffset: number,
): XmlClosedStartTag | undefined {
  if (positionOffset < 1 || text[positionOffset - 1] !== ">") return undefined;
  const scan = scanXmlPrefix(text, positionOffset);
  if (scan.context !== "text") return undefined;

  const openIndex = text.lastIndexOf("<", positionOffset - 1);
  if (openIndex < 0) return undefined;
  if (text[openIndex + 1] === "/" || text[openIndex + 1] === "!" || text[openIndex + 1] === "?") {
    return undefined;
  }

  let nameOffset = openIndex + 1;
  while (/\s/.test(text[nameOffset] || "")) nameOffset += 1;
  const parsed = parseName(text, nameOffset);
  if (!parsed) return undefined;

  const interior = scanStartTagInterior(text, parsed.end, positionOffset - 1);
  if (interior.hasTagEnd || interior.quote) return undefined;

  let tail = positionOffset - 2;
  while (tail > parsed.end && /\s/.test(text[tail] || "")) tail -= 1;
  const closingToken = text[tail] === "/" ? "/>" : ">";

  return {
    attributes: parseStartTagAttributes(text, parsed.end, positionOffset - 1),
    tagName: parsed.name,
    tagStartOffset: openIndex,
    tagEndOffset: positionOffset,
    firstAttributeOffset: interior.firstAttributeOffset,
    closingToken,
  };
}

export function findIncompleteOpenStartTag(
  text: string,
  endOffset: number,
): XmlOpenStartTag | undefined {
  let offset = 0;

  while (offset < endOffset) {
    const nextOpen = text.indexOf("<", offset);
    if (nextOpen < 0 || nextOpen >= endOffset) return undefined;
    offset = nextOpen;

    if (text.startsWith("<!--", offset)) {
      const end = text.indexOf("-->", offset + 4);
      if (end < 0 || end + 3 > endOffset) return undefined;
      offset = end + 3;
      continue;
    }

    if (text.startsWith("<![CDATA[", offset)) {
      const end = text.indexOf("]]>", offset + 9);
      if (end < 0 || end + 3 > endOffset) return undefined;
      offset = end + 3;
      continue;
    }

    if (text.startsWith("<?", offset)) {
      const end = text.indexOf("?>", offset + 2);
      if (end < 0 || end + 2 > endOffset) return undefined;
      offset = end + 2;
      continue;
    }

    if (text.startsWith("<!", offset)) {
      const end = findMarkupDeclarationEnd(text, offset, endOffset);
      if (end === undefined) return undefined;
      offset = end + 1;
      continue;
    }

    if (text[offset + 1] === "/") {
      const closeIndex = text.indexOf(">", offset + 2);
      if (closeIndex < 0 || closeIndex >= endOffset) return undefined;
      offset = closeIndex + 1;
      continue;
    }

    let nameOffset = offset + 1;
    while (nameOffset < endOffset && /\s/.test(text[nameOffset] || "")) nameOffset += 1;
    const parsed = parseName(text, nameOffset);
    if (!parsed) {
      offset += 1;
      continue;
    }

    const firstAttributeOffset = findFirstAttributeOffset(text, parsed.end, endOffset);
    let cursor = parsed.end;
    let quote: '"' | "'" | undefined;

    while (cursor < endOffset) {
      const char = text[cursor];
      if (quote) {
        if (char === quote) quote = undefined;
        cursor += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        cursor += 1;
        continue;
      }
      if (char === ">") break;
      cursor += 1;
    }

    if (quote) return undefined;
    if (cursor >= endOffset) {
      return {
        tagName: parsed.name,
        tagStartOffset: offset,
        firstAttributeOffset,
      };
    }

    offset = cursor + 1;
  }

  return undefined;
}
