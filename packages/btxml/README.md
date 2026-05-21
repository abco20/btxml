# btxml-checker

BehaviorTree.CPP XML checker and formatter.

## Installation

Install in a project:

```bash
npm install --save-dev @abco20/btxml-checker
npx btxmlc check "behavior_trees/**/*.xml"
```

Use once without installing first:

```bash
npx @abco20/btxml-checker check "behavior_trees/**/*.xml"
```

## CLI Usage

Commands:

- `btxmlc format` rewrites XML into Groot-compatible layout.
- `btxmlc format --check` only reports whether formatting differs.
- `btxmlc lint` checks XML syntax and BT rules.
- `btxmlc lint --fix` applies safe, deterministic lint fixes.
- `btxmlc check` runs format check and lint together.
- `btxmlc repair` interactively resolves conflicting node model definitions.
- `btxmlc init` creates a starter `btxml.config.json`.
- `btxmlc explain <code>` shows documentation for a rule code.
- `btxmlc doctor` diagnoses workspace health.

By default, `btxmlc format` formats only BehaviorTree.CPP XML files. Generic XML files such as `package.xml` are skipped unless `--force` is specified.

Use `lint --fix` for safe automatic fixes:

```bash
npx btxmlc lint --fix
```

Use `repair` for node model conflicts that require a choice:

```bash
npx btxmlc repair
npx btxmlc repair --write
```

`btxmlc check` and `btxmlc lint` support `--output human` and `--output json`.

```bash
npx btxmlc check --output json
npx btxmlc lint --output json
```

## Configuration

Place `btxml.config.json` in the root of your project.

Minimal config:

```json
{
  "$schema": "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json"
}
```

Common project config:

```json
{
  "$schema": "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json",
  "files": {
    "include": ["behavior_trees/**/*.xml"]
  },
  "resolver": {
    "entrypoints": ["behavior_trees/main.xml"]
  },
  "models": {
    "files": ["behavior_trees/models/**/*.xml"],
    "definitions": ["behavior_trees/nodes.json"]
  },
  "linter": {
    "rules": {
      "model/no-unknown-port": "error"
    }
  },
  "formatter": {
    "indentWidth": 2,
    "xmlDeclaration": "always",
    "blankLineBetweenBehaviorTrees": true,
    "lineEnding": "lf"
  }
}
```

Disable bundled BT.CPP built-in node models if your project provides its own definitions:

```json
{
  "models": {
    "builtins": []
  }
}
```

## TypeScript API

Use the public package exports only:

```ts
import { checkBtWorkspace, formatBtXml, normalizeBtxmlConfig } from "@abco20/btxml-checker";
import { createBtEditorService, type BtEditorService } from "@abco20/btxml-checker/editor";
import { getNodeTypeFromElement, isGenericNodeTag } from "@abco20/btxml-checker/semantic";

const { config, ok, diagnostics } = normalizeBtxmlConfig({
  strict: true,
});

if (!ok) {
  throw new Error(diagnostics.map((diag) => diag.message).join("\n"));
}

const result = await checkBtWorkspace(
  {
    inputs: [
      {
        uri: "file:///workspace/behavior_trees/main.xml",
        path: "behavior_trees/main.xml",
        kind: "bt-xml",
        text: `<?xml version="1.0"?>\n<root BTCPP_format="4"><BehaviorTree ID="Main"/></root>`,
      },
    ],
    config,
  },
);

console.log(result.ok, result.summary.errors);

const service: BtEditorService = createBtEditorService();
service.openDocument("memory:///tree.xml", `<root BTCPP_format="4"><BehaviorTree ID="Main"/></root>`);

const semantic = service.getSemanticDocumentView("memory:///tree.xml");
const firstNode = semantic.view?.nodes[0];
if (firstNode) {
  console.log(getNodeTypeFromElement(firstNode.usage.element));
  console.log(isGenericNodeTag(firstNode.tagName));
}

console.log(formatBtXml(`<root BTCPP_format="4"><BehaviorTree ID="Main"/></root>`));
```

Avoid importing internal modules or internal-only types such as parser internals, semantic indexes, or project index structures.

## Limitations

CDATA, DOCTYPE, non-declaration processing instructions, and unknown XML entities are unsupported in v0.1.

See the repository README and docs for the full configuration and rule reference.
