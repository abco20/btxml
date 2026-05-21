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

The VS Code extension is published as `abco20.btxml-checker` on the Visual Studio Marketplace and can also be packaged locally as a VSIX.

```bash
pnpm package:vsix
code --install-extension packages/vscode-btxml/btxml-checker-<version>.vsix
```

Release automation is handled by GitHub Actions:

- Run the `release` workflow to bump versions, refresh `pnpm-lock.yaml`, verify the workspace, and create a `vX.Y.Z` tag.
- Pushing the release tag triggers the `publish-tag` workflow, which publishes npm and Marketplace artifacts and creates a GitHub release with the packaged VSIX attached.
