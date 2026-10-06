# DESIGN.md v0.2.1 excerpt for W4 (CLI, metrics, report, docs)

## 3. User flow

```
kokoro-mods check   profile.md                       # content and structure check (exit 0 / 3)
kokoro-mods propose profile.md --out ./mods/me       # writes ./mods/me/plugin/ (distributable) + ./mods/me/PROPOSALS.md + PROPOSALS.json (private)
#   -> read PROPOSALS.md, then inside Claude Code:
#      /plugin marketplace add ./mods/me/plugin   and   /plugin install kokoro-mods-me
#   -> toggle recipes in /config (each is a userConfig row)
kokoro-mods propose profile.md --out ./mods/me       # later, after editing the manual: prints the rewrite diff, then replaces the files it owns
kokoro-mods diff old/PROPOSALS.json new/PROPOSALS.json
#   inside Claude Code: /kokoro-mods status | export <absolute path> | export --print | allow-publish [minutes] | focus <minutes> | reset
kokoro-mods report export.json [export-before.json] [--settings ~/.claude/settings.json]
kokoro-mods recipes
```

## 4. Repository layout

```
bin/kokoro-mods.mjs        CLI entry (argument parsing, exit codes)         [W4]
src/constants.mjs          shared constants (frozen, written by the design) [design]
src/profile.mjs            parseProfile(text, {filename}) -> Profile         [W1]
src/check.mjs              checkProfile(profile) -> Finding[]                [W1]
src/catalog/index.mjs      RECIPES (the catalog, §6)                         [W2]
src/match.mjs              matchRecipes, buildBundle, slugFor                 [W2]
src/diff.mjs               diffProposals, formatDiff                         [W2]
src/emit.mjs               emitPlugin, writePluginFolder, leakCheck, userConfigKey [W3]
src/templates/*.mjs        manifest, register, tests, proposals templates    [W3]
src/report.mjs             readExport, compareExports, readSettings          [W4]
src/metrics.mjs            closed export schema + assertMetricsExport        [W4]
src/cli.mjs                command implementations                           [W4]
fixtures/valid/            3 synthetic manuals (ja kokoro, ja torisetsu, en generic)   [W1]
fixtures/invalid/          6 manuals, one per F rule                                   [W1]
fixtures/benign/           2 manuals that look forbidden but are not (must pass)        [W1]
test/*.test.mjs            node --test                                       [each W owns its own]
docs/design/DESIGN.md, docs/design/api-digest-w3.md, docs/design/golden/, docs/design/REVIEW-LOG.md, docs/research/*
.github/workflows/ci.yml   node --test on Node 20/22 with Claude Code installed [W4]
README.md, README.ja.md, package.json, LICENSE (MIT)                       [W4]
```

Runtime: Node.js 20 or newer, ES modules, **zero dependencies**, tests with the built-in `node --test test/*.test.mjs`. Generated mods are TypeScript (the engine compiles them).

**Missing-tool policy (frozen, one rule for every test):** a test that needs the `claude` executable (`claude plugin validate --strict`, `claude plugin test`) fails with the message `claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip` when it is absent, unless that variable is set, in which case the test is reported as skipped by name. A2 is therefore unverified on a machine without Claude Code and CI installs it.

### 5.4 Proposal and PROPOSALS.json

```js
Proposal = {
  recipeId: string,
  confidence: 'high' | 'medium' | 'low',
  evidence: [ { line: number, section: SectionKey, quote: string, matched: string } ],  // quote === the line's `raw`; 1..3 entries, never empty
  params: { [name]: value },                    // defaults merged with deriveParams (§5.4a)
  enabledByDefault: boolean
}
Bundle = {                                      // PROPOSALS.json (no timestamps: output must be deterministic)
  tool: { name: 'kokoro-mods', version: string },
  profile: { file: string /* basename */, format, language, version: string|null /* frontmatter */, sha256: string },
  pluginName: string,                            // 'kokoro-mods-<slug>': the stable identity of an output folder; the sha256 changes with every edit, the pluginName does not
  proposals: Proposal[],                         // ranked (§5.4a)
  notMatched: string[],                          // recipe ids with no evidence, sorted
  files: string[]                                // every path kokoro-mods wrote under <out>, relative, sorted (what a re-run may replace)
}
```

### 5.5 Generated output (frozen layout)

```
<out>/plugin/.claude-plugin/plugin.json        name, version, description, author {name:'kokoro-mods'}, license 'MIT', keywords, userConfig
<out>/plugin/.claude-plugin/marketplace.json   { name: <pluginName>, description, owner: { name: 'kokoro-mods' }, plugins: [ { name: <pluginName>, source: './' } ] }  (description is required by --strict)
<out>/plugin/hooks/hooks.json                  { "modules": ["./register.ts"] }
<out>/plugin/hooks/register.ts                 the hooks module (§7)
<out>/plugin/hooks/register.test.ts            tests run by `claude plugin test` (§7.1)
<out>/PROPOSALS.md                             private report: per proposal the quoted lines (inert, inside fenced code blocks), what the mod does, toggles, counts, evidence
<out>/PROPOSALS.json                           the Bundle (private)
```

`plugin/` is the distributable (what `/plugin marketplace add <out>/plugin` reads); nothing from the manual is in it (A5). `userConfig` keys: `snake(recipeId)` (boolean, `default` = enabledByDefault) and `snake(recipeId) + '_' + param` (snake = hyphens to underscores). Every field carries `type`, `title`, `description`; numbers carry `min`/`max` when the recipe declares them; `multiple: true` only on string params (array of strings, typed `readonly string[]` in the module); `options` only on non-multiple strings. `title`/`description` use the language of the profile (`--lang` overrides). Golden files validated with `claude plugin validate --strict` and `claude plugin test` on Claude Code 2.1.290 are in `docs/design/golden/` (a complete small mod with its test); emitted files follow their shape.

Re-run on an existing `<out>`: when `PROPOSALS.json` exists with the same `pluginName`, print the diff (§5.7), then replace exactly the paths listed in its `files` (write to a temporary sibling folder, then move into place); other files in `<out>` are untouched. A different `pluginName` → exit 5 unless `--force`.

### 5.6 Metrics and export (frozen, closed schema)

The mod keeps one object in `$.store` under `STORE_KEYS.metrics`:

```js
{ v: 1, since: number /* epoch ms */, counts: { [recipeId]: { [event]: number } } }
```

Increments are serialised through one promise chain inside the module (a read-modify-write that overlaps would lose counts); `export` awaits the chain first. `/kokoro-mods reset` clears `counts` and sets `since`.

Export object (what `/kokoro-mods export <absolute path>` writes and `export --print` returns as text):

```js
{ v: 1, plugin: string, profileSha256: string /* 64 hex */, exportedAt: string /* ISO 8601 */,
  options: { [userConfigKey]: boolean | number },    // string params (phrases, patterns, language) are NOT exported
  metrics: { v: 1, since: number, counts: { [recipeId]: { [event]: integer >= 0 } } } }
```

`src/metrics.mjs` exports `assertMetricsExport(obj, { recipeIds, eventNames, optionKeys })` which throws unless every key and string is one of the allowed sets above and every count is a non-negative integer; any other field, nested field or string is a defect.

### 5.7 Diff (frozen)

```js
diffProposals(before, after)  // Bundle or { proposals } inputs
  -> { added: string[], removed: string[], changed: [ { recipeId, fields: ('params'|'evidence'|'enabledByDefault'|'confidence')[] } ], same: string[], hasChanges: boolean }
```

Ids sorted in every array; `evidence` compares the sequence of `quote`s; `params` deep-equal. `formatDiff(diff, { lang })` renders it for the CLI.

## 8. Acceptance criteria (frozen; all automatic)

- **A1** `node --test test/*.test.mjs` passes on Node 20 and 22 (the explicit glob keeps Node from also running the golden mod's TypeScript test, which only `claude plugin test` can run).
- **A2** For every fixture under `fixtures/valid/`, `propose` writes `<out>/plugin` that passes `claude plugin validate --strict` and `claude plugin test` (missing-tool policy of §4). The test asserts the fixture inventory first: exactly `ja-kokoro.md`, `ja-torisetsu.md`, `en-generic.md`.
- **A3** Every proposal has 1..3 evidence entries; every `quote` is non-empty and equals line `line` of the profile file read back from disk; for each valid fixture the set of proposed recipe ids equals a frozen expected set written in the test.
- **A4** Every fixture under `fixtures/invalid/` (exactly 6, named in the test) makes `check` exit 3 with the expected rule and `propose` exit 3 without writing any file; every fixture under `fixtures/benign/` (exactly 2) passes `check` with zero FAIL.
- **A5** Leak: (a) structural: the manifest and module templates receive no `evidence` (their signatures take `{ recipes, proposals-without-evidence }`), asserted by a test that passes a bundle whose evidence holds canaries and finds none of the canaries in `plugin/**`; (b) canaries include a short one (`CANARY-7q`), an HTML one (`<img src=x>CANARY`), and a JSON-escaped one (`"CANARYA"`); (c) on the real fixtures, no `text` of 12+ characters from any non-comment, non-heading line appears under `plugin/**`.
- **A6** `assertMetricsExport` accepts the golden export produced by the generated command (test 5 of §7.1 captures it; the Node test re-validates the captured text written to a temp file by the integration run) and rejects: an unknown top-level key, a string param in `options`, a non-integer count, a free-text nested field.
- **A7** `diff` between the outputs of two fixtures that differ in one section reports exactly the expected added/removed/changed ids; exit 4 when anything changed, 0 otherwise.
- **A8** `propose` run twice on the same input produces the same non-empty file set with byte-identical contents.
- **A9** Direct principle tests: (offline) no file under `src/` or `bin/` imports `node:http`, `node:https`, `node:net`, `node:dns`, `node:child_process` (the integration test alone may spawn `claude`); (protected home) running `propose` with `HOME` pointed at an empty temp dir leaves that dir empty; (bounded) on every valid fixture the number of `enabledByDefault` proposals is at most `maxEnabled`.
- **A10** PROPOSALS.md renders every quote inside a fenced code block (a line that contains a backtick fence is wrapped in a longer fence); the file contains no `<img`, `<script`, `<iframe`, and no `](http` outside code blocks.
- **A11** Re-run with the same `pluginName` replaces only the paths listed in `files`; a stray file placed in `<out>` survives; a different `pluginName` exits 5.
- **A12** Error output: on a malformed JSON export or an invalid user pattern, the CLI prints `error: <code>: <message>` without any excerpt of the input; the stack appears only with `--debug`.

## 9. Exit codes and errors (frozen)

0 success · 1 unexpected failure · 2 usage error · 3 profile check failed · 4 diff found changes · 5 output folder conflict. Error lines are `error: <CODE>: <message>`; messages name keys and rule ids, never input values.

## 11. Decisions and open points

- **Name**: `kokoro-mods` (KOKORO family: kokoro-mcp, kokoro-edge). The survey notes a search collision with "Kokoro TTS"; alternatives recorded (torisetsu-mods, PacePatch, WorkstyleMods). Renaming before the public release is cheap and is the maintainer's decision.
- **No LLM in the main path** (claude-env-coach v3's lesson: 814 LLM-written proposals, 0 adopted; and the manual must not leave the machine).
- **Status line, not a band**, for `running-indicator` in v0.1 (no JSX, no state contract).
- **Rewriting third-party mods** is out of scope; "rewrite" means re-proposing from a changed manual and replacing the files kokoro-mods owns after showing the diff.
- **Why Node, not Python**: the generated mods are TypeScript, Claude Code users have Node, one toolchain.
- **What cannot be measured**: whether the person felt less load. Counts are proxies; PROPOSALS.md says so.
- **Unprotected paths** (publish-guard): non-Bash tools and scripts that push internally. Stated in PROPOSALS.md.

