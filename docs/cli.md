# CLI

BTXML Checker provides a command-line interface for checking, formatting, and repairing BehaviorTree.CPP XML files. The CLI command is `btxmlc`.

## Commands

- `btxmlc check [files...]` — runs format check and lint together.
- `btxmlc lint [files...]` — checks XML syntax and BT rules.
- `btxmlc format [files...]` — rewrites XML into Groot-compatible layout.
- `btxmlc repair` — interactively resolves conflicting node model definitions.
- `btxmlc init` — creates a starter `btxml.config.json`.
- `btxmlc explain <code>` — shows documentation for a diagnostic code.
- `btxmlc doctor` — diagnoses workspace health.

## Runtime options

These options control the CLI at runtime and do **not** belong in `btxml.config.json`.

### Output and reporting

- `--output <human|json>` — choose output format.
- `--reporter <reporter>` — select a reporter.
- `--max-warnings <n>` — fail if warnings exceed the threshold.
- `--show-skipped` — include skipped files in output.
- `--show-suppressed` — include suppressed diagnostics in output.

### Baseline

- `--baseline <file>` — path to a baseline file.
- `--update-baseline <file>` — update the baseline file with current diagnostics.
- `--no-baseline` — ignore the baseline.

### Fix and write

- `--fix` — apply safe, deterministic lint fixes (lint only).
- `--write` — write repaired models interactively (repair only).
- `--force` — overwrite existing files (init/repair).

### Format-specific

- `--check` — report whether formatting differs without writing (format only).
- `--stdout` — print formatted XML to stdout (format only, single file).
- `--diff` — show formatting diff (format only).

### Other

- `--config <path>` — path to a custom `btxml.config.json`.
- `--project-root <path>` — override the project root directory.
- `--no-config` — run without a config file.
- `--warnings-as-errors` — treat all warnings as errors.
- `--quiet` — suppress non-error output.
- `--verbose` — show more detail.
- `--no-color` — disable colored output.
- `--json` — shorthand for `--output json`.
- `--workspace` — run in workspace mode.
- `--format-only` — run only the formatter (check).
- `--lint-only` — run only the linter (check).
- `--help`, `-h` — show help.
- `--version`, `-v` — show version.

## Examples

```bash
# Check all BT XML files
btxmlc check "behavior_trees/**/*.xml"

# Lint with JSON output and fail on any warning
btxmlc lint --output json --max-warnings 0

# Update baseline
btxmlc check --update-baseline btxml-baseline.json

# Format a single file to stdout
btxmlc format --stdout behavior_trees/main.xml
```
