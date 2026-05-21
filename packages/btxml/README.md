# btxml

BehaviorTree.CPP XML checker and formatter.

## Installation

Install globally for local CLI use:

```bash
npm install -g btxml
btxml check "behavior_trees/**/*.xml"
```

Use from CI without a global install:

```bash
npx btxml check "behavior_trees/**/*.xml"
```

Or install in a project:

```bash
npm install --save-dev btxml
```

## CLI Usage

Commands:

- `btxml format` rewrites XML into Groot-compatible layout.
- `btxml format --check` only reports whether formatting differs.
- `btxml lint` checks XML syntax and BT rules.
- `btxml lint --fix` applies safe, deterministic lint fixes.
- `btxml check` runs format check and lint together.
- `btxml repair` interactively resolves conflicting node model definitions.
- `btxml init` creates a starter `btxml.config.json`.
- `btxml explain <code>` shows documentation for a rule code.
- `btxml doctor` diagnoses workspace health.

By default, `btxml format` formats only BehaviorTree.CPP XML files. Generic XML files such as `package.xml` are skipped unless `--force` is specified.

Use `lint --fix` for safe automatic fixes:

```bash
btxml lint --fix
```

Use `repair` for node model conflicts that require a choice:

```bash
btxml repair
btxml repair --write
```

`btxml check` and `btxml lint` support `--output human` and `--output json`.

```bash
btxml check --output json
btxml lint --output json
```

## Configuration

Place `btxml.config.json` in the root of your project.

Minimal config:

```json
{
  "$schema": "./node_modules/btxml/schemas/btxml.config.schema.json"
}
```

Common project config:

```json
{
  "$schema": "./node_modules/btxml/schemas/btxml.config.schema.json",
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
import { checkBtWorkspace, formatBtXml, normalizeBtxmlConfig } from "btxml";
import { createBtEditorService, type BtEditorService } from "btxml/editor";
import { getNodeTypeFromElement, isGenericNodeTag } from "btxml/semantic";

const { config, ok, diagnostics } = normalizeBtxmlConfig({
  strict: true,
});

if (!ok) {
  throw new Error(diagnostics.map((diag) => diag.message).join("\n"));
}

const result = await checkBtWorkspace(
  [
    {
      uri: "file:///workspace/behavior_trees/main.xml",
      path: "behavior_trees/main.xml",
      kind: "bt-xml",
      text: `<?xml version="1.0"?>\n<root BTCPP_format="4"><BehaviorTree ID="Main"/></root>`,
    },
  ],
  { config },
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
