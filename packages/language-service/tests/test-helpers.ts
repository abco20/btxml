import { getDefaultResolvedBtxmlConfig, getEffectiveConfigForFile } from "@btxml/config";
import { createTextDocument as createFoundationTextDocument } from "@btxml/foundation";
import { createLanguageService as createLanguageServiceFactory } from "@btxml/language-service";

export const defaultEffectiveConfig = getEffectiveConfigForFile(
  getDefaultResolvedBtxmlConfig(),
  "test.xml",
);

export const createTextDocument = createFoundationTextDocument;
export const createLanguageService = createLanguageServiceFactory;
