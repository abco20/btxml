import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TOOL_SOURCE_DIR = path.join(REPO_ROOT, "tools", "btcpp-catalog-generator");
const OUTPUT_ROOT = path.join(REPO_ROOT, "packages", "model", "resources", "btcpp");
const VERSIONS_FILE = path.join(OUTPUT_ROOT, "versions.json");
const BTCPP_SOURCE = "BehaviorTree/BehaviorTree.CPP";

function parseArgs(argv) {
  const out = {
    all: false,
    version: undefined,
    ref: undefined,
    name: undefined,
    dryRun: false,
    check: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") out.all = true;
    else if (arg === "--version") out.version = argv[++i];
    else if (arg === "--ref") out.ref = argv[++i];
    else if (arg === "--name") out.name = argv[++i];
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--check") out.check = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function printHelp() {
  console.log(`Usage:
  pnpm update:btcpp-catalog --version 4.9.0
  pnpm update:btcpp-catalog --all
  pnpm update:btcpp-catalog --all --check
  pnpm update:btcpp-catalog --ref master --name 4.10-dev
  pnpm update:btcpp-catalog --version 4.9.0 --dry-run

Generates versioned BT.CPP TreeNodesModel XML resources from BehaviorTree.CPP source tags.
Versions are read from packages/model/resources/btcpp/versions.json when --all is used.`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: options.captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    cwd: options.cwd,
  });
}

function canonicalizeXml(xmlText) {
  const withoutBom = xmlText.replace(/^\uFEFF/, "");
  const withoutXmlDecl = withoutBom.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
  return withoutXmlDecl.trimEnd() + "\n";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readVersionsConfig() {
  if (!fs.existsSync(VERSIONS_FILE)) {
    throw new Error(`Missing versions file: ${path.relative(REPO_ROOT, VERSIONS_FILE)}`);
  }

  const config = readJson(VERSIONS_FILE);
  if (!Array.isArray(config.versions) || config.versions.length === 0) {
    throw new Error("versions.json must define a non-empty versions array");
  }

  return config;
}

function validateArgs(args) {
  if (args.all && args.version) {
    throw new Error("Cannot use --all with --version");
  }

  if (args.all && args.ref) {
    throw new Error("Cannot use --all with --ref");
  }

  if (args.all && args.name) {
    throw new Error("Cannot use --all with --name");
  }

  if (args.all && args.dryRun) {
    throw new Error("--dry-run is only supported for a single version run");
  }

  if (!args.all && !args.ref && !args.version) {
    throw new Error("Missing --version or --ref");
  }
}

function buildMetadata({ version, ref, commit }) {
  return {
    source: BTCPP_SOURCE,
    version,
    ref,
    commit,
    generator: "scripts/update-btcpp-catalog.mjs",
    xml: "btcpp_default_models.xml",
  };
}

function updateCatalogForVersion({ versionName, ref, dryRun, check }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "btcpp-catalog-"));
  const btcppSourceDir = path.join(tempRoot, "BehaviorTree.CPP");
  const buildDir = path.join(tempRoot, "build");

  try {
    console.log(`Fetching BT.CPP source for ${versionName} (ref: ${ref}) ...`);
    run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      ref,
      "https://github.com/BehaviorTree/BehaviorTree.CPP.git",
      btcppSourceDir,
    ]);

    const commit = run("git", ["-C", btcppSourceDir, "rev-parse", "HEAD"], {
      captureOutput: true,
    }).trim();

    console.log(`Configuring CMake for ${versionName} ...`);
    run("cmake", [
      "-S",
      TOOL_SOURCE_DIR,
      "-B",
      buildDir,
      `-DBTCPP_SOURCE_DIR=${btcppSourceDir}`,
    ]);

    console.log(`Building generator for ${versionName} ...`);
    run("cmake", ["--build", buildDir, "--target", "generate_default_models"]);

    const exe = path.join(buildDir, "generate_default_models");
    console.log(`Generating TreeNodesModel XML for ${versionName} ...`);
    const rawXml = run(exe, [], { captureOutput: true });
    const xml = canonicalizeXml(rawXml);

    if (dryRun) {
      process.stdout.write(xml);
      return;
    }

    const outputDir = path.join(OUTPUT_ROOT, versionName);
    const xmlPath = path.join(outputDir, "btcpp_default_models.xml");
    const metadataPath = path.join(outputDir, "metadata.json");
    ensureDir(outputDir);

    const metadata = buildMetadata({ version: versionName, ref, commit });

    if (check) {
      const existingXml = fs.existsSync(xmlPath) ? fs.readFileSync(xmlPath, "utf8") : "";
      const existingMetadata = fs.existsSync(metadataPath)
        ? fs.readFileSync(metadataPath, "utf8")
        : "";
      const nextMetadata = JSON.stringify(metadata, null, 2) + "\n";
      if (existingXml !== xml || existingMetadata !== nextMetadata) {
        throw new Error(
          `BT.CPP catalog for ${versionName} is out of date. Run update:btcpp-catalog without --check.`
        );
      }
      console.log(`BT.CPP catalog for ${versionName} is up to date.`);
      return;
    }

    fs.writeFileSync(xmlPath, xml, "utf8");
    writeJson(metadataPath, metadata);
    console.log(`Wrote ${path.relative(REPO_ROOT, xmlPath)}`);
    console.log(`Wrote ${path.relative(REPO_ROOT, metadataPath)}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  if (args.all) {
    const { versions } = readVersionsConfig();
    for (const version of versions) {
      updateCatalogForVersion({
        versionName: version,
        ref: version,
        dryRun: false,
        check: args.check,
      });
    }
    return;
  }

  const ref = args.ref ?? args.version;
  const versionName = args.name ?? args.version ?? ref;
  updateCatalogForVersion({
    versionName,
    ref,
    dryRun: args.dryRun,
    check: args.check,
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
