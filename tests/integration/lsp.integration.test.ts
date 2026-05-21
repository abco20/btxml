import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function encode(message: unknown) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function encodeHeaderless(message: unknown) {
  const json = JSON.stringify(message);
  return { body: json, header: `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n` };
}

type LspMessage = {
  jsonrpc: string;
  id?: number;
  method?: string;
  result?: unknown;
  params?: unknown;
  error?: unknown;
};

function createReader(proc: ReturnType<typeof spawn>) {
  let buffer = "";
  const queue: LspMessage[] = [];
  const waiters: Array<{
    resolve: (value: LspMessage) => void;
    reject: (error: Error) => void;
  }> = [];
  let stderr = "";
  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  proc.stdout?.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buffer.slice(0, headerEnd);
      const length = Number(header.match(/Content-Length: (\d+)/i)?.[1] || 0);
      const start = headerEnd + 4;
      if (buffer.length < start + length) break;
      const body = buffer.slice(start, start + length);
      buffer = buffer.slice(start + length);
      const parsed = JSON.parse(body) as LspMessage;
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(parsed);
      else queue.push(parsed);
    }
  });
  proc.on("exit", (code, signal) => {
    const error = new Error(
      `LSP process exited before response: code=${code ?? "null"} signal=${signal ?? "null"}${stderr ? ` stderr=${stderr}` : ""}`,
    );
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  });
  return () =>
    new Promise<LspMessage>((resolve, reject) => {
      const next = queue.shift();
      if (next) resolve(next);
      else waiters.push({ resolve, reject });
    });
}

function positionAt(text: string, marker: string, characterOffset = 0) {
  const offset = text.indexOf(marker);
  assert.notEqual(offset, -1, marker);
  const before = text.slice(0, offset + characterOffset);
  const lines = before.split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

const cli = path.resolve("packages/btxml/dist/cli.js");

test("LSP initialize open completion flow works", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="child"><AlwaysSuccess/></BehaviorTree>
  <BehaviorTree ID="main"><SubTree ID=""/></BehaviorTree>
</root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);

  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { rootPath: dir, capabilities: {} },
      }),
    );
    const init = await nextMessage();
    assert.equal(init.id, 1);
    const capabilities = (init.result as { capabilities: { completionProvider?: unknown } })
      .capabilities;
    assert.equal(Boolean(capabilities.completionProvider), true);
    assert.equal(
      (capabilities.completionProvider as { resolveProvider?: boolean })?.resolveProvider,
      undefined,
    );

    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    const diagnostics = await nextMessage();
    assert.equal(diagnostics.method, "textDocument/publishDiagnostics");

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/completion",
        params: { textDocument: { uri: `file://${file}` }, position: { line: 3, character: 39 } },
      }),
    );
    const completion = await nextMessage();
    assert.equal(completion.id, 2);
    assert.ok(
      (completion.result as Array<{ label: string }>).some(
        (item: { label: string }) => item.label === "child",
      ),
    );
    assert.ok(
      (completion.result as Array<{ textEdit?: unknown }>).some((item: { textEdit?: unknown }) =>
        Boolean(item.textEdit),
      ),
    );

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP normalizes equivalent file URIs for standard textDocument requests", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-uri-"));
  const file = path.join(dir, "tree file.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree>
</root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);

  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { rootPath: dir, capabilities: {} },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));

    const canonicalUri = new URL(`file://${file}`).href;
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: canonicalUri, languageId: "xml", version: 1, text } },
      }),
    );
    await nextMessage();

    const alternateUri = canonicalUri.replace("tree%20file.xml", "tree file.xml");
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/documentSymbol",
        params: { textDocument: { uri: alternateUri } },
      }),
    );
    const result = await nextMessage();
    assert.equal(result.id, 2);
    assert.ok(Array.isArray(result.result));
    assert.ok((result.result as Array<unknown>).length > 0);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP reloads config after workspace change", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-reload-"));
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "off" } } }),
    "utf8",
  );
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);
  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          rootPath: dir,
          capabilities: {},
          initializationOptions: { btxml: { configPath: "btxml.config.json" } },
        },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    const first = await nextMessage();
    assert.deepEqual((first.params as { diagnostics: unknown[] }).diagnostics, []);

    fs.writeFileSync(
      path.join(dir, "btxml.config.json"),
      JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "error" } } }),
      "utf8",
    );
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "workspace/didChangeConfiguration",
        params: { settings: { btxml: { configPath: "btxml.config.json" } } },
      }),
    );
    const second = await nextMessage();
    assert.equal(second.method, "textDocument/publishDiagnostics");
    assert.ok(
      (second.params as { diagnostics: Array<{ code: string }> }).diagnostics.some(
        (diag: { code: string }) => String(diag.code) === "BT005_UNKNOWN_SUBTREE",
      ),
    );

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP keeps plain BehaviorTree-root xml active", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-behavior-root-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);
  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { rootPath: dir, capabilities: {} },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    const diagnostics = await nextMessage();
    assert.equal(diagnostics.method, "textDocument/publishDiagnostics");
    assert.ok(
      (diagnostics.params as { diagnostics: Array<{ code: string }> }).diagnostics.some(
        (diag) => String(diag.code) === "BT005_UNKNOWN_SUBTREE",
      ),
    );

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/documentSymbol",
        params: { textDocument: { uri: `file://${file}` } },
      }),
    );
    const symbols = await nextMessage();
    assert.equal(symbols.id, 2);
    assert.ok(Array.isArray(symbols.result));
    assert.ok((symbols.result as Array<unknown>).length > 0);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP updates workspace routing after workspace folder changes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-folder-change-"));
  const firstRoot = path.join(dir, "first");
  const secondRoot = path.join(dir, "second");
  fs.mkdirSync(firstRoot, { recursive: true });
  fs.mkdirSync(secondRoot, { recursive: true });
  fs.writeFileSync(
    path.join(secondRoot, "btxml.config.json"),
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "off" } } }),
    "utf8",
  );
  const file = path.join(secondRoot, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);
  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          workspaceFolders: [{ uri: `file://${firstRoot}`, name: "first" }],
          capabilities: {},
        },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "workspace/didChangeWorkspaceFolders",
        params: {
          event: { added: [{ uri: `file://${secondRoot}`, name: "second" }], removed: [] },
        },
      }),
    );
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    const diagnostics = await nextMessage();
    assert.equal(diagnostics.method, "textDocument/publishDiagnostics");
    assert.deepEqual((diagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP resolves config and diagnostics from the matching workspace folder", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-multi-root-"));
  const firstRoot = path.join(dir, "first");
  const secondRoot = path.join(dir, "second");
  fs.mkdirSync(firstRoot, { recursive: true });
  fs.mkdirSync(secondRoot, { recursive: true });

  const secondFile = path.join(secondRoot, "tree.xml");
  const secondText = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(secondFile, secondText, "utf8");
  fs.writeFileSync(
    path.join(firstRoot, "btxml.config.json"),
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "error" } } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(secondRoot, "btxml.config.json"),
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "off" } } }),
    "utf8",
  );

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);
  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          capabilities: {},
          workspaceFolders: [
            { uri: `file://${firstRoot}`, name: "first" },
            { uri: `file://${secondRoot}`, name: "second" },
          ],
        },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: `file://${secondFile}`,
            languageId: "xml",
            version: 1,
            text: secondText,
          },
        },
      }),
    );
    const diagnostics = await nextMessage();
    assert.equal(diagnostics.method, "textDocument/publishDiagnostics");
    assert.deepEqual((diagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP reloads watched config changes for non-first workspace folders", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-multi-root-watch-"));
  const firstRoot = path.join(dir, "first");
  const secondRoot = path.join(dir, "second");
  fs.mkdirSync(firstRoot, { recursive: true });
  fs.mkdirSync(secondRoot, { recursive: true });

  const firstConfig = path.join(firstRoot, "btxml.config.json");
  const secondConfig = path.join(secondRoot, "btxml.config.json");
  const secondFile = path.join(secondRoot, "tree.xml");
  const secondText = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(
    firstConfig,
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "off" } } }),
    "utf8",
  );
  fs.writeFileSync(
    secondConfig,
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "off" } } }),
    "utf8",
  );
  fs.writeFileSync(secondFile, secondText, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);
  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          capabilities: {},
          workspaceFolders: [
            { uri: `file://${firstRoot}`, name: "first" },
            { uri: `file://${secondRoot}`, name: "second" },
          ],
        },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: `file://${secondFile}`,
            languageId: "xml",
            version: 1,
            text: secondText,
          },
        },
      }),
    );
    const initialDiagnostics = await nextMessage();
    assert.equal(initialDiagnostics.method, "textDocument/publishDiagnostics");
    assert.deepEqual((initialDiagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    fs.writeFileSync(
      secondConfig,
      JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "error" } } }),
      "utf8",
    );
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: `file://${secondConfig}`, type: 2 }] },
      }),
    );

    let refreshedDiagnostics: LspMessage | undefined;
    while (!refreshedDiagnostics) {
      const message = await nextMessage();
      if (message.method !== "textDocument/publishDiagnostics") continue;
      const payload = message.params as { uri?: string; diagnostics: Array<{ code?: string }> };
      if (payload.uri !== `file://${secondFile}`) continue;
      if (!payload.diagnostics.some((diagnostic) => diagnostic.code === "BT005_UNKNOWN_SUBTREE")) {
        continue;
      }
      refreshedDiagnostics = message;
    }

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP preserves node-definition-file models for completion and hover", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-node-def-"));
  const file = path.join(dir, "tree.xml");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      files: { include: ["tree.xml"] },
      models: { definitions: ["nodes.json"] },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "nodes.json"),
    JSON.stringify({
      nodes: {
        CustomAction: {
          kind: "Action",
          ports: { state: { direction: "input", type: "bool" } },
        },
      },
    }),
    "utf8",
  );
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main"><CustomAction state="true"/><</BehaviorTree>
</root>`;
  const hoverText = text.replace("/><</BehaviorTree>", "/></BehaviorTree>");
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);

  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          rootPath: dir,
          capabilities: {},
          initializationOptions: { btxml: { configPath: "btxml.config.json" } },
        },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    await nextMessage();

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/completion",
        params: {
          textDocument: { uri: `file://${file}` },
          position: positionAt(text, "</BehaviorTree>"),
        },
      }),
    );
    const completion = await nextMessage();
    assert.ok(
      (completion.result as Array<{ label: string }>).some((item) => item.label === "CustomAction"),
    );

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri: `file://${file}`, version: 2 },
          contentChanges: [{ text: hoverText }],
        },
      }),
    );
    await nextMessage();

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 3,
        method: "textDocument/hover",
        params: {
          textDocument: { uri: `file://${file}` },
          position: positionAt(hoverText, 'state="true"', 2),
        },
      }),
    );
    const hover = await nextMessage();
    const hoverResultText = JSON.stringify(hover.result);
    assert.match(hoverResultText, /state/);
    assert.match(hoverResultText, /bool/);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 4, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP applies configuration toggles", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-config-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree>
</root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);

  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          rootPath: dir,
          capabilities: {},
          initializationOptions: {
            btxml: {
              diagnostics: { enabled: false },
              format: { enabled: false },
              completion: { enabled: false },
            },
          },
        },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    const diagnostics = await nextMessage();
    assert.equal(diagnostics.method, "textDocument/publishDiagnostics");
    assert.deepEqual((diagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/completion",
        params: { textDocument: { uri: `file://${file}` }, position: { line: 2, character: 36 } },
      }),
    );
    const completion = await nextMessage();
    assert.deepEqual(completion.result, []);

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 3,
        method: "textDocument/formatting",
        params: {
          textDocument: { uri: `file://${file}` },
          options: { tabSize: 2, insertSpaces: true },
        },
      }),
    );
    const formatting = await nextMessage();
    assert.deepEqual(formatting.result, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 4, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP handles chunked headers and bodies", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-chunks-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);

  try {
    const init = encodeHeaderless({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { rootPath: dir, capabilities: {} },
    });
    proc.stdin.write(init.header.slice(0, 13));
    proc.stdin.write(init.header.slice(13));
    proc.stdin.write(init.body.slice(0, Math.floor(init.body.length / 2)));
    proc.stdin.write(init.body.slice(Math.floor(init.body.length / 2)));
    const response = await nextMessage();
    assert.equal(response.id, 1);

    const open = encodeHeaderless({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
    });
    const initialized = encodeHeaderless({ jsonrpc: "2.0", method: "initialized", params: {} });
    proc.stdin.write(initialized.header + initialized.body + open.header + open.body);
    const diagnostics = await nextMessage();
    assert.equal(diagnostics.method, "textDocument/publishDiagnostics");

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 2,
        method: "shutdown",
        params: {},
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP tolerates invalid JSON bodies", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-invalid-json-"));
  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    proc.once("exit", (code, signal) => resolve({ code, signal }));
  });

  try {
    proc.stdin.end("Content-Length: 12\r\n\r\n{invalid json");
    const result = await exited;
    assert.equal(result.signal, null);
    assert.notEqual(result.code, 0);
  } finally {
    proc.kill();
  }
});

test("LSP clears diagnostics on didClose", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-close-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");

  const proc = spawn(process.execPath, [cli, "language-server", "--stdio"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const nextMessage = createReader(proc);

  try {
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { rootPath: dir, capabilities: {} },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: `file://${file}`, languageId: "xml", version: 1, text } },
      }),
    );
    await nextMessage();

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didClose",
        params: { textDocument: { uri: `file://${file}` } },
      }),
    );
    const closed = await nextMessage();
    assert.equal(closed.method, "textDocument/publishDiagnostics");
    assert.deepEqual((closed.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});
