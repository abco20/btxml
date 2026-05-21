import { readFileSync } from "fs";
import { formatBtXml } from "@btxml/syntax";

const content = readFileSync("tests/fixtures/formatter/real/groot-large.expected.xml", "utf8");

const start = performance.now();
const result = formatBtXml(content);
const elapsedMs = performance.now() - start;

console.log(`elapsedMs: ${elapsedMs}`);
if (elapsedMs > 1000) {
  process.exit(1);
}
