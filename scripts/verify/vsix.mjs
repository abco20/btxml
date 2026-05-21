import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const extensionDir = path.resolve(root, "packages/vscode-btxml");
const pkg = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));
const vsixName = `btxml-${pkg.version}.vsix`;
const vsixPath = process.argv[2] || path.join(extensionDir, vsixName);

if (!fs.existsSync(vsixPath)) {
  console.error(`VSIX not found: ${vsixPath}`);
  process.exit(1);
}

const filenameVersion = path.basename(vsixPath).replace(/^btxml-/, "").replace(/\.vsix$/, "");
if (filenameVersion !== pkg.version) {
  console.error(`VSIX filename version ${filenameVersion} does not match package.json version ${pkg.version}`);
  process.exit(1);
}

const contents = await listZipEntries(vsixPath);

const required = [
  ["extension/package.json"],
  ["extension/dist/extension.cjs"],
  ["extension/dist/server.cjs"],
  ["extension/language-configuration.json"],
  ["extension/schemas/btxml.config.schema.json"],
  ["extension/schemas/btxml.nodes.schema.json"],
  ["extension/syntaxes/btcpp-xml.tmLanguage.json"],
  ["extension/readme.md"],
  ["extension/LICENSE", "extension/LICENSE.txt"],
];

let failed = false;

for (const alternatives of required) {
  const file = alternatives.find((entry) => contents.includes(entry));
  if (!file) {
    console.error(`Missing in VSIX: ${alternatives.join(" or ")}`);
    failed = true;
  } else {
    console.log(`OK: ${file}`);
  }
}

const forbiddenPatterns = [/^extension\/src\//, /^extension\/node_modules\//, /^extension\/\.vscode-test\//, /^extension\/.*\.vsix$/, /^extension\/.*\.tgz$/, /^extension\/coverage\//];

for (const pattern of forbiddenPatterns) {
  const entries = contents.filter((entry) => pattern.test(entry));
  for (const entry of entries) {
    console.error(`Forbidden in VSIX: ${entry}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("VSIX contents verified.");

async function listZipEntries(filePath) {
  const zip = await openZip(filePath);

  try {
    const entries = [];
    for (let offset = 0; offset < zip.centralDirectoryEntries; offset += 1) {
      const entry = await zip.readEntry();
      if (entry.fileName) {
        entries.push(entry.fileName);
      }
    }
    return entries;
  } finally {
    await zip.file.close();
  }
}

async function openZip(filePath) {
  const file = await fs.promises.open(filePath, "r");

  try {
    const stats = await file.stat();
    const maxCommentLength = 0xffff;
    const eocdLength = 22;
    const readLength = Math.min(stats.size, eocdLength + maxCommentLength);
    const buffer = Buffer.alloc(readLength);
    await file.read(buffer, 0, readLength, stats.size - readLength);

    let eocdOffset = -1;
    for (let index = readLength - eocdLength; index >= 0; index -= 1) {
      if (buffer.readUInt32LE(index) === 0x06054b50) {
        eocdOffset = index;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error(`Failed to locate zip central directory in ${filePath}`);
    }

    const centralDirectoryEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

    return {
      file,
      centralDirectoryEntries,
      cursor: centralDirectoryOffset,
      async readEntry() {
        const fixedHeader = Buffer.alloc(46);
        await file.read(fixedHeader, 0, fixedHeader.length, this.cursor);

        if (fixedHeader.readUInt32LE(0) !== 0x02014b50) {
          throw new Error(`Invalid zip central directory header in ${filePath}`);
        }

        const fileNameLength = fixedHeader.readUInt16LE(28);
        const extraFieldLength = fixedHeader.readUInt16LE(30);
        const commentLength = fixedHeader.readUInt16LE(32);
        const variableLength = fileNameLength + extraFieldLength + commentLength;
        const variable = Buffer.alloc(variableLength);
        await file.read(variable, 0, variable.length, this.cursor + fixedHeader.length);

        this.cursor += fixedHeader.length + variableLength;

        return {
          fileName: variable.subarray(0, fileNameLength).toString("utf8"),
        };
      },
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}
