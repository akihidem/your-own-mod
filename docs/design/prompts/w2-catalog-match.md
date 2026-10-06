# Work package W2: recipe catalog, matcher, proposal diff

You implement one node of a parallel plan. You may create or change only these files:

- `src/catalog/index.mjs` (new)
- `src/match.mjs` (new)
- `src/diff.mjs` (new)
- `test/match.test.mjs` (new)
- `test/diff.test.mjs` (new)

The attached `docs/design/DESIGN.md` is the frozen contract; `src/constants.mjs` is attached and must be imported. Read §5.1 (Profile, your input shape), §5.3 (Recipe), §5.4 (Proposal, Bundle), §5.4a (ranking, frozen), §5.7 (Diff, frozen), §6 (the catalog, 17 recipes), §8 (A7), §10. DESIGN.md is v0.2; where this prompt and DESIGN.md differ, DESIGN.md wins. Another worker writes the parser in parallel: **your tests must build Profile objects by hand** (write a small helper `profileFrom(lines)` in the test file that turns `[{section, kind, text}]` into a Profile with sequential line numbers and `raw = text`). Do not read `fixtures/` and do not import `src/profile.mjs`.

## Environment and style

Node.js 20+, ES modules, zero dependencies, `node:test` + `node:assert/strict`, run as `node --test test/match.test.mjs test/diff.test.mjs`. JSDoc on every export; short *why* comments on non-obvious choices (trigger patterns especially: say what false positive each `unless` prevents). No network, no fs writes.

## `src/catalog/index.mjs`

```js
export const RECIPES            // Recipe[] in the exact order of DESIGN §6 (17 entries, ids verbatim)
export const RECIPE_IDS         // string[]
export const TEMPLATE_KEYS      // ['compose-rule','submit-detector','publish-guard','running-indicator','resume-brief','focus-timer']
export const EVENT_NAMES        // every distinct metrics event name across recipes, sorted
export function getRecipe(id)   // Recipe | undefined
```

Recipe shape = DESIGN §5.3 **plus** these frozen fields:
- `template`: one of `TEMPLATE_KEYS`. Mapping: `compose-rule` for lead-with-answer, accept-typos-as-intent, response-language, one-next-step, no-psych-framing, quiet-confirmations, offer-options, plain-language, expert-role-with-evidence, trace-offers, block-ahead-warning; `submit-detector` for receive-only-fragments, respect-stop-signals; `publish-guard`; `running-indicator`; `resume-brief` for session-resume-brief; `focus-timer`.
- `rule: { en: string }` for every `compose-rule` recipe: one or two imperative English sentences the generated mod will inject into the system prompt. Write them for a model reader: concrete, no diagnosis words, no pleading. `offer-options` and `response-language` and `lead-with-answer` rules contain `{min}`, `{max}`, `{language}`, `{max_lines}` placeholders that the emitter fills from params. Example for accept-typos-as-intent: "Treat typos, inconsistent spelling and unconverted romaji as the intended text. Do not point them out or correct them."
- `note: { en: string }` for every `submit-detector` recipe: the context line attached to a detected prompt (DESIGN §6 says what it must convey).
- `rule.en`/`note.en` and every title/summary must not contain any of the forbidden terms of DESIGN §5.2 (a test checks this with the en list: ADHD, autism, dyslexia, bipolar, depression, anxiety disorder, therapist, doctor).
- `deriveParams` may return only bounded numbers (the matcher clamps to min..max) and strings listed in the param's `options`; never free text (DESIGN §5.3, §5.4a). `lead-with-answer`: a hit containing `(\d{2,4})\s*(字|chars|characters|words)` sets `max_chars`; `offer-options`: `([2-9２-９])\s*[〜～~–-]\s*([2-9２-９])` sets `min`/`max` (full-width digits converted); `focus-timer`: `(\d{1,3})\s*(分|min)` sets `interval_minutes`; `response-language`: 日本語|Japanese→'ja', 英語|English→'en', else the profile language (param `options: ['ja','en']`). `phrases` and `patterns` are never derived from the manual.
- `evidence`: at least one entry per recipe, using the references listed in DESIGN §6 (prior-art repos, the longitudinal study, the copresence study, cogsync, KOKORO SPEC).
- Triggers: for every recipe at least two `ja` and two `en` patterns following §6; row triggers may set `cell: 'left'|'right'` (DESIGN §5.3, §6 polarity rule); `unless` patterns for negation and polarity (cover at least: 「結論を急がないで」「短くしないで」 must not trigger lead-with-answer; 「誤字は訂正してください」 and "please do correct my typos" must not trigger accept-typos-as-intent; "push notifications"/「push通知」 must not trigger publish-guard; "stop words" must not trigger respect-stop-signals; "I don't need a break reminder", "no timer", 「リマインド不要」 must not trigger focus-timer).

## `src/match.mjs`

```js
export function matchRecipes(profile, recipes = RECIPES, { maxEnabled = DEFAULT_MAX_ENABLED } = {})  // -> Proposal[] (ranked)
export function buildBundle(profile, proposals, { file, sha256, pluginName, files = [] })             // -> Bundle (DESIGN §5.4), proposals as given, notMatched computed (sorted), files as given (sorted)
export function slugFor(profile, { name } = {})                                                      // kebab-case ascii slug, 'profile' fallback; used for pluginName 'kokoro-mods-<slug>'
```

Matching rules (each a test):
- Candidate lines: `kind` in `bullet`, `row`, `text`; never `comment`, `heading`, `blank`; never `inExample`; never in section `history`.
- A recipe hits a line when any trigger whose `lang` is `'any'` or equals `profile.language` matches the line (`text` for bullets and text; for rows the cell the trigger names, both for `'any'`), and no `unless` pattern matches `text`.
- Confidence: `high` when the line's section is in `recipe.sections` and the profile format is `kokoro` or `torisetsu`; `medium` when the section is elsewhere, or for any hit in a `generic` profile with a known section; `low` when the section is `unknown`.
- Evidence: up to 3 hits in line order; `quote = line.raw` (the exact source line), `matched` = the matched substring of the text that matched. Never empty.
- Ranking: confidence (high > medium > low), then evidence count (desc), then catalog order. `enabledByDefault = true` for the first `maxEnabled` proposals only (`maxEnabled` 0 means none; `Infinity` allowed).
- Params: recipe defaults, overridden by `deriveParams(hits, profile)`; numbers clamped to `min..max`, strings ignored unless in `options`; when several hits derive different values the first hit in line order wins.
- Determinism: same profile → deep-equal proposals.
- `slugFor`: `name` option → frontmatter `name` → the title → `'profile'`; lowercase, ascii letters/digits/hyphens only, collapse runs, trim hyphens, max 40 chars; non-ascii titles fall back to `'profile'`.

## `src/diff.mjs`

```js
export function diffProposals(before, after)   // Bundle | { proposals } inputs -> { added: string[], removed: string[], changed: [{ recipeId, fields: string[] }], same: string[], hasChanges: boolean }
export function formatDiff(diff, { lang = 'en' } = {})   // multi-line string for the CLI (ja/en)
```

`fields` lists which of `params`, `evidence`, `enabledByDefault`, `confidence` differ (deep compare; evidence compared on `quote` sequence). Ids are sorted in every array.

## Tests

`test/match.test.mjs`: one `ja` and one `en` positive line plus one polarity-negative line per recipe (17×2×2, table-driven), each positive asserting the recipe id, `quote === raw`, and `matched` is a substring of the quote; the `unless` cases above are negatives; a row trigger with `cell` reads only that cell; `history` lines never match; `inExample` and `comment` lines never match; confidence table (high/medium/low) with three profiles; ranking and `maxEnabled` (0, 2, default); `deriveParams` for the five recipes; `slugFor` cases; `buildBundle.notMatched` equals the ids without proposals; `EVENT_NAMES` sorted and non-empty; forbidden-term scan of titles/rules; a test named `principle-1-profile-driven: every proposal quotes a verbatim line`.

`test/diff.test.mjs`: added/removed/changed/same on hand-built bundles; `hasChanges` false for identical input; `formatDiff` mentions each id once.

Return only the unified diff (new files only).
