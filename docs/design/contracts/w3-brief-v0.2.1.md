# DESIGN.md v0.2.1 excerpt for W3 (emitter and templates)

Sections the emitter implements against. The full document is in the repository.

### 5.3 Recipe (one entry of the catalog)

```js
{
  id: 'lead-with-answer',                       // kebab-case, unique, frozen in §6
  title: { ja: string, en: string },
  summary: { ja: string, en: string },          // one sentence: what the mod will do
  sections: SectionKey[],                       // sections where a hit is 'high' confidence
  triggers: [ { lang: 'ja'|'en'|'any', pattern: RegExp, cell?: 'left'|'right'|'any' } ],   // cell: which table cell a row trigger reads (default 'any')
  unless:   [ { lang: 'ja'|'en'|'any', pattern: RegExp } ],   // a line matching any of these is not a hit (negation and polarity, §6); applied regardless of the profile language (safe side; `lang` is informational)
  mechanisms: ('prompt.compose'|'prompt.submit'|'tool.call'|'turn.start'|'turn.complete'|'session.start'|'ui.status'|'ui.toast'|'ui.log'|'clock'|'command'|'store')[],
  template: 'compose-rule'|'submit-detector'|'publish-guard'|'running-indicator'|'resume-brief'|'focus-timer',
  rule?: { en: string },                        // compose-rule recipes: the imperative sentence(s) injected; placeholders {min} {max} {max_lines} (numbers), {language} (filled with the language NAME: Japanese / English), {max_chars_clause} (filled with '' when max_chars is 0, else ' and within N characters')
  note?: { en: string },                        // submit-detector recipes: the context line attached to a detected prompt
  params: { [name]: { type: 'number'|'boolean'|'string', default, title: {ja,en}, description: {ja,en}, min?, max?, multiple?: boolean, options?: string[] } },
  deriveParams?: (hits, profile) => Partial<params values>,   // may return ONLY bounded numbers (clamped to min..max) and strings that are one of `options`; never free text
  evidence: [ { kind: 'prior-art'|'research'|'author', ref: string, note: string } ],
  metrics: string[],                            // event names this recipe may count (see EVENT_NAMES in the catalog)
}
```

No `title`, `summary`, `rule`, `note` or `description` text may contain a forbidden term of Appendix A (en list); a catalog test checks it.

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

| `receive-only-fragments` | boundaries, care | 短文断片／受け取るだけ／(まず|ただ)受け取／押し返さず ; just acknowledge／receive it／no advice when I say／don't push back | submit-detector: the trimmed prompt is at most `max_chars` and matches a phrase **as a whole utterance**: equal to the phrase, or the phrase followed only by punctuation, whitespace and at most 6 characters of hiragana/katakana particles (ね・よ・な・わ・です・ます・だ) → context note. A phrase inside a longer request never matches | max_chars (24, 4..80), phrases (string, multiple; defaults 眠い,疲れた,落ち込んでる,つらい,しんどい,tired,exhausted,feeling down; never derived) | detected |
| `respect-stop-signals` | boundaries, care | (一旦やめる|あとで|終わり|おわり) + (シグナル|合図|と言ったら|と打ったら|出したら)／立ち止まり／距離を取 ; stop for now／that's enough／wrap up／let's stop ; unless stop words／pause the timer | submit-detector: the trimmed prompt is at most 40 characters and matches a phrase as a whole utterance (same rule as receive-only: phrase + punctuation + at most 6 trailing particles) → context note; **takes precedence** over receive-only when both match (one note only). 「あとで見返せるように要約して」 and "wrap up this function into a module" never match | phrases (multiple; defaults 一旦やめる,あとで,終わり,おわり,一旦ここまで,stop for now,that's enough,let's stop,wrap up; never derived) | detected |
Shared toast cooldown (frozen): the module raises at most one toast per 60 seconds across recipes; a suppressed toast is counted under the recipe's event `suppressed`.

Rule texts (`rule.en`) and notes (`note.en`) are English imperative sentences written in the catalog, not copied from the manual, and free of forbidden terms. They are joined into **one** section `{ id: '<pluginName>:profile-rules', text, scope: 'session' }` appended after what `next(e)` answered, headed by one line that says the rules come from the user's own manual and must not be used to infer anything about their health.

Evidence to cite (`evidence`): `ayghri/i-have-adhd` and Vella & Blincoe (arXiv 2605.23135) for `lead-with-answer` and `one-next-step`; `shaheer-00/claude-adhd` anti-nag rules for the cooldown and `focus-timer`; the copresence study (arXiv 2609.21254) and cogsync's "re-read on every switch" for `running-indicator` and `session-resume-brief`; `ravila4/claude-adhd-skills` nudges for `focus-timer`; KOKORO SPEC §1.2/§7 for `no-psych-framing`; the author's kokoro.md y/n gate for `publish-guard`.

## 7. Generated module (`hooks/register.ts`)

Frozen structure; the implementer writes the bodies. `docs/design/golden/plugin/hooks/register.ts` shows the proven idioms (section append, deny before `next`, context attach, `.catch` on every gating hook).

```ts
import type { Register } from 'claude-code'
type Options = { /* one field per userConfig key, typed; string multiple -> readonly string[] */ }
const PLUGIN = '<pluginName>'
export const register: Register = (on, options) => {
  const o = options as unknown as Options
  // metrics: one promise chain; bump($, recipe, event) never throws
  // 1. prompt.compose (only when a compose-rule proposal exists): const r = await next(e); return { sections: [...r.sections, { id: PLUGIN + ':profile-rules', text, scope: 'session' }] } or r when no rule is enabled
  // 2. prompt.submit (only when a submit-detector proposal exists), with .catch(($, e, next) => next.called ? next(e) : next(e)): stop-signals first, then receive-only; a hit attaches ONE note: return next({ ...e, context: [...(e.context ?? []), NOTE] })
  // 3. tool.call { tool: 'Bash' } (publish-guard): validate options and read the grant BEFORE next; a store read that throws denies; .catch(($, e, next) => next.called ? next(e) : { deny })
  // 4. turn.start / tool.call (any) / turn.complete (running-indicator, lead-with-answer counter, resume-brief save); observers wrap their bodies in try/catch and always return next(e)
  // 5. session.start: remember isInteractive and cwd; register the command; resume-brief log; focus-timer start
  // 6. command.run { command: 'kokoro-mods' }: status | export <abs path> | export --print | allow-publish [minutes] | focus <minutes> | reset; allow-publish is accepted ONLY when e.origin.kind === 'composer' (typed by the person) and minutes is an integer 1..720 (default allow_minutes); anything else answers the usage line
}
```

`claude plugin validate --strict` treats a gating hook without `.catch` as an error; `prompt.submit` and `tool.call` hooks therefore always carry one. `$.ui.status`, `$.ui.toast`, `$.ui.log`, `$.clock.every` are used only when `session.start` reported `isInteractive`. Nothing in the module reads `e.text`, `e.answer` or `e.command` into the store or into any output except the status line's tool name and the deny text's fixed sentence.

### 7.1 Generated tests (`hooks/register.test.ts`)

Emitted conditionally: test (1) always; the others only when their recipe is in the bundle. Idioms proven on 2.1.290 (golden file): `test(name, { options }, async ($, on) => ...)`; a bottom hook per dispatched event registered with `on`; `$.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })` (all fields required); `$.tool.call({ tool: 'Bash', command })`; `$.prompt.submit({ text })`; `mock.store(on, {})`, `mock.clock(on)`.

1. The module loads with the manifest defaults (a compose dispatch answers).
2. compose: with the rule on, `result.sections` ends with `<pluginName>:profile-rules` and keeps the bottom's section first; with every rule off, the bottom's sections come back unchanged.
3. publish-guard: the bottom `tool.call` hook records every command it receives; `git push origin main` is denied (`deny` mentions `allow-publish`) and the bottom never saw it; `ls` passes and the bottom saw exactly `ls`; with a grant in the store (`publishAllowedUntil` in the future, `mock.clock`), `git push` passes.
4. submit detectors: the bottom `prompt.submit` hook records `e.context`; `眠い` arrives with one note; a long ordinary prompt arrives with none; a stop phrase arrives with the stop note only.
5. export: `$.command.run({ command: 'kokoro-mods', args: 'export --print' })` answers JSON that parses and whose keys and string values are only those of §5.6 (the test embeds the allowed sets).

