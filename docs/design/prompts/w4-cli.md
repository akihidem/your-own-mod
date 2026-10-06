# Work package W4: CLI, metrics schema, report, README, CI, end-to-end tests

You implement the last node of the plan, on top of the merged parser (`src/profile.mjs`, `src/check.mjs`), catalog and matcher (`src/catalog/index.mjs`, `src/match.mjs`, `src/diff.mjs`) and emitter (`src/emit.mjs`, `src/templates/*`). You receive their **public interfaces** (`docs/design/contracts/w4-interfaces.md`, generated from the sources) and the recipe summary (`w4-catalog-summary.md`), not the full sources; use only the exported functions as documented there, and **do not change those modules** (you may only create the files below). Where this prompt and DESIGN.md (attached in full) differ, DESIGN.md wins. Notes from integration: `parseProfile(text)` takes the text alone; `writePluginFolder` is async and resolves to the sorted path list; `slugFor`/`slugSource` and `buildBundle(profile, proposals, { file, sha256, pluginName, files, recipes })` are in the interface digest; the emitter already enforces the leak check and free-string parameter rule and throws `E_LEAK` / `E_PARAM_FREE_TEXT`; the CLI maps a thrown emitter error to exit 1 with `error: <CODE>: <message>` and never prints the needle.

You may create or change only:
- `bin/kokoro-mods.mjs`, `src/cli.mjs`, `src/report.mjs`, `src/metrics.mjs` (new)
- `test/cli.test.mjs` (new)
- `package.json`, `README.md`, `README.ja.md`, `.github/workflows/ci.yml` (new)

Attached: the **full `docs/design/DESIGN.md`** (v0.2.4: §1–§2 give the README its audience and principles, §5.1 the Profile and line shape used by the A5c leak check, §5.3 the Recipe shape with multilingual titles and typed params used by `buildOptionKeys()` and the `recipes` command, §5.4–§5.7, §8, §9), `src/constants.mjs`, `w4-interfaces.md`, `w4-catalog-summary.md`, and **`w4-facts.md`: the fixture inventory (3 valid, 13 invalid, 2 benign), the content-check result of every fixture, the exact proposals (ids, default toggles, confidence, quoted lines, params) each valid fixture yields, the file list the emitter returns, and every export name**. Freeze those literals in the tests; do not guess them.

## Environment and style

Node.js 20+, ES modules, zero dependencies, `node:test` + `node:assert/strict`, run as `node --test test/*.test.mjs` (the explicit glob; a bare `node --test` would also pick up the golden mod's TypeScript test). JSDoc on every export; short *why* comments on non-obvious choices. The CLI never writes outside `--out` (and a temp folder it creates and removes inside `--out`'s parent for the atomic replace). No network, no child process except the integration test spawning `claude`.

## `src/cli.mjs` and `bin/kokoro-mods.mjs`

```js
export async function main(argv, { stdout, stderr, env, cwd }) // -> exit code (DESIGN §9); never throws; prints `error: <CODE>: <message>` on failure, the stack only when --debug
```

Commands (DESIGN §3):
- `check <profile.md> [--json]`: parse, run `checkProfile`, print findings (`LINE  LEVEL  RULE  message` or JSON); exit 0 when no FAIL, 3 otherwise. Messages never include input lines (they come from `checkProfile`; do not add excerpts).
- `propose <profile.md> [--out DIR] [--name SLUG] [--max-enabled N | --all] [--lang ja|en] [--force] [--json]`: `check` first (exit 3 and write nothing on FAIL; WARN lines are printed); `sha256` of the file bytes; `slugFor` (when `slugSource` is `'fallback'`, print a hint to pass `--name`); `matchRecipes`; `buildBundle` with `files` = the paths the emitter will write; `emitPlugin`; when `DIR/PROPOSALS.json` exists: same `pluginName` → print `formatDiff(diffProposals(old, new))` then replace only the paths listed in the old `files` plus the new ones (write to `DIR/.kokoro-mods-tmp-<pid>` then move each file into place; remove the temp folder), different `pluginName` → exit 5 unless `--force`; default `--out` is `./kokoro-mods-out/<slug>`; print the proposal summary (one line per proposal: on/off, id, confidence, number of quotes) and the install block; exit 0.
- `diff <A/PROPOSALS.json> <B/PROPOSALS.json>`: print `formatDiff`; exit 4 when `hasChanges`, else 0.
- `report <export.json> [<before.json>] [--settings PATH]`: `assertMetricsExport` on each; print counts per recipe and event, the delta when two files are given, and, with `--settings`, which `userConfig` toggles are on for the plugin named in the export (read-only; the file is never written).
- `recipes [--lang ja|en]`: list the catalog: id, title, template, high-confidence sections, params.
- `--help` / unknown command → usage, exit 2 (unknown command or missing argument).

## `src/metrics.mjs`

```js
export const EXPORT_VERSION = 1
export function assertMetricsExport(obj, { recipeIds, eventNames, optionKeys })   // throws Error with code 'E_EXPORT_SHAPE' naming the offending key path, never its value
export function buildOptionKeys(recipes)   // every userConfigKey for the given recipes (booleans and numeric params only)
```

Closed schema = DESIGN §5.6: top-level keys exactly `v`, `plugin`, `profileSha256` (64 hex), `exportedAt` (ISO 8601), `options` (values boolean or finite number; keys in `optionKeys`), `metrics` (`v`, `since` integer ≥ 0, `counts` keyed by `recipeIds` with values keyed by `eventNames` ∪ `{'suppressed'}` and non-negative integers). Anything else throws.

## `src/report.mjs`

```js
export function readExport(path, sets)            // parse + assertMetricsExport
export function compareExports(before, after)     // -> { [recipeId]: { [event]: { before, after, delta } } }
export function readSettingsToggles(settingsPath, pluginName)   // -> { [userConfigKey]: value } from pluginConfigs[pluginName].options, or {} when absent; never writes
export function formatReport(summary, { lang })
```

## `package.json`

`name: kokoro-mods`, `version` = `TOOL_VERSION`, `type: module`, `bin: { "kokoro-mods": "bin/kokoro-mods.mjs" }`, `engines.node >= 20`, `scripts.test: "node --test test/*.test.mjs"`, `license: MIT`, `files` limited to `bin`, `src`, `README*`, `LICENSE`. No dependencies.

## README.md (English) and README.ja.md (Japanese)

Both say the same things, for a reader who has never seen this conversation: what kokoro-mods does in three sentences; who it is for (the target of DESIGN §1); the six principles in plain words; install (`npx kokoro-mods` or clone + `node bin/kokoro-mods.mjs`); the flow of DESIGN §3 with the exact commands; what a proposal looks like (a short example from `fixtures/valid/en-generic.md`); the recipe list (table from the catalog: id, what it does, what it counts); privacy: what is read, what is written where, what is counted, what never leaves the machine, and the two things that are stored locally (metrics counts; the resume brief's time and count); limits (publish-guard protects Bash only; counts are proxies; the plugin API is early access); how to write a manual without a psychologist (name the `ai-torisetsu` kit without a link) and what `kokoro.md` is (name the KOKORO specification without a link; link only `https://github.com/akihidem/kokoro-mcp`, which is public; the other two repositories are private at the time of writing and a link would 404); development (`node --test test/`, `claude plugin validate --strict`, the design documents); license. No marketing language, no claims of effect beyond what counts can show.

## `.github/workflows/ci.yml`

On push and pull request: Node 20 and 22 matrix; `npm install -g @anthropic-ai/claude-code`; `node --test test/*.test.mjs`; `claude plugin validate --strict docs/design/golden/plugin`. (Set `KOKORO_MODS_SKIP_CLAUDE` only if the install step fails; prefer the real check.)

## Tests (`test/cli.test.mjs`) = the acceptance criteria of DESIGN §8 as executable checks

Drive `main()` with captured stdout/stderr and a temp `--out` for every case. Required cases: A2 (fixture inventory asserted; `propose` on each valid fixture, then `claude plugin validate --strict` and `claude plugin test` on `<out>/plugin` — missing-tool policy of §4); A3 (every proposal has 1–3 evidence entries with non-empty `quote` equal to the file's line; the set of recipe ids per valid fixture equals a frozen expected set written in the test: compute it once, read it, and freeze the literal); A4 (13 invalid → exit 3 and nothing written; 2 benign → exit 0 on `check`; inventory asserted: exactly 3 valid, 13 invalid, 2 benign, names as in w4-facts.md); A5c (no 12+ character `text` line of a fixture appears under `plugin/`); A6 (accept a golden export built from the fixture's real recipe ids and events; reject unknown top-level key, string option, non-integer count, nested free text); A7 (two fixtures differing in one section → expected diff, exit 4; identical → exit 0); A8 (two runs → identical file sets and bytes); A9 (offline: no forbidden imports in `src/` and `bin/`; protected home: `HOME` pointed at an empty temp dir stays empty; bounded: enabled count ≤ 3); A10 (PROPOSALS.md fences and no `<img`); A11 (re-run keeps a stray file, replaces owned files, different `pluginName` → 5); A12 (malformed export JSON → `error: E_...` without any excerpt of the file content; invalid regex in a pattern option is reported by key). Exit codes 0, 2, 3, 4, 5 each asserted at least once.

Return only the unified diff (new files only).
