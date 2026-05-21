# VS Code Support

The VS Code extension provides formatting, diagnostics, completion, hover, go-to-definition, references, document symbols, and code actions for BT XML files.

## Activation behavior

- `btcpp-xml` documents are always handled.
- Ordinary `xml` documents should only be enhanced when the file is recognized as BT XML.
- Generic XML files must not receive BT-specific noise.

## Commands

- BTXML Checker: Restart Language Server
- BTXML Checker: Show Output
- BTXML Checker: Format Groot XML
- BTXML Checker: Check Workspace
- BTXML Checker: Show Project Summary
- BTXML Checker: Open Config
- BTXML Checker: Create Config

## Model conflicts

When the editor reports `BT012_CONFLICTING_NODE_MODEL` or `BT107_CONFLICTING_PORT_DEFAULT`, use the CLI `repair` command to inspect and resolve the conflict interactively:

```sh
btxmlc repair
btxmlc repair --write
```

The VS Code extension does not provide an interactive resolver for model conflicts in v1.

## Configuration

The VS Code extension resolves configuration using the same effective config API as the CLI, so diagnostics and formatting behavior are consistent across the editor and the command line.

## Distribution

For v0.1, the VS Code extension is distributed as a VSIX.

```bash
pnpm package:vsix
code --install-extension packages/vscode-btxml/btxml-checker-0.1.0.vsix
```

Marketplace publication is out of scope for v0.1.
The VS Code publisher identifier used for the private VSIX is `btxml-checker`.
