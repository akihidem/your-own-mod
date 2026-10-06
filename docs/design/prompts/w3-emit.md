# Work package W3: plugin emitter and templates

You implement one node of a parallel plan. You may create or change only these files:

- `src/emit.mjs` (new)
- `src/templates/manifest.mjs`, `src/templates/register.mjs`, `src/templates/tests.mjs`, `src/templates/proposals.mjs` (new)
- `test/emit.test.mjs` (new)

Attached: `docs/design/DESIGN.md` v0.2 (frozen contract: read §2, §5.3–§5.7, §6, §7, §7.1, §8 A5/A8/A10), `src/constants.mjs` (import it), `docs/design/api-digest-w3.md` (the Claude Code plugin API you generate code against; the authority for the TypeScript you emit), and the golden mod `docs/design/golden/plugin/**` (a complete small mod with its test, validated on Claude Code 2.1.290: copy its idioms exactly). Two other workers write the parser and the catalog in parallel: **do not import `src/catalog` or `src/profile.mjs`**; your tests build a minimal `recipes` map and a `Bundle` by hand. Where this prompt and DESIGN.md differ, DESIGN.md wins.

## Environment and style

Node.js 20+, ES modules, zero dependencies, `node:test` + `node:assert/strict`, run as `node --test test/emit.test.mjs`. JSDoc on every export; short *why* comments on non-obvious choices. The emitted TypeScript must be valid under the engine's loader (ES module, `.ts`, no `require`, no dynamic `import()`, only `import type { Register } from 'claude-code'`); keep it dependency-free and readable: the person will open it.

## `src/emit.mjs`

```js
export function emitPlugin({ bundle, recipes, lang = 'en', outDirName = '.' })   // -> Map<relativePath, string> for the §5.5 layout ('plugin/...' and 'PROPOSALS.md', 'PROPOSALS.json'), deterministic order
export function writePluginFolder(files, outDir)        // writes the map; creates folders; returns the sorted list of relative paths written
export function userConfigKey(recipeId, param = null)   // snake(recipeId) and snake(recipeId) + '_' + param
export function leakCheck(files, needles)               // -> ['path: needle', ...] for every needle found under 'plugin/' (any length)
export function stripEvidence(bundle)                   // -> the bundle with evidence removed from every proposal (what the plugin templates receive)
```

`recipes` is `{ [id]: Recipe }` (DESIGN §5.3 with `template`, `rule`, `note`, `params` incl. `options`/`multiple`). Only recipes that appear in `bundle.proposals` are emitted. An unknown recipe id throws (never silently skipped). **Structural leak rule (A5a):** `manifest.mjs`, `register.mjs` and `tests.mjs` take `stripEvidence(bundle)`; only `proposals.mjs` receives the evidence.

## Templates (frozen outputs)

`src/templates/manifest.mjs` → `plugin/.claude-plugin/plugin.json` and `plugin/.claude-plugin/marketplace.json` (2-space JSON, keys in a fixed order). `plugin.json`: `name` = `bundle.pluginName`, `version` = `bundle.tool.version`, `description` = "Mods proposed by kokoro-mods from <file> (<format>, profile <sha256 first 8>)", `author: { name: 'kokoro-mods' }`, `license: 'MIT'`, `keywords: ['kokoro-mods', 'accessibility', 'claude-code-mod']`, `userConfig` with, per proposal: `userConfigKey(id)` boolean (`title` = recipe title in `lang`, `description` = recipe summary in `lang`, `default` = `enabledByDefault`) and, per param, `userConfigKey(id, param)` with `type`, `title`, `description`, `default` = the proposal's param value, `min`/`max` when declared (numbers), `options` when declared (non-multiple strings), `multiple: true` for params declared `multiple` (string only). No other keys. `marketplace.json`: `{ name, description, owner: { name: 'kokoro-mods' }, plugins: [ { name, source: './' } ] }` — `description` is required by `--strict`.

`src/templates/register.mjs` → `plugin/hooks/register.ts` following DESIGN §7 exactly and the golden idioms. Requirements:
- `type Options = { ... }` lists every userConfig key with its TypeScript type (`multiple` strings → `readonly string[]`).
- Metrics: one promise chain (`let chain = Promise.resolve()`), `bump($, recipe, event)` = `chain = chain.then(read-modify-write of STORE_KEYS.metrics).catch(() => {})`; `export` awaits `chain` first. `reset` clears counts and sets `since`.
- Shared toast cooldown: `toast($, text)` only raises when 60 s passed since the last toast; otherwise bumps the recipe's `suppressed` event.
- `prompt.compose` hook only when a compose-rule proposal exists; builds the section from the rules whose option is on at hook time; placeholders `{min}` `{max}` `{language}` `{max_lines}` filled from the options; returns `r` unchanged when no rule is enabled.
- `prompt.submit` hook only when a submit-detector proposal exists, with `.catch(($, e, next) => (next.called ? next(e) : next(e)))`: `t = e.text.trim()`; stop-signals first (when enabled and `t` equals or starts with a phrase), then receive-only (when enabled, `t.length <= max_chars`, equals or starts with a phrase); one note at most; a hit bumps `detected` and returns `next({ ...e, context: [...(e.context ?? []), NOTE] })`.
- `publish-guard` as in the golden file, plus: invalid regex sources are skipped; a store read that throws denies; bump `denied` / `allowed`.
- `running-indicator`: `turn.start` (skip when `e.agentId`): remember the start, reset the counter, `timer = $.clock.after(long_turn_seconds * 1000, () => { toast(...); fired = true })`; `tool.call` (no matcher; skip when `e.agentId`): count, `$.ui.status(\`running ${s}s · ${n} tools · last: ${e.tool}\`)`, `return next(e)`; `turn.complete`: cancel the timer, `$.ui.status(undefined)`, bump `long_turns` when it fired. Only when interactive.
- `lead-with-answer` counter on `turn.complete`: lines of `e.answer` > `max_lines` → bump `long_answers`. Never store the answer.
- `resume-brief` (metadata only): `turn.complete` stores `{ at: now, turns: previous.turns + 1 }` under `STORE_KEYS.lastTurnPrefix + cwd`; `session.start` (interactive) logs `${PLUGIN}: last time here: N (minutes|hours|days) ago, M turns` and bumps `resumed`.
- `focus-timer`: `session.start` (interactive): `$.clock.every(minutes * 60_000, tick)`; `tick` toasts only when a turn completed since the previous tick (idle suppression), bumps `ticks`; `/kokoro-mods focus <minutes>` cancels and restarts.
- `session.start` registers the command `kokoro-mods` (description "kokoro-mods: status | export <absolute path> | export --print | allow-publish [minutes] | focus <minutes> | reset"); `command.run` with matcher `{ command: 'kokoro-mods' }` answers `{ text }`: `status`; `export <abs path>` writes the §5.6 export object with `$.fs.write(path, JSON.stringify(obj, null, 2))` and answers the path; `export --print` answers the JSON text; `allow-publish [minutes]` only when `e.origin.kind === 'composer'` and minutes is an integer 1..720 (default `allow_minutes`), else answers that the command must be typed by the user / the usage line; `focus <minutes>`; `reset`.
- Every observer hook wraps its body in try/catch and returns `next(e)`; every gating hook (`prompt.submit`, `tool.call`) carries `.catch`.
- The export `options` object contains only boolean and number option values (never strings or arrays).

`src/templates/tests.mjs` → `plugin/hooks/register.test.ts` implementing DESIGN §7.1 (tests 1–5, conditional on the recipes present; test 1 always) with the golden idioms: `test(name, { options }, async ($, on) => ...)`, bottom hooks via `on`, `$.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })`, `$.tool.call({ tool: 'Bash', command })`, `$.prompt.submit({ text })`, `$.command.run({ command: 'kokoro-mods', args: 'export --print' })`, `mock.store(on, {...})`, `mock.clock(on)`. Options objects are built from the manifest defaults with the stated toggles flipped. Test 5 parses the answered text and asserts the key sets of DESIGN §5.6 (embed the allowed recipe ids and event names from the bundle).

`src/templates/proposals.mjs` → `PROPOSALS.md` (in `lang`) and `PROPOSALS.json` (the Bundle with `files` filled, 2-space JSON). PROPOSALS.md: a title; one sentence on what kokoro-mods is; the install block (`/plugin marketplace add <outDirName>/plugin` then `/plugin install <pluginName>`); per proposal: title, on/off by default, the quoted lines each inside a fenced code block tagged `text` with `line N (§section)` above it (a quote containing three backticks is wrapped in a four-backtick fence), what the mod does, its userConfig keys, what it counts, the evidence references; a "not matched" list; a note that counts are proxies, that `publish-guard` protects Bash only, and that `session-resume-brief` stores only a time and a count. No HTML, no images, no links outside code blocks except the evidence references rendered as plain text.

## Determinism and leak rules

No timestamps, random values or absolute paths in any emitted file. `leakCheck(files, needles)` scans every path under `plugin/`.

## Tests (`test/emit.test.mjs`)

Build `recipes` with one recipe per template key (6) plus one more compose-rule recipe, using distinctive synthetic titles, and a `Bundle` with proposals for all of them, two `enabledByDefault: false`, with evidence quotes that include the canaries `CANARY-7q`, `<img src=x>CANARY-html`, and `"CANARYA"` (a JSON-escaped form) and a long one `UNIQUE-QUOTE-ALPHA-7781 ...`. Assert: the file map has exactly the §5.5 paths; `plugin.json` parses, `name` matches, every userConfig field has `type`, `title`, `description`, booleans default per `enabledByDefault`, numeric params carry `min`/`max`, `multiple` only on strings; `marketplace.json` has `description` and `source: './'`; `register.ts` contains `export const register`, the section id `<pluginName>:profile-rules`, `.catch(` after both gating hooks, no `require(` / `import(`; `register.test.ts` contains five `test(` for the full bundle and only one for a bundle holding a single `focus-timer` proposal; `stripEvidence` removes evidence; `leakCheck` finds no canary under `plugin/` (name this test `principle-6-no-leak: evidence never reaches plugin/`) and finds it when a canary is injected into a module string (negative control); PROPOSALS.md has every quote inside a fenced block and no `<img`; emitting twice gives byte-identical contents (A8); `writePluginFolder` into `os.tmpdir()` creates the files and returns the sorted list; when `claude` is on PATH, `spawnSync('claude', ['plugin', 'validate', '--strict', dir])` exits 0 and `spawnSync('claude', ['plugin', 'test', dir])` exits 0 for the emitted `plugin/` of the full bundle, else the test fails with "claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip" unless that variable is set (then it is skipped by name).

Return only the unified diff (new files only).
