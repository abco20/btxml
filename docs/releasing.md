# Releasing

This repository uses a two-step release flow:

1. Run the `release` GitHub Actions workflow manually.
2. The workflow bumps versions, updates `pnpm-lock.yaml`, verifies the repo, commits `release: vX.Y.Z`, and pushes the matching `vX.Y.Z` tag.
3. The tag triggers the `publish-tag` workflow.
4. The publish workflow verifies the tag matches every managed package version, publishes `@abco20/btxml-checker` to npm, publishes `abco20.btxml-checker` to the Visual Studio Marketplace, and creates a GitHub release with the generated VSIX attached.

## Required secrets

- `NPM_TOKEN`: npm access token with publish rights for `@abco20/btxml-checker`
- `VSCE_PAT`: Visual Studio Marketplace personal access token for publisher `abco20`

## Manual version bump commands

```bash
pnpm release:version:bump -- patch
pnpm install --lockfile-only
pnpm release:verify
```

To verify a tag matches the repo before publishing:

```bash
pnpm release:version:verify-tag -- v0.1.0
```

## Notes

- Use `release_type` for normal `patch`, `minor`, or `major` releases.
- Use the optional `version` input only when you need an explicit version such as `1.0.0`.
- The tag workflow is publish-only. It will fail if any package version differs from the pushed tag.
