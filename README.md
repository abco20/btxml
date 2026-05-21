# btxml

`btxml` is a formatter, linter, and language tooling suite for BehaviorTree.CPP XML files.

It helps robotics and automation projects keep BehaviorTree XML readable, consistent, and semantically valid by checking tree IDs, subtree references, include graphs, node models, ports, blackboard usage, BT.CPP script attributes, and common XML structure issues.

## Features

- Format BehaviorTree.CPP / Groot XML files
- Lint BT XML files with configurable diagnostics
- Check formatting and lint results in one command
- Validate `BehaviorTree` IDs, `main_tree_to_execute`, `SubTree` references, and include graphs
- Validate node models, required ports, port names, port value types, child counts, and blackboard type consistency
- Analyze BT.CPP script attributes for syntax, unknown variables, assignment validity, expression types, and boolean-compatible results
- Generate a project configuration file
- Explain lint rules from the CLI
- Diagnose workspace health
- Provide VS Code integration through a language server, diagnostics, formatting, commands, and JSON schema validation

## Requirements

- Node.js 20 or later
- pnpm 10.11.0 or later

## Installation

This repository is currently organized as a pnpm monorepo.

```bash
git clone https://github.com/abco20/btxml.git
cd btxml
pnpm install
pnpm build
````

After building, the CLI entry point is provided by the `btxml` package.

For local development, you can run commands through pnpm:

```bash
pnpm --filter btxml exec btxml --help
```

If the package is published to npm, it can be used as:

```bash
pnpm add -D btxml
# or
npm install --save-dev btxml
```

## Quick start

Create a configuration file:

```bash
btxml init
```

Format XML files:

```bash
btxml format "behavior_trees/**/*.xml" --write
```

Check formatting without writing changes:

```bash
btxml format "behavior_trees/**/*.xml" --check
```

Lint XML files:

```bash
btxml lint "behavior_trees/**/*.xml"
```

Run format and lint checks together:

```bash
btxml check "behavior_trees/**/*.xml"
```

Generate machine-readable output:

```bash
btxml check "behavior_trees/**/*.xml" --output json
```

## CLI commands

### `btxml init`

Creates a `btxml.config.json` file in the current working directory.

```bash
btxml init
```

Use `--force` to overwrite an existing config file.

```bash
btxml init --force
```

### `btxml format [files..]`

Formats BT/XML files.

Common options:

```bash
btxml format "behavior_trees/**/*.xml" --write
btxml format "behavior_trees/**/*.xml" --check
btxml format tree.xml --stdout
btxml format "behavior_trees/**/*.xml" --diff
```

### `btxml lint [files..]`

Runs semantic and structural diagnostics.

```bash
btxml lint "behavior_trees/**/*.xml"
```

Useful options:

```bash
btxml lint "behavior_trees/**/*.xml" --fix
btxml lint "behavior_trees/**/*.xml" --output json
btxml lint "behavior_trees/**/*.xml" --warnings-as-errors
btxml lint "behavior_trees/**/*.xml" --max-warnings 0
```

### `btxml check [files..]`

Runs formatting and lint checks together.

```bash
btxml check "behavior_trees/**/*.xml"
```

Useful options:

```bash
btxml check "behavior_trees/**/*.xml" --diff
btxml check "behavior_trees/**/*.xml" --fix
btxml check "behavior_trees/**/*.xml" --format-only
btxml check "behavior_trees/**/*.xml" --lint-only
btxml check "behavior_trees/**/*.xml" --output json
```

### `btxml explain [rule]`

Shows documentation for a diagnostic rule.

```bash
btxml explain model/no-unknown-port
btxml explain tree/no-unknown-subtree
```

### `btxml doctor [files..]`

Reports workspace health, including selected files, ignored files, configured external models, node definitions, include graph status, and missing includes.

```bash
btxml doctor
btxml doctor --output json
```

### `btxml repair [files..]`

Inspects and repairs supported model conflicts interactively.

```bash
btxml repair
btxml repair --json
btxml repair --write
```

## Configuration

Initialize a project config with:

```bash
btxml init
```

This creates:

```json
{
  "$schema": "./node_modules/btxml/schemas/btxml.config.schema.json"
}
```

Use `btxml.config.json` to customize file selection, formatter behavior, model resolution, include handling, lint rules, suppressions, and per-file overrides.

Example:

```json
{
  "$schema": "./node_modules/btxml/schemas/btxml.config.schema.json",
  "files": {
    "include": ["behavior_trees/**/*.xml"],
    "ignore": ["**/build/**", "**/dist/**"]
  },
  "linter": {
    "rules": {
      "xml/require-btcpp-format": "warn",
      "tree/no-duplicate-id": "error",
      "tree/no-unknown-subtree": "error",
      "model/no-unknown-node": "warn",
      "model/no-unknown-port": ["warn", { "subTreePorts": "loose" }],
      "model/no-blackboard-type-mismatch": [
        "error",
        { "allowStringEntryCompatibility": true }
      ]
    }
  }
}
```

## Rule categories

`btxml` includes rules for:

* `xml/*` — root structure, BT.CPP format declaration, top-level elements
* `tree/*` — behavior tree IDs, duplicate IDs, subtree resolution, main tree references
* `include/*` — include paths, missing files, cycles, workspace boundaries, ROS package references
* `model/*` — node models, ports, child counts, port values, blackboard type consistency
* `script/*` — BT.CPP script syntax, variables, assignments, expressions, result types
* `suppression/*` — unused suppressions and suppression reasons

Use `btxml explain <rule>` to inspect a rule from the command line.

## VS Code extension

The repository includes a VS Code extension package, `vscode-btxml`.

It provides:

* BTXML language support for `.bt.xml` and `.tree.xml`
* Diagnostics
* Formatting
* Completion support
* Language server restart command
* Workspace check command
* Project summary command
* Config open/create commands
* JSON schema validation for `btxml.config.json` and `btxml.nodes.json`

Build the VS Code package:

```bash
pnpm package:vsix
```

Then install the generated VSIX in VS Code.

## Development

Install dependencies:

```bash
pnpm install
```

Build all packages:

```bash
pnpm build
```

## Repository layout

```text
packages/
  analyzer/          Diagnostic rules and semantic validation
  config/            Configuration schema, parsing, normalization, and defaults
  core/              Public core API
  foundation/        Shared diagnostic and text-edit primitives
  language-service/  Language service implementation
  model/             BehaviorTree node model support
  project/           Project loading, file selection, includes, and workspace checks
  semantic/          Semantic index and BT document view
  syntax/            XML parsing and formatting
  btxml/             CLI and public package entry points
  vscode-btxml/      VS Code extension
scripts/             Build, release, schema, catalog, and package scripts
tests/               Unit, integration, and smoke tests
```

## License

MIT
