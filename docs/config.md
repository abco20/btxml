# Configuration

BTXML Checker is configured through a `btxml.config.json` file in your project root.

## Minimal config

```json
{
  "$schema": "https://unpkg.com/@abco20/btxml-checker/schemas/btxml.config.schema.json"
}
```

## Strict mode

Enable strict mode with `strict: true`.

```json
{
  "$schema": "https://unpkg.com/@abco20/btxml-checker/schemas/btxml.config.schema.json",
  "strict": true
}
```

Strict mode raises key diagnostics to stricter severities for CI-oriented workflows, while still allowing explicit per-rule overrides.

```json
{
  "$schema": "https://unpkg.com/@abco20/btxml-checker/schemas/btxml.config.schema.json",
  "strict": true,
  "linter": {
    "rules": {
      "model/no-unknown-node": "warn"
    }
  }
}
```

## Config discovery

BTXML Checker searches for `btxml.config.json` starting from the current working directory (or the directory of the file being edited in VS Code). You can override the path with the CLI `--config` flag.

## `$schema`

Pointing `$schema` to the published JSON schema gives you autocomplete and validation in editors that support JSON schemas.

## `files`

Controls which files are discovered and how they are treated.

```json
{
  "files": {
    "include": ["**/*.xml"],
    "ignore": ["build/**", "install/**", "log/**", "node_modules/**", ".git/**"],
    "useGitignore": true,
    "followSymlinks": false,
    "maxSize": 5242880
  }
}
```

## `resolver`

Controls how BTXML Checker resolves includes, entrypoints, and BehaviorTree IDs.

```json
{
  "resolver": {
    "entrypoints": [],
    "includes": {
      "elements": [
        { "name": "include", "attribute": "path", "base": "file" }
      ],
      "variables": {},
      "allowOutsideRoot": false,
      "maxDepth": 32,
      "maxFiles": 1000
    },
    "behaviorTreeIds": "workspace-unique"
  }
}
```

- Resolution mode is inferred automatically: if `entrypoints` is non-empty, BTXML uses entrypoint-based resolution; otherwise it uses workspace resolution.
- `entrypoints`: array of file paths (`string[]`).
- `behaviorTreeIds`: `workspace-unique` (default), `file-local-first`, or `allow-ambiguous`.
- `includes.allowOutsideRoot: false`: includes outside the workspace root report `include/no-outside-root`.
- `includes.allowOutsideRoot: true`: includes outside the workspace root are allowed and report `include/report-external-used` at `info` by default.
- Set `linter.rules["include/report-external-used"]` to `"off"` to suppress that informational diagnostic.

## `models`

Configures node models: built-ins, external model files, JSON definition files, and inline nodes.

```json
{
  "models": {
    "builtins": ["btcpp-v4"],
    "files": ["behavior_trees/models/**/*.xml"],
    "definitions": ["behavior_trees/nodes.json"],
    "convention": "allow-unused",
    "inline": {
      "SetFlag": {
        "kind": "Action",
        "ports": {
          "enabled": { "direction": "input", "type": "bool", "required": true }
        }
      }
    }
  }
}
```

- `builtins`: `["btcpp-v4"]` loads BT.CPP v4 built-ins. Use `[]` to disable.
- `files`: glob paths to `TreeNodesModel` XML files.
- `definitions`: paths to JSON node definition files.
- `inline`: node definitions written directly in the config.
- `convention`: model definition convention policy.

`models.convention` values:

| value | meaning |
| --- | --- |
| `allow-unused` | allow unused model definitions (default). |
| `used-only` | inline `Action` / `Condition` / `Decorator` / `Control` definitions must be used in the same XML file. |
| `single-source` | each user-defined `(ID, kind)` model definition should appear only once in the project. |

Notes:

- `SubTree` model definitions are excluded from `used-only` unused checks.
- Builtins are ignored for convention duplicate counting.
- `models.files` are treated as canonical model-definition sources by `lint --fix` and `repair --source model-files`.

## `linter`

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "model/no-unknown-port": "error"
    },
    "baseline": "btxml-baseline.json",
    "suppressions": {
      "inline": "allow"
    }
  }
}
```

Rules are keyed by **rule slug** (e.g. `model/no-unknown-port`). Severity can be `"off"`, `"info"`, `"warn"`, or `"error"`. Some rules accept options as a tuple:

```json
{
  "linter": {
    "rules": {
      "model/no-unknown-port": ["error", { "subTreePorts": "strict" }]
    }
  }
}
```

Use `linter.rules` to control suppression-related rule severities, for example:

```json
{
  "linter": {
    "rules": {
      "suppression/no-unused": "error",
      "suppression/require-reason": "warn"
    }
  }
}
```

## `formatter`

```json
{
  "formatter": {
    "indentWidth": 2,
    "xmlDeclaration": "always",
    "blankLineBetweenBehaviorTrees": true,
    "lineEnding": "lf"
  }
}
```

## `overrides`

Per-file overrides are applied after the base config. Only matching files receive the override values.

```json
{
  "overrides": [
    {
      "files": ["legacy/**/*.xml"],
      "linter": {
        "rules": {
          "model/no-unknown-node": "off"
        }
      }
    }
  ]
}
```

## CLI vs config separation

The following are **runtime CLI options** and do not belong in `btxml.config.json`:

- `--output`, `--reporter`, `--max-warnings`, `--update-baseline`
- `--show-skipped`, `--show-suppressed`
- `--fix`, `--check`, `--stdout`, `--diff`
- `--warnings-as-errors`, `--no-baseline`, `--baseline`
- `--force`, `--write`, `--config`, `--project-root`

Use them on the command line or in CI scripts.

## Common examples

### Entrypoint graph

```json
{
  "resolver": {
    "entrypoints": ["behavior_trees/main.xml"]
  }
}
```

### External model files

```json
{
  "models": {
    "files": ["behavior_trees/models/**/*.xml"]
  }
}
```

### Node definition files

```json
{
  "models": {
    "definitions": ["behavior_trees/nodes.json"]
  }
}
```

### Inline nodes

```json
{
  "models": {
    "inline": {
      "SetFlag": {
        "kind": "Action",
        "ports": {
          "enabled": { "direction": "input", "type": "bool", "required": true }
        }
      }
    }
  }
}
```

### Disable built-ins

```json
{
  "models": {
    "builtins": []
  }
}
```

### Override a rule severity

```json
{
  "linter": {
    "rules": {
      "model/no-unknown-port": "error"
    }
  }
}
```
