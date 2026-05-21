import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const npmCommand = getNpmCommand();
const initializeTimeoutMs = 5000;

const steps = [
  ["bundled vscode runtimes", verifyBundledVscodeRuntimes],
  ["packed cli language server", verifyPackedLanguageServer],
];

for (const [label, action] of steps) {
  console.log(`\n==> ${label}`);
  await action();
}

function verifyBundledVscodeRuntimes() {
  const distDirs = [
    path.join(root, "packages", "vscode-btxml", "dist"),
    path.join(root, "packages", "btxml-lsp", "dist"),
  ];
  const bareRuntimePattern = /(?:from\s*["']|require\(["']|import\(["'])(vscode-languageclient(?:\/node)?|vscode-languageserver(?:\/node\.js)?|vscode-languageserver-textdocument)["']/;

  let failed = false;

  for (const distDir of distDirs) {
    for (const filePath of walk(distDir)) {
      if (!/\.(?:cjs|js)$/.test(filePath)) continue;
      const source = fs.readFileSync(filePath, "utf8");
      const match = bareRuntimePattern.exec(source);
      if (match) {
        failed = true;
        console.error(`Bare VS Code runtime dependency remains in ${path.relative(root, filePath)}: ${match[1]}`);
      }
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("VS Code runtime dependencies are bundled.");
}

async function verifyPackedLanguageServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-pack-"));
  const packageDirs = [
    "foundation",
    "script",
    "syntax",
    "model",
    "config",
    "semantic",
    "analyzer",
    "core",
    "project",
    "language-service",
    "btxml",
  ];

  try {
    const tarballs = packageDirs.map((packageDir) => pack(path.join(root, "packages", packageDir), tempDir));
    run(npmCommand, ["init", "-y"], tempDir);
    run(npmCommand, ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], tempDir);

    const serverPath = path.join(tempDir, "node_modules", "btxml", "dist", "server.cjs");
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Packed btxml language server is missing: ${serverPath}`);
    }

    await runLanguageServer(serverPath, tempDir);
    console.log("Packed btxml language server loaded.");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runLanguageServer(serverPath, cwd) {
  const child = spawn(process.execPath, [serverPath, "--stdio"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const diagnostics = {
    stdout: "",
    stderr: "",
    exitCode: null,
    signal: null,
    error: null,
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    diagnostics.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    diagnostics.stderr += chunk;
  });
  child.on("error", (error) => {
    diagnostics.error = error;
  });

  const exitPromise = new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      diagnostics.exitCode = code;
      diagnostics.signal = signal;
      resolve({ type: "exit", code, signal });
    });
  });

  const responsePromise = waitForInitializeResponse(child.stdout);
  child.stdin.write(createInitializeRequest(cwd));

  let initializeTimeout;
  const timeoutPromise = new Promise((resolve) => {
    initializeTimeout = setTimeout(() => resolve({ type: "timeout" }), initializeTimeoutMs);
  });

  let result;
  try {
    result = await Promise.race([
      responsePromise.then(() => ({ type: "response" })),
      exitPromise,
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(initializeTimeout);
  }

  child.stdin.end();
  if (!child.killed && diagnostics.exitCode === null && diagnostics.signal === null) {
    child.kill();
    await exitPromise;
  }

  const output = `${diagnostics.stdout}\n${diagnostics.stderr}`;
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(output)) {
    throw new Error(`Packed language server has unresolved runtime dependencies\n${output}`);
  }
  if (diagnostics.error) {
    throw new Error(`Packed language server failed to start\n${formatRuntimeDiagnostics(diagnostics)}`);
  }
  if (result.type === "response") {
    return;
  }
  if (result.type === "exit") {
    throw new Error(`Packed language server exited before initialize completed\n${formatRuntimeDiagnostics(diagnostics)}`);
  }
  throw new Error(`Packed language server did not answer initialize within ${initializeTimeoutMs}ms\n${formatRuntimeDiagnostics(diagnostics)}`);
}

function pack(packageRoot, destination) {
  const result = spawnSync(npmCommand, ["pack", "--json", "--pack-destination", destination], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${npmCommand} pack failed in ${packageRoot}\n${result.stdout}\n${result.stderr}`);
  }
  const packed = JSON.parse(result.stdout)[0];
  return path.join(destination, packed.filename);
}

function run(command, args, cwd, stdio = "pipe") {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function createInitializeRequest(cwd) {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileUri(cwd),
      capabilities: {},
      clientInfo: {
        name: "runtime-smoke",
        version: "1.0.0",
      },
    },
  });

  return `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`;
}

function waitForInitializeResponse(stdout) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const onData = (chunk) => {
      buffer += chunk;
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const header = buffer.slice(0, headerEnd);
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          cleanup();
          reject(new Error(`Invalid LSP response header\n${header}`));
          return;
        }

        const contentLength = Number(match[1]);
        const messageStart = headerEnd + 4;
        if (buffer.length < messageStart + contentLength) return;

        const body = buffer.slice(messageStart, messageStart + contentLength);
        buffer = buffer.slice(messageStart + contentLength);

        let message;
        try {
          message = JSON.parse(body);
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }

        if (message.id === 1) {
          cleanup();
          if (message.error) {
            reject(new Error(`Initialize request failed\n${JSON.stringify(message.error)}`));
            return;
          }
          resolve(message);
          return;
        }
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      stdout.off("data", onData);
      stdout.off("error", onError);
    };

    stdout.on("data", onData);
    stdout.on("error", onError);
  });
}

function pathToFileUri(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  const prefixed = resolved.startsWith("/") ? resolved : `/${resolved}`;
  return `file://${encodeURI(prefixed)}`;
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const entry = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(entry);
    } else {
      yield entry;
    }
  }
}

function formatRuntimeDiagnostics(diagnostics) {
  const details = [];
  if (diagnostics.error) details.push(`error: ${diagnostics.error.message}`);
  if (diagnostics.signal) details.push(`signal: ${diagnostics.signal}`);
  if (diagnostics.exitCode !== null) details.push(`exit status: ${diagnostics.exitCode}`);
  if (diagnostics.stdout) details.push(`stdout:\n${diagnostics.stdout}`);
  if (diagnostics.stderr) details.push(`stderr:\n${diagnostics.stderr}`);
  return details.join("\n");
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
