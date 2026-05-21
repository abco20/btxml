import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LEGACY_INPUT = path.resolve(REPO_ROOT, "packages/model/resources/btcpp_default_models.xml");
const LEGACY_OUTPUT = path.resolve(REPO_ROOT, "packages/model/src/generated/btcpp-v4-builtins.ts");
const VERSIONED_RESOURCES_ROOT = path.resolve(REPO_ROOT, "packages/model/resources/btcpp");
const GENERATED_ROOT = path.resolve(REPO_ROOT, "packages/model/src/generated");
const VERSIONS_FILE = path.join(VERSIONED_RESOURCES_ROOT, "versions.json");
const REGISTRY_OUTPUT = path.join(GENERATED_ROOT, "btcpp-builtins-registry.ts");

function getAttr(element, name) {
  return element.attributes.find((attr) => attr.name === name);
}

function isAllowedTreeNodeKind(name) {
  return (
    name === "Action" ||
    name === "Condition" ||
    name === "Control" ||
    name === "Decorator" ||
    name === "SubTree"
  );
}

function parseArgs(argv) {
  const args = {
    version: undefined,
    all: false,
    check: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") args.version = argv[++i];
    else if (arg === "--all") args.all = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  pnpm generate:btcpp-builtins --version 4.9.0
  pnpm generate:btcpp-builtins --all
  pnpm generate:btcpp-builtins --all --check

Generates TypeScript builtin catalogs from versioned BT.CPP XML resources.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.version && args.all) {
    throw new Error("--version and --all are mutually exclusive");
  }

  return args;
}

function versionToConstSuffix(version) {
  return version.replaceAll(/[^0-9A-Za-z]+/g, "_");
}

function versionToModelSet(version) {
  return `btcpp-v${version}`;
}

function getBuiltinModelsConstName(version) {
  return `btcppV${versionToConstSuffix(version)}BuiltinModels`;
}

function getGenericSubTreeConstName(version) {
  return `btcppV${versionToConstSuffix(version)}GenericSubTreeModel`;
}

async function parseXml(text) {
  try {
    const { parseBtXml } = await import("@btxml/syntax");
    const result = parseBtXml(text, { kind: "model-xml", mode: "strict" });
    if (!result.ok || !result.document?.root) {
      throw new Error("Failed to parse XML with project parser");
    }
    return result.document.root;
  } catch (error) {
    throw new Error(
      `Failed to parse XML with project parser: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readVersionsConfig() {
  if (!fs.existsSync(VERSIONS_FILE)) {
    throw new Error(`Versions file not found: ${path.relative(REPO_ROOT, VERSIONS_FILE)}`);
  }

  const config = readJson(VERSIONS_FILE);
  if (!Array.isArray(config.versions) || config.versions.length === 0) {
    throw new Error("versions.json must define a non-empty versions array");
  }
  if (typeof config.default !== "string" || !config.versions.includes(config.default)) {
    throw new Error("versions.json must define a default version included in versions");
  }

  return config;
}

function validateModels(models) {
  const ids = new Set();
  for (const model of models) {
    if (!model.id) throw new Error("Found builtin model with empty id");
    if (ids.has(model.id)) throw new Error(`Duplicate builtin model id: ${model.id}`);
    ids.add(model.id);

    const portNames = new Set();
    for (const port of model.ports) {
      if (!port.name) throw new Error(`Builtin model ${model.id} has a port with empty name`);
      if (portNames.has(port.name)) {
        throw new Error(`Builtin model ${model.id} has duplicate port name: ${port.name}`);
      }
      portNames.add(port.name);
    }
  }
}

function appendLines(lines, ...newLines) {
  lines.push(...newLines);
}

function isPortElement(node) {
  return node.name === "input_port" || node.name === "output_port" || node.name === "inout_port";
}

function getPortDirection(name) {
  switch (name) {
    case "input_port":
      return "input";
    case "output_port":
      return "output";
    default:
      return "inout";
  }
}

function getElementDescription(element) {
  return (
    (element.children || [])
      .filter((child) => child.kind === "text")
      .map((child) => child.text)
      .join("")
      .trim() || undefined
  );
}

function extractPort(port) {
  const nameAttr = getAttr(port, "name");
  const typeAttr = getAttr(port, "type");
  const defaultAttr = getAttr(port, "default") || getAttr(port, "default_value");
  const enumAttr = getAttr(port, "enum");
  const direction = getPortDirection(port.name);

  return {
    name: nameAttr ? nameAttr.value : "",
    direction,
    type: typeAttr?.value || undefined,
    defaultValue: defaultAttr?.value || undefined,
    description: getElementDescription(port),
    required: (direction === "input" || direction === "inout") && defaultAttr === undefined,
    enum: enumAttr?.value ? enumAttr.value.split(";") : undefined,
  };
}

function extractModel(node) {
  const idAttr = getAttr(node, "ID");
  if (!idAttr) {
    return null;
  }

  return {
    id: idAttr.value,
    kind: node.name,
    ports: (node.children || [])
      .filter((child) => child.kind === "element" && isPortElement(child))
      .map(extractPort),
  };
}

function extractSupportedModel(node) {
  if (node.kind !== "element") {
    return null;
  }
  if (!isAllowedTreeNodeKind(node.name)) {
    throw new Error(`Unsupported TreeNodesModel node kind: ${node.name}`);
  }

  return extractModel(node);
}

function getTreeNodesModelElements(root) {
  return root.name === "TreeNodesModel"
    ? [root]
    : root.children.filter((child) => child.kind === "element" && child.name === "TreeNodesModel");
}

function collectBuiltinModels(root) {
  const models = [];
  let genericSubTreeModel = null;

  for (const block of getTreeNodesModelElements(root)) {
    for (const node of block.children || []) {
      const model = extractSupportedModel(node);
      if (!model) {
        continue;
      }

      if (node.name === "SubTree" && model.id === "SubTree") {
        genericSubTreeModel = model;
      } else {
        models.push(model);
      }
    }
  }

  return { models, genericSubTreeModel };
}

function validateSubTreeModelPlacement(models) {
  if (models.some((model) => model.id === "SubTree" && model.kind === "SubTree")) {
    throw new Error(
      '<SubTree ID="SubTree"> must be emitted as generic SubTree ports, not as a normal builtin model',
    );
  }
}

function appendGeneratedTypeDefinitions(lines) {
  appendLines(
    lines,
    "export type GeneratedBuiltinPort = {",
    "  name: string;",
    '  direction: "input" | "output" | "inout";',
    "  type?: string;",
    "  defaultValue?: string;",
    "  description?: string;",
    "  required: boolean;",
    "  enum?: string[];",
    "};",
    "",
    "export type GeneratedBuiltinModel = {",
    "  id: string;",
    '  kind: "Action" | "Condition" | "Control" | "Decorator" | "SubTree";',
    "  ports: GeneratedBuiltinPort[];",
    "};",
    "",
  );
}

function appendModelArray(lines, modelConst, models) {
  appendLines(lines, `export const ${modelConst} = [`);
  for (let i = 0; i < models.length; i += 1) {
    const modelLines = serializeModel(models[i], "  ");
    appendLines(lines, modelLines + (i < models.length - 1 ? "," : ""));
  }
  appendLines(lines, "] as const satisfies readonly GeneratedBuiltinModel[];", "");
}

function appendGenericSubTree(lines, genericConst, genericSubTreeModel) {
  if (!genericSubTreeModel) {
    appendLines(lines, `export const ${genericConst} = undefined;`, "");
    return;
  }

  appendLines(
    lines,
    `export const ${genericConst} = {`,
    `  id: ${JSON.stringify(genericSubTreeModel.id)},`,
    `  kind: ${JSON.stringify(genericSubTreeModel.kind)},`,
    "  ports: [",
  );
  for (let i = 0; i < genericSubTreeModel.ports.length; i += 1) {
    const portLines = serializePort(genericSubTreeModel.ports[i], "    ");
    appendLines(lines, portLines + (i < genericSubTreeModel.ports.length - 1 ? "," : ""));
  }
  appendLines(lines, "  ],", "} as const satisfies GeneratedBuiltinModel;", "");
}

function serializePort(port, indent) {
  const parts = [];
  appendLines(
    parts,
    `${indent}{`,
    `${indent}  name: ${JSON.stringify(port.name)},`,
    `${indent}  direction: ${JSON.stringify(port.direction)},`,
  );
  if (port.type !== undefined) parts.push(`${indent}  type: ${JSON.stringify(port.type)},`);
  if (port.defaultValue !== undefined)
    parts.push(`${indent}  defaultValue: ${JSON.stringify(port.defaultValue)},`);
  if (port.description !== undefined)
    parts.push(`${indent}  description: ${JSON.stringify(port.description)},`);
  appendLines(parts, `${indent}  required: ${JSON.stringify(port.required)},`);
  if (port.enum !== undefined) parts.push(`${indent}  enum: ${JSON.stringify(port.enum)},`);
  appendLines(parts, `${indent}}`);
  return parts.join("\n");
}

function serializeModel(model, indent) {
  const parts = [];
  appendLines(
    parts,
    `${indent}{`,
    `${indent}  id: ${JSON.stringify(model.id)},`,
    `${indent}  kind: ${JSON.stringify(model.kind)},`,
    `${indent}  ports: [`,
  );
  for (let i = 0; i < model.ports.length; i += 1) {
    const portLines = serializePort(model.ports[i], `${indent}    `);
    appendLines(parts, portLines + (i < model.ports.length - 1 ? "," : ""));
  }
  appendLines(parts, `${indent}  ],`, `${indent}}`);
  return parts.join("\n");
}

async function buildOutput(inputXmlPath, outputTsPath, exportBaseName) {
  const text = fs.readFileSync(inputXmlPath, "utf8");
  const root = await parseXml(text);

  const { models, genericSubTreeModel } = collectBuiltinModels(root);
  validateSubTreeModelPlacement(models);

  validateModels(models);
  models.sort((a, b) => a.id.localeCompare(b.id));

  const modelConst = `${exportBaseName}BuiltinModels`;
  const genericConst = `${exportBaseName}GenericSubTreeModel`;

  const lines = [];
  appendLines(
    lines,
    `// Generated from ${path.relative(REPO_ROOT, inputXmlPath).replaceAll("\\", "/")}.`,
    "// Do not edit manually. Run `pnpm generate:btcpp-builtins`.",
    "",
  );
  appendGeneratedTypeDefinitions(lines);
  appendModelArray(lines, modelConst, models);
  appendGenericSubTree(lines, genericConst, genericSubTreeModel);

  let out = lines.join("\n") + "\n";

  out = formatGeneratedText(outputTsPath, out);

  return out;
}

function formatGeneratedText(outputPath, content) {
  let out = content;

  const tmpFile = path.resolve(path.dirname(outputPath), `.tmp-${path.basename(outputPath)}`);
  try {
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, out, "utf8");
    execFileSync("pnpm", ["exec", "biome", "format", "--write", tmpFile], { stdio: "pipe" });
    out = fs.readFileSync(tmpFile, "utf8");
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }

  return out;
}

function buildRegistryOutput(versionsConfig) {
  const { default: defaultVersion, versions } = versionsConfig;
  const lines = [];

  appendLines(
    lines,
    "// Generated from packages/model/resources/btcpp/versions.json.",
    "// Do not edit manually. Run `pnpm generate:btcpp-builtins --all`.",
    "",
  );

  for (const version of versions) {
    const builtinModelsConst = getBuiltinModelsConstName(version);
    const genericSubTreeConst = getGenericSubTreeConstName(version);
    const importPath = JSON.stringify(`./btcpp-v${version}-builtins.js`);
    appendLines(
      lines,
      `import { ${builtinModelsConst}, ${genericSubTreeConst} } from ${importPath};`,
    );
  }

  appendLines(
    lines,
    "",
    `export const generatedBtcppBuiltinVersions = ${JSON.stringify(versions)} as const;`,
    "export type GeneratedBtcppBuiltinVersion = (typeof generatedBtcppBuiltinVersions)[number];",
    `export type GeneratedBuiltinModelSet = ${versions
      .map((version) => JSON.stringify(versionToModelSet(version)))
      .join(" | ")};`,
    "",
    `export const generatedDefaultBtcppBuiltinVersion = ${JSON.stringify(defaultVersion)} as const;`,
    "",
    "export const generatedBtcppBuiltinCatalogs = {",
  );

  for (const version of versions) {
    const builtinModelsConst = getBuiltinModelsConstName(version);
    const genericSubTreeConst = getGenericSubTreeConstName(version);
    appendLines(
      lines,
      `  ${JSON.stringify(version)}: {`,
      `    models: ${builtinModelsConst},`,
      `    genericSubTreeModel: ${genericSubTreeConst},`,
      "  },",
    );
  }

  appendLines(lines, "} as const;", "");

  return formatGeneratedText(REGISTRY_OUTPUT, lines.join("\n") + "\n");
}

function writeOrCheck(outputPath, next, check) {
  if (check) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (existing !== next) {
      throw new Error(
        `Generated file is out of date: ${path.relative(REPO_ROOT, outputPath)}. Run \`pnpm generate:btcpp-builtins --all\`.`,
      );
    }
    console.log(`Generated file is up to date: ${path.relative(REPO_ROOT, outputPath)}`);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, next, "utf8");
  console.log(`Generated ${path.relative(REPO_ROOT, outputPath)}`);
}

async function runOne(inputXmlPath, outputTsPath, exportBaseName, check) {
  const next = await buildOutput(inputXmlPath, outputTsPath, exportBaseName);
  writeOrCheck(outputTsPath, next, check);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.all) {
    const versionsConfig = readVersionsConfig();
    const { versions } = versionsConfig;
    for (const version of versions) {
      const inputXmlPath = path.join(VERSIONED_RESOURCES_ROOT, version, "btcpp_default_models.xml");
      const outputTsPath = path.join(GENERATED_ROOT, `btcpp-v${version}-builtins.ts`);
      const exportBaseName = `btcppV${versionToConstSuffix(version)}`;
      if (!fs.existsSync(inputXmlPath)) {
        throw new Error(`Versioned resource not found: ${path.relative(REPO_ROOT, inputXmlPath)}`);
      }
      await runOne(inputXmlPath, outputTsPath, exportBaseName, args.check);
    }

    const registryOutput = buildRegistryOutput(versionsConfig);
    writeOrCheck(REGISTRY_OUTPUT, registryOutput, args.check);
    return;
  }

  if (args.version) {
    const version = args.version;
    const inputXmlPath = path.join(VERSIONED_RESOURCES_ROOT, version, "btcpp_default_models.xml");
    const outputTsPath = path.join(GENERATED_ROOT, `btcpp-v${version}-builtins.ts`);
    const exportBaseName = `btcppV${versionToConstSuffix(version)}`;
    if (!fs.existsSync(inputXmlPath)) {
      throw new Error(`Versioned resource not found: ${path.relative(REPO_ROOT, inputXmlPath)}`);
    }
    await runOne(inputXmlPath, outputTsPath, exportBaseName, args.check);
    return;
  }

  // Backward-compatible default behavior (legacy v4 alias generation).
  await runOne(LEGACY_INPUT, LEGACY_OUTPUT, "btcppV4", args.check);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
