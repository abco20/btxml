export { parseBtXml } from "./parse/index.js";

export { formatBtXml } from "./format/index.js";

export { inspectXmlCursor } from "./inspect.js";

export {
  findIncompleteOpenStartTag,
  findJustClosedStartTag,
  findOpenStartTagAtSlash,
  scanXmlPrefix,
} from "./xml-context.js";

export {
  findElementAt,
  getAttribute,
  getElementChildren,
  getElementText,
  isElement,
  walkElements,
} from "./query.js";

export { positionAt } from "./position.js";

export {
  mapDecodedAttributeOffsetToRawOffset,
  mapDecodedAttributeRangeToDocumentRange,
} from "./attribute-value-offsets.js";

export type {
  BtDocument,
  BtDocumentKind,
  BtXmlNode,
  BtXmlElement,
  BtXmlAttribute,
  BtXmlText,
  BtXmlComment,
  XmlDeclaration,
} from "./ast.js";

export type { TextLikeDocument, XmlCursorContext } from "./inspect.js";

export type {
  XmlClosedStartTag,
  XmlOpenStartTag,
  XmlPrefixContext,
  XmlPrefixScanResult,
} from "./xml-context.js";

export type { ParseOptions, ParseResult, FormatOptions, FormatResult } from "./types.js";
