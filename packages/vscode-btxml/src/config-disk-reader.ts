import fs from "node:fs/promises";
import { normalizeBtxmlConfig } from "@btxml/config";

export async function readBtCppXmlConfigFromDisk(configPath: string) {
  try {
    const text = await fs.readFile(configPath, "utf8");
    const normalized = normalizeBtxmlConfig(JSON.parse(text));
    return normalized.ok ? normalized.config : undefined;
  } catch {
    return undefined;
  }
}
