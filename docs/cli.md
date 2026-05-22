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
- `--source model-files` — treat `models.files` as canonical source when repairing model definitions (repair only).
- `--mode <auto|sync|dedupe>` — canonical repair strategy when `--source model-files` is used (repair only).

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

# Lint and apply safe fixes
btxmlc lint --fix "behavior_trees/**/*.xml"

# Repair using canonical model files
btxmlc repair --source model-files --mode auto
```

## `lint --fix` safe fixes

`btxmlc lint --fix` applies only deterministic safe fixes:

- `BT002_MISSING_BTCPP_FORMAT`: inserts `BTCPP_format="4"` on `<root>`.
- `BT121_UNUSED_MODEL_DEFINITION`: removes unused inline model definitions for `used-only` convention.
- `BT122_DUPLICATE_MODEL_DEFINITION`: removes non-canonical duplicates when exactly one canonical model-file definition exists.

No automatic fix is applied for `BT120_CONFLICTING_MODEL_KIND`.

## `repair --source model-files`

When `--source model-files` is enabled, definitions loaded via `models.files` are treated as canonical.

- `--mode sync`: rewrite non-canonical definitions to match canonical model-file definition text.
- `--mode dedupe`: keep canonical model-file definition and delete non-canonical duplicates.
- `--mode auto`: choose `dedupe` when `models.convention` is `single-source`, otherwise choose `sync`.
