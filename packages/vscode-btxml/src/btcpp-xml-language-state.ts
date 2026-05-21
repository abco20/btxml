import { BTCPP_XML_LANGUAGE_ID, XML_LANGUAGE_IDS } from "./btcpp-xml-classifier.ts";

export type BtCppXmlLanguageAction =
  | {
      type: "none";
    }
  | {
      type: "promote";
      fromLanguageId: string;
      toLanguageId: typeof BTCPP_XML_LANGUAGE_ID;
    }
  | {
      type: "demote";
      fromLanguageId: typeof BTCPP_XML_LANGUAGE_ID;
      toLanguageId: string;
    };

export function getBtCppXmlLanguageAction(options: {
  languageId: string;
  detectedAsBtCppXml: boolean;
  autoPromotedFromLanguageId?: string;
}): BtCppXmlLanguageAction {
  if (options.autoPromotedFromLanguageId) {
    if (options.languageId === BTCPP_XML_LANGUAGE_ID && !options.detectedAsBtCppXml) {
      return {
        type: "demote",
        fromLanguageId: BTCPP_XML_LANGUAGE_ID,
        toLanguageId: options.autoPromotedFromLanguageId,
      };
    }
    return { type: "none" };
  }

  if (options.languageId === BTCPP_XML_LANGUAGE_ID) {
    return { type: "none" };
  }

  if (!XML_LANGUAGE_IDS.has(options.languageId) || !options.detectedAsBtCppXml) {
    return { type: "none" };
  }

  return {
    type: "promote",
    fromLanguageId: options.languageId,
    toLanguageId: BTCPP_XML_LANGUAGE_ID,
  };
}
