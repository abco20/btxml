import { findIncompleteOpenStartTag, findJustClosedStartTag } from "@btxml/syntax";

export const BTCPP_XML_LANGUAGE_ID = "btcpp-xml";
export const XML_LANGUAGE_IDS = new Set(["xml", "plaintext"]);
export const MAX_DETECTION_BYTES = 32_000;

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}

export function isBehaviorTreePath(fsPath: string) {
  const normalizedPath = normalizePath(fsPath).toLowerCase();
  return normalizedPath.endsWith(".bt.xml") || normalizedPath.endsWith(".tree.xml");
}

export function isLikelyBtCppXml(text: string) {
  for (let offset = text.indexOf(">"); offset >= 0; offset = text.indexOf(">", offset + 1)) {
    const tag = findJustClosedStartTag(text, offset + 1);
    if (!tag) continue;
    if (tag.tagName === "BehaviorTree" || tag.tagName === "TreeNodesModel") return true;
    if (tag.tagName === "root" && /^\d+$/.test(tag.attributes.BTCPP_format || "")) return true;
  }

  const incompleteTag = findIncompleteOpenStartTag(text, text.length);
  return incompleteTag?.tagName === "BehaviorTree" || incompleteTag?.tagName === "TreeNodesModel";
}

export function hasBtCppXmlDetectionSignals(options: {
  includedByConfig: boolean;
  fsPath: string;
  text: string;
}) {
  return (
    options.includedByConfig ||
    isBehaviorTreePath(options.fsPath) ||
    isLikelyBtCppXml(options.text.slice(0, MAX_DETECTION_BYTES))
  );
}

export function shouldTreatAsBtCppXmlDocument(options: {
  includedByConfig: boolean;
  languageId: string;
  fsPath: string;
  text: string;
}) {
  return options.languageId === BTCPP_XML_LANGUAGE_ID || hasBtCppXmlDetectionSignals(options);
}
