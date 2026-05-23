````markdown
# btxml-checker: `lint --fix` の現代的 fix engine 化 + `--unsafe` 導入計画

## 背景

現在の `lint --fix` は、`checkProject()` 後に diagnostics から `WorkspaceEdit` を生成し、`applyTextEdits()` で対象ファイルへ直接適用している。

現状の問題:

- fix が diagnostic 単位ではなく edit 単位で数えられている。
- overlap / invalid range / stale document の検出がない。
- fix は 1 pass のみ。
- fix 後の parse validation / rollback がない。
- `BT123_MISSING_LOCAL_MODEL_DEFINITION` が docs に載っていないのに自動適用され得る。
- `BT121_UNUSED_MODEL_DEFINITION` のような削除系 fix が default `--fix` で動くのは危険。
- `BT123` の挿入結果は formatter を通らないため、XML layout 品質が保証されない。
- baseline / suppressed diagnostic との関係が曖昧。
- JSON / human output に fix summary が十分出ない。

目的は、`lint --fix` を ESLint 的な「安全で予測可能な autofix」に近づけること。

---

## 最終仕様

### Safe fix のみ適用

```bash
btxmlc lint --fix
````

### Unsafe fix も含めて適用

```bash
btxmlc lint --fix --unsafe
```

### 書き込まずに unsafe fix まで確認

```bash
btxmlc lint --fix-dry-run --unsafe --output json
```

### 不正な使い方

```bash
btxmlc lint --unsafe
```

これは usage error にする。

```text
--unsafe can only be used with --fix or --fix-dry-run
```

`--unsafe` は `--fix` / `--fix-dry-run` の modifier であり、単独では意味を持たない。

---

## Fix 分類

| Diagnostic                             | default `--fix` | `--fix --unsafe` | safety   |
| -------------------------------------- | --------------: | ---------------: | -------- |
| `BT002_MISSING_BTCPP_FORMAT`           |           apply |            apply | `safe`   |
| `BT122_DUPLICATE_MODEL_DEFINITION`     |   apply if safe |            apply | `safe`   |
| `BT121_UNUSED_MODEL_DEFINITION`        |            skip |            apply | `unsafe` |
| `BT123_MISSING_LOCAL_MODEL_DEFINITION` |            skip |            apply | `unsafe` |

### 判断理由

* `BT002`: `<root>` に `BTCPP_format="4"` を追加するだけなので safe。
* `BT122`: canonical model-file definition が明確で、削除対象が安全に消せる場合は safe。
* `BT121`: 未使用 definition の削除。将来用・意図的定義・コメント巻き込みのリスクがあるため unsafe。
* `BT123`: local model definition を追加する semantic change。model の source-of-truth をローカル XML に複製するため unsafe。

---

## 新規 module 構成

追加する。

```text
packages/btxml/src/fix/types.ts
packages/btxml/src/fix/candidates.ts
packages/btxml/src/fix/plan.ts
packages/btxml/src/fix/apply.ts
packages/btxml/src/fix/engine.ts
packages/btxml/src/fix/report.ts
```

既存の `packages/btxml/src/repair/lint-fixes.ts` はすぐには削除しない。

```text
packages/btxml/src/repair/lint-fixes.ts
  - getSafeLintFixes()      # 互換 wrapper として一時維持
  - getLintFixCandidates()  # 新規 candidate generator へ移行
```

---

## 型定義

`packages/btxml/src/fix/types.ts`

```ts
import type { TextEdit } from "@btxml/foundation";

export type FixSafety = "safe" | "unsafe";

export type FixCandidate = {
  id: string;
  uri: string;

  diagnosticCode: string;
  diagnosticRule?: string;
  diagnosticSeverity: "error" | "warning" | "info";
  diagnosticMessage: string;

  safety: FixSafety;
  title: string;
  description?: string;

  edits: TextEdit[];

  source: {
    kind: "diagnostic";
    diagnosticFingerprint: string;
  };

  metadata?: Record<string, unknown>;
};

export type SkippedFixReason =
  | "unsafe-not-enabled"
  | "invalid-range"
  | "overlap"
  | "stale-document"
  | "parse-failed"
  | "formatter-failed"
  | "empty-edit"
  | "baseline-filtered"
  | "suppressed";

export type SkippedFix = {
  candidate: FixCandidate;
  reason: SkippedFixReason;
  conflictsWith?: string[];
  detail?: string;
};

export type FixPlan = {
  pass: number;
  applied: FixCandidate[];
  skipped: SkippedFix[];
  editsByUri: Map<string, TextEdit[]>;
  touchedUris: Set<string>;
};

export type FixRunSummary = {
  enabled: boolean;
  unsafe: boolean;
  dryRun: boolean;
  maxPasses: number;
  passes: number;
  circularFixesDetected: boolean;

  appliedDiagnostics: number;
  appliedEdits: number;
  changedFiles: number;

  unsafeAppliedDiagnostics: number;
  unsafeSkippedDiagnostics: number;

  skipped: Array<{
    code: string;
    uri: string;
    reason: SkippedFixReason;
    title: string;
  }>;
};
```

---

## CLI option 追加

### `packages/btxml/src/commands/lint.ts`

`lintCommand.builder` に追加。

```ts
.option("fix-dry-run", { type: "boolean" })
.option("unsafe", { type: "boolean" })
.option("fix-max-passes", { type: "number" })
.option("fix-no-format", { type: "boolean" })
```

### `packages/btxml/src/options/lint.ts`

schema に追加。

```ts
fixDryRun: z.boolean().optional(),
unsafe: z.boolean().optional(),
fixMaxPasses: z.number().int().min(1).max(20).optional(),
fixNoFormat: z.boolean().optional(),
```

validation を追加。

```ts
.superRefine((options, ctx) => {
  if (options.unsafe && !options.fix && !options.fixDryRun) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unsafe"],
      message: "`--unsafe` can only be used with `--fix` or `--fix-dry-run`",
    });
  }
})
```

内部扱い:

```ts
const fixEnabled = options.fix || options.fixDryRun;
const dryRun = options.fixDryRun === true;
const unsafe = options.unsafe === true;
const maxPasses = options.fixMaxPasses ?? 10;
const formatAfterFix = options.fixNoFormat !== true;
```

---

## Candidate generator

### 新規 API

```ts
export function getLintFixCandidates(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): FixCandidate[] {
  return [
    ...getBtcppFormatFixCandidates(input),
    ...getUnusedModelDefinitionFixCandidates(input),
    ...getDuplicateModelDefinitionFixCandidates(input),
    ...getMissingLocalModelDefinitionFixCandidates(input),
  ];
}
```

### 既存 wrapper

```ts
export function getSafeLintFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const candidates = getLintFixCandidates(input).filter(
    (candidate) => candidate.safety === "safe",
  );

  return mergeFixCandidatesToWorkspaceEdits(candidates);
}
```

ただし、新しい `runLint()` は `getSafeLintFixes()` を使わない。

---

## Candidate 分類

### `BT002_MISSING_BTCPP_FORMAT`

```ts
safety: "safe"
title: "Insert BTCPP_format=\"4\""
```

### `BT122_DUPLICATE_MODEL_DEFINITION`

```ts
safety: "safe"
title: "Remove non-canonical duplicate model definitions"
```

ただし、safe と見なす条件:

* canonical model-file definition がちょうど 1 つ。
* 削除対象がすべて editable。
* 削除対象 range が有効。
* できれば semantic equivalence も確認する。

  * kind 一致
  * port set 一致
  * port direction / name / type / default / enum / description 一致

semantic equivalence が未実装なら、既存条件ベースで safe とし、将来強化する。

### `BT121_UNUSED_MODEL_DEFINITION`

```ts
safety: "unsafe"
title: "Remove unused inline model definition"
```

### `BT123_MISSING_LOCAL_MODEL_DEFINITION`

```ts
safety: "unsafe"
title: "Add missing local model definition"
```

---

## Planner

`packages/btxml/src/fix/plan.ts`

```ts
export function planFixes(input: {
  pass: number;
  candidates: FixCandidate[];
  textByUri: Map<string, string>;
  unsafe: boolean;
}): FixPlan;
```

処理順:

1. `edits.length === 0` は skip `empty-edit`
2. `candidate.safety === "unsafe" && !unsafe` は skip `unsafe-not-enabled`
3. range validation
4. candidate priority で deterministic sort
5. overlap detection
6. URI ごとに edits を group
7. `FixPlan` を返す

### Range validation

```ts
function validateTextEdit(text: string, edit: TextEdit): boolean {
  const start = edit.range.start.offset;
  const end = edit.range.end.offset;

  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end >= start &&
    end <= text.length
  );
}
```

invalid edit を含む candidate は全体 skip。部分適用しない。

### Overlap detection

```ts
function overlaps(left: TextEdit, right: TextEdit): boolean {
  return (
    left.range.start.offset < right.range.end.offset &&
    right.range.start.offset < left.range.end.offset
  );
}
```

同一 offset への insert 同士も conflict 扱いにする。順序で意味が変わるため。

### Candidate priority

deterministic にする。

優先順:

1. `safe` > `unsafe`
2. severity: `error` > `warning` > `info`
3. edit range が小さいもの
4. `uri` lexical
5. first edit start offset asc
6. `diagnosticCode` lexical
7. `id` lexical

---

## Apply engine

`packages/btxml/src/fix/apply.ts`

```ts
export async function applyFixPlan(input: {
  plan: FixPlan;
  readText: (uri: string) => string;
  writeText: (uri: string, text: string) => void;
  dryRun: boolean;
}): Promise<{
  originalTextByUri: Map<string, string>;
  fixedTextByUri: Map<string, string>;
}>;
```

要件:

* URI ごとに 1 回だけ read/write。
* edits は offset 降順で適用。
* dry-run では write しない。
* fixed text は返す。

---

## Parse validation / rollback

fix 適用後、touched file を parse する。

```ts
for (const [uri, fixedText] of fixedTextByUri) {
  const parsed = parseBtXml(fixedText, { uri });
  if (parsed.diagnostics.some((d) => d.severity === DiagnosticSeverity.Error)) {
    rollback();
    markParseFailed();
  }
}
```

要件:

* parse error が出た pass は rollback。
* rollback は pass で触った全ファイルに対して行う。
* dry-run では当然 write しないが、parse failure は summary に出す。
* parse failure が発生した candidate は skip `parse-failed` として扱う。

---

## Format-after-fix

default では touched file だけ formatter を通す。

```bash
btxmlc lint --fix
```

は fix 後に canonical layout へ寄せる。

```bash
btxmlc lint --fix --fix-no-format
```

は raw fix output のまま。

理由:

* `BT123` は `<TreeNodesModel>` block を文字列で追加する。
* formatter を通さないと改行・indent 品質が保証できない。
* exact snapshot test で formatter 後の XML を固定する。

formatter failure 時:

* parse valid なら fix 自体は維持。
* summary に `formatter-failed` を出す。
* ただし初期実装では formatter failure を rollback まではしなくてよい。

---

## Multipass

`packages/btxml/src/fix/engine.ts`

```ts
export async function runLintFixEngine(input: {
  project: BtxmlProject;
  host: ProjectHost;
  options: {
    unsafe: boolean;
    dryRun: boolean;
    maxPasses: number;
    formatAfterFix: boolean;
    baseline?: DiagnosticBaseline;
    maxWarnings?: number;
    showSuppressed?: boolean;
    projectDiagnostics?: Diagnostic[];
  };
}): Promise<{
  result: CheckProjectResult;
  documents: BtDocument[];
  externalModelDocuments: BtDocument[];
  externalDiagnostics: Diagnostic[];
  summary: FixRunSummary;
}>;
```

loop:

```ts
const maxPasses = options.maxPasses ?? 10;
const seenHashes = new Set<string>();

for (let pass = 1; pass <= maxPasses; pass++) {
  const result = await checkProject(...);

  const diagnostics = collectFixDiagnostics(result);
  const candidates = getLintFixCandidates({ documents, diagnostics });

  const plan = planFixes({
    pass,
    candidates,
    textByUri,
    unsafe: options.unsafe,
  });

  if (plan.applied.length === 0) {
    return final;
  }

  await applyFixPlan(...);
  await parseValidateAndMaybeRollback(...);
  await maybeFormatTouchedFiles(...);
  await reloadDocuments(...);

  const hash = hashTouchedProjectState(...);
  if (seenHashes.has(hash)) {
    summary.circularFixesDetected = true;
    break;
  }
  seenHashes.add(hash);
}
```

要件:

* default max pass は 10。
* `--fix-max-passes` で変更可能。
* circular fix を検出したら停止。
* max pass 到達時は warning / summary に出す。

---

## `runLint()` の変更

`packages/btxml/src/commands/lint.ts`

現在の `if (options.fix) { ... }` direct apply block を置き換える。

概略:

```ts
let fixSummary: FixRunSummary | undefined;

if (options.fix || options.fixDryRun) {
  const fixRun = await runLintFixEngine({
    project,
    host,
    options: {
      unsafe: options.unsafe === true,
      dryRun: options.fixDryRun === true,
      maxPasses: options.fixMaxPasses ?? 10,
      formatAfterFix: options.fixNoFormat !== true,
      baseline: options.baseline,
      maxWarnings: options.maxWarnings,
      showSuppressed: options.showSuppressed,
      projectDiagnostics: options.projectDiagnostics ?? [],
    },
  });

  result = fixRun.result;
  documents = fixRun.documents;
  externalModelDocuments = fixRun.externalModelDocuments;
  externalDiagnostics = fixRun.externalDiagnostics;
  fixSummary = fixRun.summary;
}
```

Human output 例:

```text
fixed 1 problem with 1 edit in 1 file
skipped 2 unsafe fixes; rerun with --fix --unsafe to apply them
```

`--unsafe` 使用時:

```text
fixed 3 problems with 3 edits in 1 file
applied 2 unsafe fixes
```

`--fix-dry-run` 使用時:

```text
would fix 3 problems with 3 edits in 1 file
```

---

## JSON report

`toJsonReport()` に `fixes` を追加する。

```json
{
  "ok": true,
  "summary": {},
  "fixes": {
    "enabled": true,
    "unsafe": false,
    "dryRun": false,
    "passes": 1,
    "maxPasses": 10,
    "circularFixesDetected": false,
    "appliedDiagnostics": 1,
    "appliedEdits": 1,
    "changedFiles": 1,
    "unsafeAppliedDiagnostics": 0,
    "unsafeSkippedDiagnostics": 2,
    "skipped": [
      {
        "code": "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        "uri": "tree.xml",
        "reason": "unsafe-not-enabled",
        "title": "Add missing local model definition"
      }
    ]
  }
}
```

`--fix-dry-run --output json` の場合のみ、必要なら `fixedTextByPath` を出す。

```json
{
  "fixes": {
    "dryRun": true,
    "fixedTextByPath": {
      "tree.xml": "<root BTCPP_format=\"4\">...</root>"
    }
  }
}
```

---

## Baseline / suppressed diagnostics

初期実装では以下を推奨。

* default: 表示対象 diagnostics のみ fix。
* baseline-filtered diagnostics は fix しない。
* suppressed diagnostics は fix しない。
* 将来 option として `--fix-baseline` / `--fix-suppressed` を追加可能。

今回の scope では、summary reason として `baseline-filtered` / `suppressed` を型に入れておくだけでよい。

---

# テスト計画

## 1. Unit: candidate generation

新規:

```text
packages/btxml/tests/lint-fix-candidates.unit.test.ts
```

| Case                                        | 期待                 |
| ------------------------------------------- | ------------------ |
| `BT002_MISSING_BTCPP_FORMAT`                | `safety: "safe"`   |
| `BT121_UNUSED_MODEL_DEFINITION`             | `safety: "unsafe"` |
| `BT122_DUPLICATE_MODEL_DEFINITION`          | `safety: "safe"`   |
| `BT123_MISSING_LOCAL_MODEL_DEFINITION`      | `safety: "unsafe"` |
| metadata なし `BT121`                         | candidate なし       |
| metadata なし `BT122`                         | candidate なし       |
| metadata なし `BT123`                         | candidate なし       |
| malformed fix metadata                      | candidate なし       |
| XML escaping in `BT123` generated model     | escaped correctly  |
| duplicate candidate for same `BT123` nodeId | deduped            |

---

## 2. Unit: planner

新規:

```text
packages/btxml/tests/fix-plan.unit.test.ts
```

| Case                              | 期待                           |
| --------------------------------- | ---------------------------- |
| safe candidate + default          | applied                      |
| unsafe candidate + default        | skipped `unsafe-not-enabled` |
| unsafe candidate + `unsafe: true` | applied                      |
| invalid negative offset           | skipped `invalid-range`      |
| end offset > text length          | skipped `invalid-range`      |
| empty edits                       | skipped `empty-edit`         |
| overlapping edits                 | priority の高い方だけ applied      |
| same offset insert                | 片方 skip                      |
| adjacent ranges                   | 両方 applied                   |
| candidate order shuffled          | plan が同一                     |
| multiple URI                      | URI ごとに edits grouped        |

---

## 3. Unit: apply

新規:

```text
packages/btxml/tests/fix-apply.unit.test.ts
```

| Case                     | 期待               |
| ------------------------ | ---------------- |
| same file multiple edits | write 1 回        |
| multiple files           | 各 file write 1 回 |
| dry-run                  | write 0 回        |
| dry-run fixedText        | 期待 text と一致      |
| edits sorted descending  | 正しい結果            |
| empty plan               | no-op            |

---

## 4. Unit: engine

新規:

```text
packages/btxml/tests/fix-engine.unit.test.ts
```

mock host / mock check runner を使う。

| Case                     | 期待                                   |
| ------------------------ | ------------------------------------ |
| no candidates            | apply なし                             |
| one safe fix             | check → apply → recheck              |
| unsafe skipped           | summary に `unsafeSkippedDiagnostics` |
| unsafe applied           | summary に `unsafeAppliedDiagnostics` |
| multipass                | 2 pass 目の fix も適用                    |
| max passes               | 指定 pass 数で停止                         |
| circular                 | `circularFixesDetected: true`        |
| parse failed             | rollback                             |
| dry-run parse failed     | file unchanged, summary に failure    |
| format-after-fix enabled | formatter called for touched files   |
| `fixNoFormat`            | formatter not called                 |

---

## 5. E2E: CLI fix

新規:

```text
tests/e2e/cli-fix.e2e.test.ts
```

fixtures:

```text
tests/e2e/fixtures/fix/
  missing-btcpp-format.xml
  unused-model-definition/
  duplicate-model-definition/
  missing-local-definition/
  multipass/
  conflict/
  parse-failure/
```

E2E cases:

| ID      | Command                                              | 期待                                |
| ------- | ---------------------------------------------------- | --------------------------------- |
| FIX-001 | `lint --fix missing-btcpp-format.xml`                | `BTCPP_format="4"` が入る            |
| FIX-002 | `lint --fix --unsafe missing-btcpp-format.xml`       | safe fix も通常通り入る                  |
| FIX-003 | `lint --fix missing-local-definition.xml`            | `BT123` は直らない                     |
| FIX-004 | `lint --fix --unsafe missing-local-definition.xml`   | `BT123` が直る                       |
| FIX-005 | `lint --fix unused-model-definition.xml`             | `BT121` は直らない                     |
| FIX-006 | `lint --fix --unsafe unused-model-definition.xml`    | `BT121` が削除される                    |
| FIX-007 | `lint --fix duplicate-model-definition`              | safe duplicate fix が動く            |
| FIX-008 | `lint --unsafe file.xml`                             | exit 2                            |
| FIX-009 | `lint --fix-dry-run --unsafe --output json file.xml` | file 不変、JSON に fixes              |
| FIX-010 | `lint --fix conflict --output json`                  | overlap skip が出る                  |
| FIX-011 | `lint --fix multipass`                               | 1 invocation で複数 pass 修正          |
| FIX-012 | `lint --fix parse-failure`                           | rollback される                      |
| FIX-013 | `lint --fix --fix-no-format missing-local`           | raw layout                        |
| FIX-014 | `lint --fix --unsafe missing-local`                  | formatted layout                  |
| FIX-015 | `lint --fix` を 2 回                                   | 2 回目 no changes                   |
| FIX-016 | `lint --fix --output json missing-btcpp-format.xml`  | JSON schema valid + fixes summary |
| FIX-017 | `lint --fix-dry-run missing-btcpp-format.xml`        | file unchanged                    |

---

## 6. Snapshot tests

追加:

```text
tests/e2e/snapshots/fix/
```

Snapshots:

```text
bt002.expected.xml
bt121-unsafe.expected.xml
bt122-safe.expected.xml
bt123-existing-treenodesmodel.expected.xml
bt123-self-closing-treenodesmodel.expected.xml
bt123-create-treenodesmodel.expected.xml
```

`BT123` は exact output を固定する。`includes()` だけの検証は禁止。

---

# Docs 更新

`docs/cli.md` の `lint --fix safe fixes` を更新する。

## New docs draft

````md
## `lint --fix`

`btxmlc lint --fix` applies safe deterministic fixes only.

Safe fixes:

- `BT002_MISSING_BTCPP_FORMAT`: inserts `BTCPP_format="4"` on `<root>`.
- `BT122_DUPLICATE_MODEL_DEFINITION`: removes non-canonical duplicates when exactly one canonical model-file definition exists and the duplicate is safe to remove.

Unsafe fixes require `--unsafe`:

- `BT121_UNUSED_MODEL_DEFINITION`: removes unused inline model definitions.
- `BT123_MISSING_LOCAL_MODEL_DEFINITION`: adds missing local model definitions to `<TreeNodesModel>`.

Use:

```bash
btxmlc lint --fix --unsafe
````

to apply unsafe fixes.

Use:

```bash
btxmlc lint --fix-dry-run --unsafe --output json
```

to preview all fixes without writing files.

```

---

# PR 分割

## PR 1: CLI options + validation + docs draft

- `--unsafe`
- `--fix-dry-run`
- `--fix-max-passes`
- `--fix-no-format`
- `--unsafe` 単独 usage error
- docs draft
- minimal CLI tests

この PR では engine はまだ繋がなくてよい。

## PR 2: FixCandidate 導入

- `fix/types.ts`
- `getLintFixCandidates()`
- 既存 fix の safety 分類
- `getSafeLintFixes()` wrapper 維持
- candidate unit tests

既存挙動はまだ大きく変えない。

## PR 3: Planner

- `planFixes()`
- range validation
- overlap detection
- deterministic priority
- planner unit tests

## PR 4: Apply + dry-run

- `applyFixPlan()`
- URI ごと一括 write
- dry-run
- apply unit tests
- JSON fix summary の土台

## PR 5: `runLint()` に fix engine 接続

- `runLintFixEngine()`
- `runLint()` の direct apply を置換
- default では unsafe skip
- human output 更新
- E2E:
  - `BT002`
  - `BT121`
  - `BT123`
  - `--unsafe`
  - `--fix-dry-run`

この PR で user-visible behavior が変わる。

## PR 6: Multipass + circular detection

- max pass default 10
- `--fix-max-passes`
- hash detection
- multipass tests
- circular tests

## PR 7: Parse validation + rollback

- touched file parse validation
- rollback
- parse failure tests

## PR 8: Format-after-fix

- touched file formatter
- `--fix-no-format`
- exact snapshot tests
- docs finalization

---

# Acceptance criteria

## Safety

- `lint --fix` は safe fix のみ適用する。
- `BT121` / `BT123` は default `--fix` では適用されない。
- `lint --fix --unsafe` では `BT121` / `BT123` も適用される。
- `lint --unsafe` は usage error。
- invalid range は適用されない。
- overlapping edits は同時適用されない。
- fix 後 XML parse error なら rollback される。
- dry-run ではファイルが変わらない。

## Determinism

- 同じ入力なら同じ fix plan。
- candidate 順序が変わっても結果が同じ。
- `lint --fix` 2 回目で差分が出ない。
- multipass は最大 pass 数で必ず停止する。
- circular fix は検出される。

## UX

- human output に applied / skipped unsafe fix が出る。
- JSON output に fix summary が出る。
- `--fix-dry-run --output json` で preview できる。
- `fixed N problems with M edits in K files` の N は diagnostic 数、M は edit 数にする。
- docs と実装の safe / unsafe 分類が一致する。

## Output quality

- touched files は parse valid。
- default では touched files に formatter を適用する。
- `--fix-no-format` で formatter を無効化できる。
- `BT123` の generated XML は exact snapshot で検証される。

---

# 注意点

- `--unsafe` は「壊れてもよい」ではない。
  - invalid range
  - overlap
  - parse failure
  - circular fix
  は常に防止する。
- `--unsafe` は「意味論的に危険な修正もユーザーが明示的に許可する」という意味。
- `BT123` は現状 docs にないのに自動適用されるため、今回の変更で必ず default `--fix` から外す。
- `BT121` は既存 docs では safe fix 扱いだが、削除系なので `--unsafe` 側へ移す。
- 既存 test を一気に壊さないため、`getSafeLintFixes()` は移行期間中 wrapper として残す。
```
````markdown
# btxml-checker: `lint --fix` の現代的 fix engine 化 + `--unsafe` 導入計画

## 背景

現在の `lint --fix` は、`checkProject()` 後に diagnostics から `WorkspaceEdit` を生成し、`applyTextEdits()` で対象ファイルへ直接適用している。

現状の問題:

- fix が diagnostic 単位ではなく edit 単位で数えられている。
- overlap / invalid range / stale document の検出がない。
- fix は 1 pass のみ。
- fix 後の parse validation / rollback がない。
- `BT123_MISSING_LOCAL_MODEL_DEFINITION` が docs に載っていないのに自動適用され得る。
- `BT121_UNUSED_MODEL_DEFINITION` のような削除系 fix が default `--fix` で動くのは危険。
- `BT123` の挿入結果は formatter を通らないため、XML layout 品質が保証されない。
- baseline / suppressed diagnostic との関係が曖昧。
- JSON / human output に fix summary が十分出ない。

目的は、`lint --fix` を ESLint 的な「安全で予測可能な autofix」に近づけること。

---

## 最終仕様

### Safe fix のみ適用

```bash
btxmlc lint --fix
````

### Unsafe fix も含めて適用

```bash
btxmlc lint --fix --unsafe
```

### 書き込まずに unsafe fix まで確認

```bash
btxmlc lint --fix-dry-run --unsafe --output json
```

### 不正な使い方

```bash
btxmlc lint --unsafe
```

これは usage error にする。

```text
--unsafe can only be used with --fix or --fix-dry-run
```

`--unsafe` は `--fix` / `--fix-dry-run` の modifier であり、単独では意味を持たない。

---

## Fix 分類

| Diagnostic                             | default `--fix` | `--fix --unsafe` | safety   |
| -------------------------------------- | --------------: | ---------------: | -------- |
| `BT002_MISSING_BTCPP_FORMAT`           |           apply |            apply | `safe`   |
| `BT122_DUPLICATE_MODEL_DEFINITION`     |   apply if safe |            apply | `safe`   |
| `BT121_UNUSED_MODEL_DEFINITION`        |            skip |            apply | `unsafe` |
| `BT123_MISSING_LOCAL_MODEL_DEFINITION` |            skip |            apply | `unsafe` |

### 判断理由

* `BT002`: `<root>` に `BTCPP_format="4"` を追加するだけなので safe。
* `BT122`: canonical model-file definition が明確で、削除対象が安全に消せる場合は safe。
* `BT121`: 未使用 definition の削除。将来用・意図的定義・コメント巻き込みのリスクがあるため unsafe。
* `BT123`: local model definition を追加する semantic change。model の source-of-truth をローカル XML に複製するため unsafe。

---

## 新規 module 構成

追加する。

```text
packages/btxml/src/fix/types.ts
packages/btxml/src/fix/candidates.ts
packages/btxml/src/fix/plan.ts
packages/btxml/src/fix/apply.ts
packages/btxml/src/fix/engine.ts
packages/btxml/src/fix/report.ts
```

既存の `packages/btxml/src/repair/lint-fixes.ts` はすぐには削除しない。

```text
packages/btxml/src/repair/lint-fixes.ts
  - getSafeLintFixes()      # 互換 wrapper として一時維持
  - getLintFixCandidates()  # 新規 candidate generator へ移行
```

---

## 型定義

`packages/btxml/src/fix/types.ts`

```ts
import type { TextEdit } from "@btxml/foundation";

export type FixSafety = "safe" | "unsafe";

export type FixCandidate = {
  id: string;
  uri: string;

  diagnosticCode: string;
  diagnosticRule?: string;
  diagnosticSeverity: "error" | "warning" | "info";
  diagnosticMessage: string;

  safety: FixSafety;
  title: string;
  description?: string;

  edits: TextEdit[];

  source: {
    kind: "diagnostic";
    diagnosticFingerprint: string;
  };

  metadata?: Record<string, unknown>;
};

export type SkippedFixReason =
  | "unsafe-not-enabled"
  | "invalid-range"
  | "overlap"
  | "stale-document"
  | "parse-failed"
  | "formatter-failed"
  | "empty-edit"
  | "baseline-filtered"
  | "suppressed";

export type SkippedFix = {
  candidate: FixCandidate;
  reason: SkippedFixReason;
  conflictsWith?: string[];
  detail?: string;
};

export type FixPlan = {
  pass: number;
  applied: FixCandidate[];
  skipped: SkippedFix[];
  editsByUri: Map<string, TextEdit[]>;
  touchedUris: Set<string>;
};

export type FixRunSummary = {
  enabled: boolean;
  unsafe: boolean;
  dryRun: boolean;
  maxPasses: number;
  passes: number;
  circularFixesDetected: boolean;

  appliedDiagnostics: number;
  appliedEdits: number;
  changedFiles: number;

  unsafeAppliedDiagnostics: number;
  unsafeSkippedDiagnostics: number;

  skipped: Array<{
    code: string;
    uri: string;
    reason: SkippedFixReason;
    title: string;
  }>;
};
```

---

## CLI option 追加

### `packages/btxml/src/commands/lint.ts`

`lintCommand.builder` に追加。

```ts
.option("fix-dry-run", { type: "boolean" })
.option("unsafe", { type: "boolean" })
.option("fix-max-passes", { type: "number" })
.option("fix-no-format", { type: "boolean" })
```

### `packages/btxml/src/options/lint.ts`

schema に追加。

```ts
fixDryRun: z.boolean().optional(),
unsafe: z.boolean().optional(),
fixMaxPasses: z.number().int().min(1).max(20).optional(),
fixNoFormat: z.boolean().optional(),
```

validation を追加。

```ts
.superRefine((options, ctx) => {
  if (options.unsafe && !options.fix && !options.fixDryRun) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unsafe"],
      message: "`--unsafe` can only be used with `--fix` or `--fix-dry-run`",
    });
  }
})
```

内部扱い:

```ts
const fixEnabled = options.fix || options.fixDryRun;
const dryRun = options.fixDryRun === true;
const unsafe = options.unsafe === true;
const maxPasses = options.fixMaxPasses ?? 10;
const formatAfterFix = options.fixNoFormat !== true;
```

---

## Candidate generator

### 新規 API

```ts
export function getLintFixCandidates(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): FixCandidate[] {
  return [
    ...getBtcppFormatFixCandidates(input),
    ...getUnusedModelDefinitionFixCandidates(input),
    ...getDuplicateModelDefinitionFixCandidates(input),
    ...getMissingLocalModelDefinitionFixCandidates(input),
  ];
}
```

### 既存 wrapper

```ts
export function getSafeLintFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const candidates = getLintFixCandidates(input).filter(
    (candidate) => candidate.safety === "safe",
  );

  return mergeFixCandidatesToWorkspaceEdits(candidates);
}
```

ただし、新しい `runLint()` は `getSafeLintFixes()` を使わない。

---

## Candidate 分類

### `BT002_MISSING_BTCPP_FORMAT`

```ts
safety: "safe"
title: "Insert BTCPP_format=\"4\""
```

### `BT122_DUPLICATE_MODEL_DEFINITION`

```ts
safety: "safe"
title: "Remove non-canonical duplicate model definitions"
```

ただし、safe と見なす条件:

* canonical model-file definition がちょうど 1 つ。
* 削除対象がすべて editable。
* 削除対象 range が有効。
* できれば semantic equivalence も確認する。

  * kind 一致
  * port set 一致
  * port direction / name / type / default / enum / description 一致

semantic equivalence が未実装なら、既存条件ベースで safe とし、将来強化する。

### `BT121_UNUSED_MODEL_DEFINITION`

```ts
safety: "unsafe"
title: "Remove unused inline model definition"
```

### `BT123_MISSING_LOCAL_MODEL_DEFINITION`

```ts
safety: "unsafe"
title: "Add missing local model definition"
```

---

## Planner

`packages/btxml/src/fix/plan.ts`

```ts
export function planFixes(input: {
  pass: number;
  candidates: FixCandidate[];
  textByUri: Map<string, string>;
  unsafe: boolean;
}): FixPlan;
```

処理順:

1. `edits.length === 0` は skip `empty-edit`
2. `candidate.safety === "unsafe" && !unsafe` は skip `unsafe-not-enabled`
3. range validation
4. candidate priority で deterministic sort
5. overlap detection
6. URI ごとに edits を group
7. `FixPlan` を返す

### Range validation

```ts
function validateTextEdit(text: string, edit: TextEdit): boolean {
  const start = edit.range.start.offset;
  const end = edit.range.end.offset;

  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end >= start &&
    end <= text.length
  );
}
```

invalid edit を含む candidate は全体 skip。部分適用しない。

### Overlap detection

```ts
function overlaps(left: TextEdit, right: TextEdit): boolean {
  return (
    left.range.start.offset < right.range.end.offset &&
    right.range.start.offset < left.range.end.offset
  );
}
```

同一 offset への insert 同士も conflict 扱いにする。順序で意味が変わるため。

### Candidate priority

deterministic にする。

優先順:

1. `safe` > `unsafe`
2. severity: `error` > `warning` > `info`
3. edit range が小さいもの
4. `uri` lexical
5. first edit start offset asc
6. `diagnosticCode` lexical
7. `id` lexical

---

## Apply engine

`packages/btxml/src/fix/apply.ts`

```ts
export async function applyFixPlan(input: {
  plan: FixPlan;
  readText: (uri: string) => string;
  writeText: (uri: string, text: string) => void;
  dryRun: boolean;
}): Promise<{
  originalTextByUri: Map<string, string>;
  fixedTextByUri: Map<string, string>;
}>;
```

要件:

* URI ごとに 1 回だけ read/write。
* edits は offset 降順で適用。
* dry-run では write しない。
* fixed text は返す。

---

## Parse validation / rollback

fix 適用後、touched file を parse する。

```ts
for (const [uri, fixedText] of fixedTextByUri) {
  const parsed = parseBtXml(fixedText, { uri });
  if (parsed.diagnostics.some((d) => d.severity === DiagnosticSeverity.Error)) {
    rollback();
    markParseFailed();
  }
}
```

要件:

* parse error が出た pass は rollback。
* rollback は pass で触った全ファイルに対して行う。
* dry-run では当然 write しないが、parse failure は summary に出す。
* parse failure が発生した candidate は skip `parse-failed` として扱う。

---

## Format-after-fix

default では touched file だけ formatter を通す。

```bash
btxmlc lint --fix
```

は fix 後に canonical layout へ寄せる。

```bash
btxmlc lint --fix --fix-no-format
```

は raw fix output のまま。

理由:

* `BT123` は `<TreeNodesModel>` block を文字列で追加する。
* formatter を通さないと改行・indent 品質が保証できない。
* exact snapshot test で formatter 後の XML を固定する。

formatter failure 時:

* parse valid なら fix 自体は維持。
* summary に `formatter-failed` を出す。
* ただし初期実装では formatter failure を rollback まではしなくてよい。

---

## Multipass

`packages/btxml/src/fix/engine.ts`

```ts
export async function runLintFixEngine(input: {
  project: BtxmlProject;
  host: ProjectHost;
  options: {
    unsafe: boolean;
    dryRun: boolean;
    maxPasses: number;
    formatAfterFix: boolean;
    baseline?: DiagnosticBaseline;
    maxWarnings?: number;
    showSuppressed?: boolean;
    projectDiagnostics?: Diagnostic[];
  };
}): Promise<{
  result: CheckProjectResult;
  documents: BtDocument[];
  externalModelDocuments: BtDocument[];
  externalDiagnostics: Diagnostic[];
  summary: FixRunSummary;
}>;
```

loop:

```ts
const maxPasses = options.maxPasses ?? 10;
const seenHashes = new Set<string>();

for (let pass = 1; pass <= maxPasses; pass++) {
  const result = await checkProject(...);

  const diagnostics = collectFixDiagnostics(result);
  const candidates = getLintFixCandidates({ documents, diagnostics });

  const plan = planFixes({
    pass,
    candidates,
    textByUri,
    unsafe: options.unsafe,
  });

  if (plan.applied.length === 0) {
    return final;
  }

  await applyFixPlan(...);
  await parseValidateAndMaybeRollback(...);
  await maybeFormatTouchedFiles(...);
  await reloadDocuments(...);

  const hash = hashTouchedProjectState(...);
  if (seenHashes.has(hash)) {
    summary.circularFixesDetected = true;
    break;
  }
  seenHashes.add(hash);
}
```

要件:

* default max pass は 10。
* `--fix-max-passes` で変更可能。
* circular fix を検出したら停止。
* max pass 到達時は warning / summary に出す。

---

## `runLint()` の変更

`packages/btxml/src/commands/lint.ts`

現在の `if (options.fix) { ... }` direct apply block を置き換える。

概略:

```ts
let fixSummary: FixRunSummary | undefined;

if (options.fix || options.fixDryRun) {
  const fixRun = await runLintFixEngine({
    project,
    host,
    options: {
      unsafe: options.unsafe === true,
      dryRun: options.fixDryRun === true,
      maxPasses: options.fixMaxPasses ?? 10,
      formatAfterFix: options.fixNoFormat !== true,
      baseline: options.baseline,
      maxWarnings: options.maxWarnings,
      showSuppressed: options.showSuppressed,
      projectDiagnostics: options.projectDiagnostics ?? [],
    },
  });

  result = fixRun.result;
  documents = fixRun.documents;
  externalModelDocuments = fixRun.externalModelDocuments;
  externalDiagnostics = fixRun.externalDiagnostics;
  fixSummary = fixRun.summary;
}
```

Human output 例:

```text
fixed 1 problem with 1 edit in 1 file
skipped 2 unsafe fixes; rerun with --fix --unsafe to apply them
```

`--unsafe` 使用時:

```text
fixed 3 problems with 3 edits in 1 file
applied 2 unsafe fixes
```

`--fix-dry-run` 使用時:

```text
would fix 3 problems with 3 edits in 1 file
```

---

## JSON report

`toJsonReport()` に `fixes` を追加する。

```json
{
  "ok": true,
  "summary": {},
  "fixes": {
    "enabled": true,
    "unsafe": false,
    "dryRun": false,
    "passes": 1,
    "maxPasses": 10,
    "circularFixesDetected": false,
    "appliedDiagnostics": 1,
    "appliedEdits": 1,
    "changedFiles": 1,
    "unsafeAppliedDiagnostics": 0,
    "unsafeSkippedDiagnostics": 2,
    "skipped": [
      {
        "code": "BT123_MISSING_LOCAL_MODEL_DEFINITION",
        "uri": "tree.xml",
        "reason": "unsafe-not-enabled",
        "title": "Add missing local model definition"
      }
    ]
  }
}
```

`--fix-dry-run --output json` の場合のみ、必要なら `fixedTextByPath` を出す。

```json
{
  "fixes": {
    "dryRun": true,
    "fixedTextByPath": {
      "tree.xml": "<root BTCPP_format=\"4\">...</root>"
    }
  }
}
```

---

## Baseline / suppressed diagnostics

初期実装では以下を推奨。

* default: 表示対象 diagnostics のみ fix。
* baseline-filtered diagnostics は fix しない。
* suppressed diagnostics は fix しない。
* 将来 option として `--fix-baseline` / `--fix-suppressed` を追加可能。

今回の scope では、summary reason として `baseline-filtered` / `suppressed` を型に入れておくだけでよい。

---

# テスト計画

## 1. Unit: candidate generation

新規:

```text
packages/btxml/tests/lint-fix-candidates.unit.test.ts
```

| Case                                        | 期待                 |
| ------------------------------------------- | ------------------ |
| `BT002_MISSING_BTCPP_FORMAT`                | `safety: "safe"`   |
| `BT121_UNUSED_MODEL_DEFINITION`             | `safety: "unsafe"` |
| `BT122_DUPLICATE_MODEL_DEFINITION`          | `safety: "safe"`   |
| `BT123_MISSING_LOCAL_MODEL_DEFINITION`      | `safety: "unsafe"` |
| metadata なし `BT121`                         | candidate なし       |
| metadata なし `BT122`                         | candidate なし       |
| metadata なし `BT123`                         | candidate なし       |
| malformed fix metadata                      | candidate なし       |
| XML escaping in `BT123` generated model     | escaped correctly  |
| duplicate candidate for same `BT123` nodeId | deduped            |

---

## 2. Unit: planner

新規:

```text
packages/btxml/tests/fix-plan.unit.test.ts
```

| Case                              | 期待                           |
| --------------------------------- | ---------------------------- |
| safe candidate + default          | applied                      |
| unsafe candidate + default        | skipped `unsafe-not-enabled` |
| unsafe candidate + `unsafe: true` | applied                      |
| invalid negative offset           | skipped `invalid-range`      |
| end offset > text length          | skipped `invalid-range`      |
| empty edits                       | skipped `empty-edit`         |
| overlapping edits                 | priority の高い方だけ applied      |
| same offset insert                | 片方 skip                      |
| adjacent ranges                   | 両方 applied                   |
| candidate order shuffled          | plan が同一                     |
| multiple URI                      | URI ごとに edits grouped        |

---

## 3. Unit: apply

新規:

```text
packages/btxml/tests/fix-apply.unit.test.ts
```

| Case                     | 期待               |
| ------------------------ | ---------------- |
| same file multiple edits | write 1 回        |
| multiple files           | 各 file write 1 回 |
| dry-run                  | write 0 回        |
| dry-run fixedText        | 期待 text と一致      |
| edits sorted descending  | 正しい結果            |
| empty plan               | no-op            |

---

## 4. Unit: engine

新規:

```text
packages/btxml/tests/fix-engine.unit.test.ts
```

mock host / mock check runner を使う。

| Case                     | 期待                                   |
| ------------------------ | ------------------------------------ |
| no candidates            | apply なし                             |
| one safe fix             | check → apply → recheck              |
| unsafe skipped           | summary に `unsafeSkippedDiagnostics` |
| unsafe applied           | summary に `unsafeAppliedDiagnostics` |
| multipass                | 2 pass 目の fix も適用                    |
| max passes               | 指定 pass 数で停止                         |
| circular                 | `circularFixesDetected: true`        |
| parse failed             | rollback                             |
| dry-run parse failed     | file unchanged, summary に failure    |
| format-after-fix enabled | formatter called for touched files   |
| `fixNoFormat`            | formatter not called                 |

---

## 5. E2E: CLI fix

新規:

```text
tests/e2e/cli-fix.e2e.test.ts
```

fixtures:

```text
tests/e2e/fixtures/fix/
  missing-btcpp-format.xml
  unused-model-definition/
  duplicate-model-definition/
  missing-local-definition/
  multipass/
  conflict/
  parse-failure/
```

E2E cases:

| ID      | Command                                              | 期待                                |
| ------- | ---------------------------------------------------- | --------------------------------- |
| FIX-001 | `lint --fix missing-btcpp-format.xml`                | `BTCPP_format="4"` が入る            |
| FIX-002 | `lint --fix --unsafe missing-btcpp-format.xml`       | safe fix も通常通り入る                  |
| FIX-003 | `lint --fix missing-local-definition.xml`            | `BT123` は直らない                     |
| FIX-004 | `lint --fix --unsafe missing-local-definition.xml`   | `BT123` が直る                       |
| FIX-005 | `lint --fix unused-model-definition.xml`             | `BT121` は直らない                     |
| FIX-006 | `lint --fix --unsafe unused-model-definition.xml`    | `BT121` が削除される                    |
| FIX-007 | `lint --fix duplicate-model-definition`              | safe duplicate fix が動く            |
| FIX-008 | `lint --unsafe file.xml`                             | exit 2                            |
| FIX-009 | `lint --fix-dry-run --unsafe --output json file.xml` | file 不変、JSON に fixes              |
| FIX-010 | `lint --fix conflict --output json`                  | overlap skip が出る                  |
| FIX-011 | `lint --fix multipass`                               | 1 invocation で複数 pass 修正          |
| FIX-012 | `lint --fix parse-failure`                           | rollback される                      |
| FIX-013 | `lint --fix --fix-no-format missing-local`           | raw layout                        |
| FIX-014 | `lint --fix --unsafe missing-local`                  | formatted layout                  |
| FIX-015 | `lint --fix` を 2 回                                   | 2 回目 no changes                   |
| FIX-016 | `lint --fix --output json missing-btcpp-format.xml`  | JSON schema valid + fixes summary |
| FIX-017 | `lint --fix-dry-run missing-btcpp-format.xml`        | file unchanged                    |

---

## 6. Snapshot tests

追加:

```text
tests/e2e/snapshots/fix/
```

Snapshots:

```text
bt002.expected.xml
bt121-unsafe.expected.xml
bt122-safe.expected.xml
bt123-existing-treenodesmodel.expected.xml
bt123-self-closing-treenodesmodel.expected.xml
bt123-create-treenodesmodel.expected.xml
```

`BT123` は exact output を固定する。`includes()` だけの検証は禁止。

---

# Docs 更新

`docs/cli.md` の `lint --fix safe fixes` を更新する。

## New docs draft

````md
## `lint --fix`

`btxmlc lint --fix` applies safe deterministic fixes only.

Safe fixes:

- `BT002_MISSING_BTCPP_FORMAT`: inserts `BTCPP_format="4"` on `<root>`.
- `BT122_DUPLICATE_MODEL_DEFINITION`: removes non-canonical duplicates when exactly one canonical model-file definition exists and the duplicate is safe to remove.

Unsafe fixes require `--unsafe`:

- `BT121_UNUSED_MODEL_DEFINITION`: removes unused inline model definitions.
- `BT123_MISSING_LOCAL_MODEL_DEFINITION`: adds missing local model definitions to `<TreeNodesModel>`.

Use:

```bash
btxmlc lint --fix --unsafe
````

to apply unsafe fixes.

Use:

```bash
btxmlc lint --fix-dry-run --unsafe --output json
```

to preview all fixes without writing files.

```

---

# PR 分割

## PR 1: CLI options + validation + docs draft

- `--unsafe`
- `--fix-dry-run`
- `--fix-max-passes`
- `--fix-no-format`
- `--unsafe` 単独 usage error
- docs draft
- minimal CLI tests

この PR では engine はまだ繋がなくてよい。

## PR 2: FixCandidate 導入

- `fix/types.ts`
- `getLintFixCandidates()`
- 既存 fix の safety 分類
- `getSafeLintFixes()` wrapper 維持
- candidate unit tests

既存挙動はまだ大きく変えない。

## PR 3: Planner

- `planFixes()`
- range validation
- overlap detection
- deterministic priority
- planner unit tests

## PR 4: Apply + dry-run

- `applyFixPlan()`
- URI ごと一括 write
- dry-run
- apply unit tests
- JSON fix summary の土台

## PR 5: `runLint()` に fix engine 接続

- `runLintFixEngine()`
- `runLint()` の direct apply を置換
- default では unsafe skip
- human output 更新
- E2E:
  - `BT002`
  - `BT121`
  - `BT123`
  - `--unsafe`
  - `--fix-dry-run`

この PR で user-visible behavior が変わる。

## PR 6: Multipass + circular detection

- max pass default 10
- `--fix-max-passes`
- hash detection
- multipass tests
- circular tests

## PR 7: Parse validation + rollback

- touched file parse validation
- rollback
- parse failure tests

## PR 8: Format-after-fix

- touched file formatter
- `--fix-no-format`
- exact snapshot tests
- docs finalization

---

# Acceptance criteria

## Safety

- `lint --fix` は safe fix のみ適用する。
- `BT121` / `BT123` は default `--fix` では適用されない。
- `lint --fix --unsafe` では `BT121` / `BT123` も適用される。
- `lint --unsafe` は usage error。
- invalid range は適用されない。
- overlapping edits は同時適用されない。
- fix 後 XML parse error なら rollback される。
- dry-run ではファイルが変わらない。

## Determinism

- 同じ入力なら同じ fix plan。
- candidate 順序が変わっても結果が同じ。
- `lint --fix` 2 回目で差分が出ない。
- multipass は最大 pass 数で必ず停止する。
- circular fix は検出される。

## UX

- human output に applied / skipped unsafe fix が出る。
- JSON output に fix summary が出る。
- `--fix-dry-run --output json` で preview できる。
- `fixed N problems with M edits in K files` の N は diagnostic 数、M は edit 数にする。
- docs と実装の safe / unsafe 分類が一致する。

## Output quality

- touched files は parse valid。
- default では touched files に formatter を適用する。
- `--fix-no-format` で formatter を無効化できる。
- `BT123` の generated XML は exact snapshot で検証される。

---

# 注意点

- `--unsafe` は「壊れてもよい」ではない。
  - invalid range
  - overlap
  - parse failure
  - circular fix
  は常に防止する。
- `--unsafe` は「意味論的に危険な修正もユーザーが明示的に許可する」という意味。
- `BT123` は現状 docs にないのに自動適用されるため、今回の変更で必ず default `--fix` から外す。
- `BT121` は既存 docs では safe fix 扱いだが、削除系なので `--unsafe` 側へ移す。
- 既存 test を一気に壊さないため、`getSafeLintFixes()` は移行期間中 wrapper として残す。
```
