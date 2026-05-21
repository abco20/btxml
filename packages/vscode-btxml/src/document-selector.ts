export const BTCPP_XML_DOCUMENT_SELECTOR = [
  { scheme: "file", language: "btcpp-xml" },
  { scheme: "untitled", language: "btcpp-xml" },
] as const;

export const BTCPP_XML_LSP_DOCUMENT_SELECTOR = [
  ...BTCPP_XML_DOCUMENT_SELECTOR,
  { scheme: "file", language: "xml" },
  { scheme: "untitled", language: "xml" },
] as const;
