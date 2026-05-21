import fs from "node:fs";
import path from "node:path";

export function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeTextAtomic(filePath: string, text: string) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    const stat = fs.statSync(filePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to format symbolic link: ${filePath}`);
    }
    fs.writeFileSync(tmp, text, "utf8");
    fs.chmodSync(tmp, stat.mode);
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore cleanup error
    }
    throw error;
  }
}
