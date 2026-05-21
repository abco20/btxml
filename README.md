# btxml-checker

`btxml-checker` is a formatter, linter, and language tooling suite for BehaviorTree.CPP XML files. Its CLI command is `btxmlc`.

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
git clone https://github.com/abco20/btxml-checker.git
cd btxml-checker
pnpm install
pnpm build
```

After building, the CLI entry point is provided by the `@abco20/btxml-checker` package.

For local development, you can run commands through pnpm:

```bash
pnpm --filter ./packages/btxml exec btxmlc --help
```

Install it in a project with:

```bash
npm install --save-dev @abco20/btxml-checker
```

For one-off usage without installing first:

```bash
npx @abco20/btxml-checker check "behavior_trees/**/*.xml"
```

After installing in a project:

```bash
npx btxmlc check "behavior_trees/**/*.xml"
```

## Quick start

Create a configuration file:

```bash
npx btxmlc init
```

Format XML files:

```bash
npx btxmlc format "behavior_trees/**/*.xml" --write
```

Check formatting without writing changes:

```bash
npx btxmlc format "behavior_trees/**/*.xml" --check
```

Lint XML files:

```bash
npx btxmlc lint "behavior_trees/**/*.xml"
```

Run format and lint checks together:

```bash
npx btxmlc check "behavior_trees/**/*.xml"
```

Generate machine-readable output:

```bash
npx btxmlc check "behavior_trees/**/*.xml" --output json
```

## CLI commands

### `btxmlc init`

Creates a `btxml.config.json` file in the current working directory.

```bash
npx btxmlc init
```

Use `--force` to overwrite an existing config file.

```bash
npx btxmlc init --force
```

### `btxmlc format [files..]`

Formats BT/XML files.

Common options:

```bash
npx btxmlc format "behavior_trees/**/*.xml" --write
npx btxmlc format "behavior_trees/**/*.xml" --check
npx btxmlc format tree.xml --stdout
npx btxmlc format "behavior_trees/**/*.xml" --diff
```

### `btxmlc lint [files..]`

Runs semantic and structural diagnostics.

```bash
npx btxmlc lint "behavior_trees/**/*.xml"
```

Useful options:

```bash
npx btxmlc lint "behavior_trees/**/*.xml" --fix
npx btxmlc lint "behavior_trees/**/*.xml" --output json
npx btxmlc lint "behavior_trees/**/*.xml" --warnings-as-errors
npx btxmlc lint "behavior_trees/**/*.xml" --max-warnings 0
```

### `btxmlc check [files..]`

Runs formatting and lint checks together.

```bash
npx btxmlc check "behavior_trees/**/*.xml"
```

Useful options:

```bash
npx btxmlc check "behavior_trees/**/*.xml" --diff
npx btxmlc check "behavior_trees/**/*.xml" --fix
npx btxmlc check "behavior_trees/**/*.xml" --format-only
npx btxmlc check "behavior_trees/**/*.xml" --lint-only
npx btxmlc check "behavior_trees/**/*.xml" --output json
```

### `btxmlc explain [rule]`

Shows documentation for a diagnostic rule.

```bash
npx btxmlc explain model/no-unknown-port
npx btxmlc explain tree/no-unknown-subtree
```

### `btxmlc doctor [files..]`

Reports workspace health, including selected files, ignored files, configured external models, node definitions, include graph status, and missing includes.

```bash
npx btxmlc doctor
npx btxmlc doctor --output json
```

### `btxmlc repair [files..]`

Inspects and repairs supported model conflicts interactively.

```bash
npx btxmlc repair
npx btxmlc repair --json
npx btxmlc repair --write
```

## Configuration

Initialize a project config with:

```bash
npx btxmlc init
```

This creates:

```json
{
  "$schema": "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json"
}
```

Use `btxml.config.json` to customize file selection, formatter behavior, model resolution, include handling, lint rules, suppressions, and per-file overrides.

Example:

```json
{
  "$schema": "./node_modules/@abco20/btxml-checker/schemas/btxml.config.schema.json",
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

`btxml-checker` includes rules for:

* `xml/*` — root structure, BT.CPP format declaration, top-level elements
* `tree/*` — behavior tree IDs, duplicate IDs, subtree resolution, main tree references
* `include/*` — include paths, missing files, cycles, workspace boundaries, ROS package references
* `model/*` — node models, ports, child counts, port values, blackboard type consistency
* `script/*` — BT.CPP script syntax, variables, assignments, expressions, result types
* `suppression/*` — unused suppressions and suppression reasons

Use `btxmlc explain <rule>` to inspect a rule from the command line.

## VS Code extension

The repository includes a VS Code extension package, `vscode-btxml-checker`.

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
