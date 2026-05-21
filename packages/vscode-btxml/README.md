# BTXML Checker

VS Code support for BehaviorTree.CPP XML projects.

## Features

- Diagnostics through the bundled `btxml` language server
- Formatting for `.bt.xml` and `.tree.xml`
- Completion, hover, go-to-definition, references, document symbols, and code actions
- Commands to restart the language server, inspect the workspace, open the config, and create a starter config
- JSON schema validation for `btxml.config.json` and `btxml.nodes.json`

## Commands

- `BTXML Checker: Restart Language Server`
- `BTXML Checker: Show Output`
- `BTXML Checker: Format Groot XML`
- `BTXML Checker: Check Workspace`
- `BTXML Checker: Show Project Summary`
- `BTXML Checker: Open Config`
- `BTXML Checker: Create Config`

## Configuration

The extension reads the same effective project configuration as the CLI, so diagnostics and formatting stay consistent between the editor and command line tools.

## Release

The marketplace extension ID is `abco20.btxml-checker`.
