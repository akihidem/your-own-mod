# DESIGN.md v0.2.4 excerpt for W2 round 3b (matcher)

### 5.1 Profile (output of `parseProfile`)

```js
{
  format: 'kokoro' | 'torisetsu' | 'generic',   // frontmatter `format`, else `format_version` (the key the KOKORO spec uses), starting with kokoro / torisetsu; else 'generic'
  language: 'ja' | 'en',                         // frontmatter `language` when ja/en, else CJK ratio >= 0.2 -> 'ja'
  frontmatter: { [key: string]: string } | null, // flat `key: value` lines between the leading `---` fences
  title: string | null,                          // first `# ` heading
  sections: [ { num: number|null, key: SectionKey, heading: string, startLine: number, endLine: number } ],
  lines: [ {
    line: number,            // 1-based line number in the file
    section: SectionKey,     // 'unknown' before the first heading
    sectionIndex: number,    // index into `sections` (-1 before the first heading); the stable way to tell sections apart when keys repeat
    kind: 'frontmatter' | 'heading' | 'bullet' | 'row' | 'text' | 'comment' | 'code' | 'blank',   // frontmatter lines and fenced code lines are never matched and never quoted (F rules still scan their raw text)
    raw: string,             // the line exactly as in the file (no newline)
    quote: string,           // `raw` with every inline HTML comment removed (equals `raw` when the line has none); what evidence quotes, so a private comment inside a bullet is never quoted
    text: string,            // content without list marker / table pipes / blockquote marker, trimmed; '' for blank and comment
    depth: number,           // bullet nesting depth (0 for everything else)
    cells?: string[], left?: string, right?: string,   // table rows: every cell trimmed; left/right = the first two (the DO/DON'T table of §5)
    inExample: boolean       // true inside a `###` subsection whose heading contains an EXAMPLE_HEADING_MARKERS entry
  } ]
}
```

`SectionKey = 'boundaries' | 'about' | 'strengths' | 'style' | 'care' | 'weak' | 'focus' | 'decision' | 'history' | 'unknown'` (values and the number map live in `src/constants.mjs`). `parseProfile(text)` takes the text alone (the file name is not part of the profile).

Section detection: `## N. title` (ASCII or full-width stop) maps by number (`SECTION_BY_NUMBER`). An unnumbered `##` heading maps by keyword (`HEADING_KEYWORDS`, case-insensitive substring, first key in object order wins; nothing → `unknown`). `###` headings do not start a section; when the `###` text contains an `EXAMPLE_HEADING_MARKERS` entry, every line until the next `##`/`###` is `inExample: true`. HTML comments (`<!-- ... -->`, one line or several) become `comment` lines when the line is nothing but comment; an inline comment inside a line of another kind is removed from `text` and `quote` (the kind stays). Comment lines are never matched and never quoted, but scanned by the forbidden-content check. A `generic` profile with no `##` heading at all has every line in section `unknown`; it is still usable (low-confidence proposals).

`text` is produced by stripping markers from the ends only (list marker, `> `, table pipes, surrounding spaces) and removing an inline HTML comment (`<!-- … -->` inside a line leaves the line's kind unchanged; only a line that is nothing but comment is `comment`); inner characters are otherwise never altered. For a `row`, `text` is `cells.join(' | ')` (so `text` is **not** a substring of `raw` for rows; evidence therefore quotes `quote`, §5.4). A table starts only at a line that has outer pipes, or at a piped line immediately followed by a separator row (`|---|`); a prose line that merely contains `|` is text. Parsing details that the content check depends on (frozen): the text is NFKC-normalised for matching and checking (full-width `ＡＤＨＤ` is `ADHD`; curly apostrophes become `'`) while `raw` keeps the original bytes; a UTF-8 BOM and CRLF line ends are tolerated; frontmatter is the block between a first-line `---` and the next `---` within the first 40 lines whose inner lines are all `key: value`, blank or `#` comments (otherwise there is no frontmatter and a later `---` is a horizontal rule); frontmatter values may be quoted; `format` is `kokoro` when the value is `kokoro` or starts with `kokoro/`, likewise `torisetsu`; `format` is matched case-insensitively; `language` is case-insensitive and `ja-JP`/`ja_JP` count as `ja`, `en-US`/`en_GB` as `en`; a `<!--` inside backticks does not open a comment; fenced code (``` or ~~~) is `code`; a tab indents a bullet like two spaces and `depth` is an integer (`floor(indent / 2)`); a numbered `## N.` heading maps by number in `kokoro`/`torisetsu` profiles, and in a `generic` profile by keyword first and by number only when the keyword gives `unknown`.

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
  priority?: 'safety',                          // a safety recipe (publish-guard) ranks first and is enabled by default whenever it matches
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
  evidence: [ { line: number, section: SectionKey, quote: string, matched: string } ],  // quote === the line's `quote` (raw minus inline comments); 1..3 entries, never empty
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

### 5.4a Ranking and parameters (frozen)

- Candidate lines: `kind` in `bullet`, `row`, `text`; never `comment`, `heading`, `blank`; never `inExample`; never in section `history`.
- A recipe hits a line when some trigger whose `lang` is `any` or equals `profile.language` matches the line (`text` for bullets and text; for rows the cell the trigger names: `left`, `right`, or both for `any`) and no `unless` pattern matches **the same text the trigger matched** (for rows, the cell; a negation written in the left "avoid" cell never cancels a trigger that read the right cell). Every trigger that can read a row names its `cell` explicitly; `left` is allowed only for quiet-confirmations, offer-options, one-next-step, plain-language and trace-offers, and only for wording that names the thing to avoid (a noun phrase such as 「長い前置き」, never a negated verb). For `publish-guard` a waiver (`unless`) counts only when it is not itself negated and the line contains no asking word: 「確認せずにpushしないで」, "Don't push without asking", "Never publish with no confirmation", "Ask before pushing — never ever push without asking" are hits; when one line both asks for and waives confirmation, the guard wins (hit, confidence capped at medium).
- Confidence: `high` when the section is in `recipe.sections` and the format is `kokoro` or `torisetsu`; `medium` when the section is elsewhere, or for any hit in a `generic` profile with a known section; `low` when the section is `unknown`.
- Evidence: the first three hits in line order, except that a hit whose line contributed a derived parameter, and the first hit that determined the proposal's confidence, are always included (each replaces the last entry when the cap is reached) so every value and the confidence can be traced to a quoted line; `quote = line.quote`, `matched` = the matched substring of the text that matched.
- Order: safety recipes (`priority: 'safety'`) first, then confidence (high > medium > low), then evidence count (descending), then catalog order. `enabledByDefault = true` for the first `maxEnabled` proposals only (default `DEFAULT_MAX_ENABLED` = 3; 0 allowed; `Infinity` allowed via `--all`); a matched safety recipe is therefore on by default unless `maxEnabled` is 0. `maxEnabled` must be a non-negative integer or `Infinity` (anything else throws a `TypeError`).
- Params: the recipe defaults, overridden by `deriveParams(hits, profile)`; a derived number is rounded to an integer and clamped to `min..max`; a derived range with min > max is ignored; a derived string not in `options` is ignored; when several hits derive different values, the first hit in line order wins.
- Same profile → deep-equal proposals.
- Slug (`slugFor`): candidates in order `name` option → frontmatter `name` → frontmatter `user_alias` → the title; each is NFKC-normalised, lower-cased, reduced to ascii letters/digits/hyphens (runs collapsed, hyphens trimmed, at most 40 characters); a candidate that is empty after that, or that contains a forbidden term of Appendix A's English list, is skipped; when none remains the slug is `profile` and `slugSource` reports `fallback` so the CLI can tell the person to pass `--name`. The plugin name is `kokoro-mods-<slug>`.
- Derivation sources (frozen, from the catalog inspection): `lead-with-answer.max_chars` is derived only from a line that also names the reply (回答|返答|答え|説明|answers?|responses?|replies) and a bound word (以内|程度|まで|くらい|under|within|max|at most), never from 「コミットメッセージは50字以内」; `response-language` takes the language from the capture of the trigger that matched (`(日本語|英語)で(返|答)`, `(reply|respond|answer) in (japanese|english)`), not the first language name in the line, so 「コードのコメントは英語で、返答は日本語で」 → ja; `focus-timer.interval_minutes` only from `(\d+)\s*分(ごと|おき|毎|間隔)`, `every (\d+) ?min`, or `(\d+)\s*(時間|hours?)` × 60, on a line that mentions 休憩|break|remind|timer|タイマー|pomodoro|ポモドーロ; 「5分の休憩を1時間ごとに」 → 60.

### 5.7 Diff (frozen)

```js
diffProposals(before, after)  // Bundle or { proposals } inputs
  -> { added: string[], removed: string[], changed: [ { recipeId, fields: ('params'|'evidence'|'enabledByDefault'|'confidence')[] } ], same: string[], hasChanges: boolean }
```

Ids sorted in every array; `evidence` compares the sequence of `quote`s; `params` deep-equal. `formatDiff(diff, { lang })` renders it for the CLI.

