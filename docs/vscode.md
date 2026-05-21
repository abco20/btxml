# VS Code Support

The VS Code extension provides formatting, diagnostics, completion, hover, go-to-definition, references, document symbols, and code actions for BT XML files.

## Activation behavior

- `btcpp-xml` documents are always handled.
- Ordinary `xml` documents should only be enhanced when the file is recognized as BT XML.
- Generic XML files must not receive BT-specific noise.

## Commands

- BTXML: Restart Language Server
- BTXML: Show Output
- BTXML: Format Groot XML
- BTXML: Check Workspace
- BTXML: Show Project Summary
- BTXML: Open Config
- BTXML: Create Config

## Model conflicts

When the editor reports `BT012_CONFLICTING_NODE_MODEL` or `BT107_CONFLICTING_PORT_DEFAULT`, use the CLI `repair` command to inspect and resolve the conflict interactively:

```sh
btxml repair
btxml repair --write
```

The VS Code extension does not provide an interactive resolver for model conflicts in v1.

## Configuration

The VS Code extension resolves configuration using the same effective config API as the CLI, so diagnostics and formatting behavior are consistent across the editor and the command line.

## Distribution

For v0.1, the VS Code extension is distributed as a VSIX.

```bash
pnpm package:vsix
code --install-extension packages/vscode-btxml/btxml-0.1.0.vsix
```

Marketplace publication is out of scope for v0.1.
The VS Code publisher identifier used for the private VSIX is `btxml`.
