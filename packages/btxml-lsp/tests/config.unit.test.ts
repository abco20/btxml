import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handleGetChildCapability } from "../src/handlers.ts";

function encode(message: unknown) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

type LspMessage = {
  jsonrpc: string;
  id?: number;
  method?: string;
  result?: unknown;
  params?: unknown;
  error?: unknown;
};

const cli = path.resolve("packages/btxml/dist/cli.js");

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

test("LSP diagnostics use linter.rules from effective config", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-linter-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
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
    assert.deepEqual((diagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP diagnostics respect overrides", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-overrides-"));
  const srcFile = path.join(dir, "src", "tree.xml");
  const testFile = path.join(dir, "test", "tree.xml");
  fs.mkdirSync(path.dirname(srcFile), { recursive: true });
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  const srcText = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  const testText = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="test"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(srcFile, srcText, "utf8");
  fs.writeFileSync(testFile, testText, "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      linter: { rules: { "tree/no-unknown-subtree": "error" } },
      overrides: [
        { files: ["test/**/*.xml"], linter: { rules: { "tree/no-unknown-subtree": "off" } } },
      ],
    }),
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
        params: { rootPath: dir, capabilities: {} },
      }),
    );
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: { uri: `file://${srcFile}`, languageId: "xml", version: 1, text: srcText },
        },
      }),
    );
    const srcDiagnostics = await nextMessage();
    assert.equal(srcDiagnostics.method, "textDocument/publishDiagnostics");
    assert.ok(
      (srcDiagnostics.params as { diagnostics: Array<{ code: string }> }).diagnostics.some(
        (d) => d.code === "BT005_UNKNOWN_SUBTREE",
      ),
      "expected BT005_UNKNOWN_SUBTREE in src diagnostics",
    );

    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: `file://${testFile}`,
            languageId: "xml",
            version: 1,
            text: testText,
          },
        },
      }),
    );
    const testDiagnostics = await nextMessage();
    assert.equal(testDiagnostics.method, "textDocument/publishDiagnostics");
    assert.deepEqual((testDiagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP formatting uses formatter from effective config", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-format-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
<BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree>
</root>`;
  fs.writeFileSync(file, text, "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ formatter: { indentWidth: 4 } }),
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
        id: 2,
        method: "textDocument/formatting",
        params: {
          textDocument: { uri: `file://${file}` },
          options: { tabSize: 4, insertSpaces: true },
        },
      }),
    );
    const formatting = await nextMessage();
    assert.equal(formatting.id, 2);
    const edits = formatting.result as Array<{ newText: string }>;
    assert.ok(edits.some((e) => e.newText.includes("    <BehaviorTree")));

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP completion uses models.builtins from effective config", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-models-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main"><AlwaysSuccess/></BehaviorTree>
</root>`;
  fs.writeFileSync(file, text, "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({ models: { builtins: [] } }),
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
        id: 2,
        method: "textDocument/completion",
        params: { textDocument: { uri: `file://${file}` }, position: { line: 2, character: 28 } },
      }),
    );
    const completion = await nextMessage();
    assert.equal(completion.id, 2);
    const items = completion.result as Array<{ label: string }>;
    assert.ok(!items.some((item) => item.label === "AlwaysSuccess"));

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP initialize advertises quote completion triggers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-triggers-"));

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
    const initialize = await nextMessage();
    assert.equal(initialize.id, 1);
    const triggerCharacters = (
      initialize.result as {
        capabilities?: { completionProvider?: { triggerCharacters?: string[] } };
      }
    ).capabilities?.completionProvider?.triggerCharacters;
    assert.ok(triggerCharacters?.includes('"'));
    assert.ok(triggerCharacters?.includes("'"));

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP URI path matching equals CLI path matching", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-uri-match-"));
  const file = path.join(dir, "src", "tree.xml");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");
  fs.writeFileSync(
    path.join(dir, "btxml.config.json"),
    JSON.stringify({
      overrides: [
        { files: ["src/**/*.xml"], linter: { rules: { "tree/no-unknown-subtree": "off" } } },
      ],
    }),
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
    assert.deepEqual((diagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP watched config changes republish diagnostics for open documents", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-watch-refresh-"));
  const file = path.join(dir, "tree.xml");
  const configFile = path.join(dir, "btxml.config.json");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4"><BehaviorTree ID="main"><SubTree ID="missing"/></BehaviorTree></root>`;
  fs.writeFileSync(file, text, "utf8");
  fs.writeFileSync(
    configFile,
    JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "error" } } }),
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
    const initialDiagnostics = await nextMessage();
    assert.equal(initialDiagnostics.method, "textDocument/publishDiagnostics");
    assert.ok(
      (initialDiagnostics.params as { diagnostics: Array<{ code: string }> }).diagnostics.some(
        (d) => d.code === "BT005_UNKNOWN_SUBTREE",
      ),
    );

    fs.writeFileSync(
      configFile,
      JSON.stringify({ linter: { rules: { "tree/no-unknown-subtree": "off" } } }),
      "utf8",
    );
    proc.stdin.write(
      encode({
        jsonrpc: "2.0",
        method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: `file://${configFile}`, type: 2 }] },
      }),
    );
    let refreshedDiagnostics: LspMessage | undefined;
    while (!refreshedDiagnostics) {
      const message = await nextMessage();
      if (message.method !== "textDocument/publishDiagnostics") continue;
      const payload = message.params as { uri?: string; diagnostics: unknown[] };
      if (payload.uri !== `file://${file}`) continue;
      if (payload.diagnostics.length > 0) continue;
      refreshedDiagnostics = message;
    }
    assert.equal(refreshedDiagnostics.method, "textDocument/publishDiagnostics");
    assert.deepEqual((refreshedDiagnostics.params as { diagnostics: unknown[] }).diagnostics, []);

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP getNodeModelById resolves node kind for snippet clients", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-node-model-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main">
    <CustomGate/>
  </BehaviorTree>
  <TreeNodesModel>
    <Decorator ID="CustomGate"/>
  </TreeNodesModel>
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
        method: "btxml/getNodeModelById",
        params: { uri: `file://${file}`, modelId: "CustomGate" },
      }),
    );
    const lookup = await nextMessage();
    assert.equal(lookup.id, 2);
    const result = lookup.result as { model?: { id?: string; kind?: string } };
    assert.equal(result.model?.id, "CustomGate");
    assert.equal(result.model?.kind, "Decorator");

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});

test("LSP child capability handler delegates to workspace service", () => {
  const calls: Array<{
    uri: string;
    tagName: string;
    attributes?: Record<string, string | undefined>;
  }> = [];
  const result = {
    capable: true,
    reason: "model-kind",
    modelId: "CustomGate",
    kind: "Decorator",
  } as const;
  const workspace = {
    getChildCapability(
      uri: string,
      tagName: string,
      attributes?: Record<string, string | undefined>,
    ) {
      calls.push({ uri, tagName, attributes });
      return result;
    },
  };

  assert.deepEqual(
    handleGetChildCapability(workspace as never, {
      uri: "file:///tree.xml",
      tagName: "CustomGate",
      attributes: { ID: "CustomGate" },
    }),
    result,
  );
  assert.deepEqual(calls, [
    {
      uri: "file:///tree.xml",
      tagName: "CustomGate",
      attributes: { ID: "CustomGate" },
    },
  ]);
});

test("LSP getChildCapability resolves after URI normalization", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btxml-lsp-child-capability-"));
  const file = path.join(dir, "tree.xml");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="main">
    <CustomGate/>
  </BehaviorTree>
  <TreeNodesModel>
    <Decorator ID="CustomGate"/>
  </TreeNodesModel>
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
        method: "btxml/getChildCapability",
        params: { uri: `file://${file}`, tagName: "CustomGate" },
      }),
    );
    const lookup = await nextMessage();
    assert.equal(lookup.id, 2);
    assert.deepEqual(lookup.result, {
      capable: true,
      reason: "model-kind",
      modelId: "CustomGate",
      kind: "Decorator",
    });

    proc.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "shutdown", params: {} }));
    await nextMessage();
    proc.stdin.write(encode({ jsonrpc: "2.0", method: "exit", params: {} }));
  } finally {
    proc.kill();
  }
});
