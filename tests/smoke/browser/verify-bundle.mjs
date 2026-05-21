import fs from "node:fs";
import path from "node:path";

const bundlePath = path.join(process.cwd(), "dist", "main.js");
const bundle = fs.readFileSync(bundlePath, "utf8");

const forbidden = ["node:path", "node:fs", "node:url", "node:crypto", "@btxml/project"];

for (const specifier of forbidden) {
  if (bundle.includes(specifier)) {
    throw new Error(`browser smoke bundle leaked forbidden dependency: ${specifier}`);
  }
}

console.log("browser smoke bundle verified.");
