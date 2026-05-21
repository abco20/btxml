import type { Diagnostic } from "@btxml/foundation";
import type { SourcePosition, SourceRange } from "@btxml/foundation";

export type XmlDeclaration = {
  version?: string;
  encoding?: string;
  standalone?: string;
  range: SourceRange;
  attributes?: BtXmlAttribute[];
};

export type BtXmlText = {
  kind: "text";
  text: string;
  range: SourceRange;
  fullRange?: SourceRange;
};

export type BtXmlComment = {
  kind: "comment";
  text: string;
  range: SourceRange;
  fullRange?: SourceRange;
  contentRange?: SourceRange;
};

export type BtXmlAttribute = {
  name: string;
  value: string;
  valueOffsets?: readonly number[];
  range: SourceRange;
  fullRange?: SourceRange;
  nameRange: SourceRange;
  equalsRange?: SourceRange;
  valueRange: SourceRange;
  valueContentRange?: SourceRange;
};

export type BtXmlElement = {
  kind: "element";
  name: string;
  attributes: BtXmlAttribute[];
  children: BtXmlNode[];
  range: SourceRange;
  fullRange?: SourceRange;
  openTagRange: SourceRange;
  startTagRange?: SourceRange;
  closeTagRange?: SourceRange;
  endTagRange?: SourceRange;
  nameRange?: SourceRange;
  selfClosing: boolean;
};

export type BtXmlNode = BtXmlElement | BtXmlText | BtXmlComment;

export type BtDocumentKind = "bt-document" | "model-document" | "generic-xml" | "invalid-xml";

export type BtDocument = {
  uri: string;
  path?: string;
  kind: BtDocumentKind;
  isBtXml: boolean;
  xmlDeclaration?: XmlDeclaration;
  root?: BtXmlElement;
  nodes: BtXmlNode[];
  diagnostics: Diagnostic[];
  originalText: string;
};
