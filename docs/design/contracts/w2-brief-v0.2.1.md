# DESIGN.md v0.2.1 excerpt for W2 (catalog, matcher, diff)

The sections of the frozen design that W2 implements against. The full document is in the repository; where this excerpt and the prompt differ, the design wins.


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

### 5.4a Ranking and parameters (frozen)

- Candidate lines: `kind` in `bullet`, `row`, `text`; never `comment`, `heading`, `blank`; never `inExample`; never in section `history`.
- A recipe hits a line when some trigger whose `lang` is `any` or equals `profile.language` matches the line (`text` for bullets and text; for rows the cell the trigger names: `left`, `right`, or both for `any`) and no `unless` pattern matches `text`.
- Confidence: `high` when the section is in `recipe.sections` and the format is `kokoro` or `torisetsu`; `medium` when the section is elsewhere, or for any hit in a `generic` profile with a known section; `low` when the section is `unknown`.
- Evidence: the first three hits in line order, except that a hit whose line contributed a derived parameter is always included (it replaces the last entry when the cap is reached) so every value can be traced to a quoted line; `quote = raw`, `matched` = the matched substring of the text that matched.
- Order: confidence (high > medium > low), then evidence count (descending), then catalog order. `enabledByDefault = true` for the first `maxEnabled` proposals only (default `DEFAULT_MAX_ENABLED` = 3; 0 allowed; `Infinity` allowed via `--all`).
- Params: the recipe defaults, overridden by `deriveParams(hits, profile)`; a derived number is rounded to an integer and clamped to `min..max`; a derived range with min > max is ignored; a derived string not in `options` is ignored; when several hits derive different values, the first hit in line order wins.
- Same profile → deep-equal proposals.



### 5.7 Diff (frozen)

```js
diffProposals(before, after)  // Bundle or { proposals } inputs
  -> { added: string[], removed: string[], changed: [ { recipeId, fields: ('params'|'evidence'|'enabledByDefault'|'confidence')[] } ], same: string[], hasChanges: boolean }
```

Ids sorted in every array; `evidence` compares the sequence of `quote`s; `params` deep-equal. `formatDiff(diff, { lang })` renders it for the CLI.


## 6. Recipe catalog v0.2 (17 recipes)

Trigger patterns are case-insensitive; ja patterns match substrings, en patterns use `\b`. Each recipe needs at least two ja and two en triggers, `unless` entries for the stated negations, and a test with one positive and one polarity-negative line per language. Polarity rule: a line that asks for the **opposite** behaviour must not trigger (`誤字は訂正して(ください)?` without `ない` must not trigger `accept-typos-as-intent`; `短くしないで` must not trigger `lead-with-answer`; "do correct my typos" likewise). In the DO/DON'T table, "avoid" wording in the left cell is read as a request for the right cell's behaviour: a trigger that reads the left cell must be one whose recipe implements the opposite of what the cell names (the design names these with `cell: 'left'`).

| id | high in | triggers (abbreviated) | mechanism | params | counts |
|---|---|---|---|---|---|
| `lead-with-answer` | style, care | 結論(を|は)?(先|最初)／要点先行／簡潔／短く／N字程度 ; answer first／bottom line first／concise／brief／keep it short／TL;DR ; unless 急がない／短くしないで／not too short | compose-rule; turn.complete counts answers longer than `max_lines` | max_lines (12, 3..200), max_chars (0 = off, 0..20000; derived from "N字/N chars") | long_answers |
| `accept-typos-as-intent` | style | 誤字／表記揺れ／訂正しない／ローマ字 ; typo／misspell／don't correct／romaji ; unless 訂正して(ほしい|ください)(?!.*ない)／please correct／do correct | compose-rule | — | — |
| `response-language` | style, boundaries | 日本語で(返|答)／常に日本語 ; respond in／always answer in／reply in | compose-rule | language (string, options ['ja','en'], derived: 日本語|Japanese→ja, 英語|English→en) | — |
| `one-next-step` | style, care, weak | 次の一手／一つずつ／小さく分け／最初の一歩 ; one next step／one thing at a time／smallest next action／break it down | compose-rule (end with exactly one concrete next action; chunk big tasks) | — | — |
| `receive-only-fragments` | boundaries, care | 短文断片／受け取るだけ／(まず|ただ)受け取／押し返さず ; just acknowledge／receive it／no advice when I say／don't push back | submit-detector: the trimmed prompt is at most `max_chars` and matches a phrase **as a whole utterance**: equal to the phrase, or the phrase followed only by punctuation, whitespace and at most 6 characters of hiragana/katakana particles (ね・よ・な・わ・です・ます・だ) → context note. A phrase inside a longer request never matches | max_chars (24, 4..80), phrases (string, multiple; defaults 眠い,疲れた,落ち込んでる,つらい,しんどい,tired,exhausted,feeling down; never derived) | detected |
| `respect-stop-signals` | boundaries, care | (一旦やめる|あとで|終わり|おわり) + (シグナル|合図|と言ったら|と打ったら|出したら)／立ち止まり／距離を取 ; stop for now／that's enough／wrap up／let's stop ; unless stop words／pause the timer | submit-detector: the trimmed prompt is at most 40 characters and matches a phrase as a whole utterance (same rule as receive-only: phrase + punctuation + at most 6 trailing particles) → context note; **takes precedence** over receive-only when both match (one note only). 「あとで見返せるように要約して」 and "wrap up this function into a module" never match | phrases (multiple; defaults 一旦やめる,あとで,終わり,おわり,一旦ここまで,stop for now,that's enough,let's stop,wrap up; never derived) | detected |
| `no-psych-framing` | boundaries, care | 心理学的(な)?フレーミング／問診／心理学的に解釈／臨床的(な)?助言は不要 ; psychological framing／psychoanalyze／no medical questions／not my therapist | compose-rule | — | — |
| `publish-guard` | boundaries, care | 外部公開／push／PR／Issue と (y/n|確認) ; before (you )?(push|publish)／ask before／confirm before／never push without ; unless push notification／push通知 | tool.call on Bash: deny when the command matches a pattern and no valid grant exists; deny text tells the model to ask the person | allow_minutes (30, 1..720), patterns (multiple; defaults `\bgit\s+(-C\s+\S+\s+)?push\b`, `\bgh\s+(pr|issue)\s+create\b`, `\bgh\s+repo\s+(create|edit|delete)\b`, `\bgh\s+release\s+create\b`, `\bnpm\s+publish\b`; never derived). Unprotected: tools other than Bash, scripts that push internally; PROPOSALS.md says so | denied, allowed |
| `quiet-confirmations` | care, style | 過剰確認／念のため確認／確認せず(に)?(即|実行)／都度確認不要 ; don't ask for confirmation／just do it／stop checking in／over-confirm | compose-rule; the rule names the fixed gates it keeps: publishing (push/PR/issue/release), deleting files or data, payments, anything the user's manual lists | — | — |
| `offer-options` | decision, style | [2２]〜[4４]案／複数案／並列で.*案／比較してから ; (two|2) to (four|4) options／compare options／alternatives／one option | compose-rule | min (2, 2..4), max (4, 2..6; derived from "N〜M案") | — |
| `plain-language` | care, style | 専門用語(を)?(避け|使わない|言い換え)／平易 ; plain language／avoid jargon／explain terms | compose-rule | — | — |
| `expert-role-with-evidence` | style | 専門家ロール／根拠.*反証／(博士|専門家)として ; expert role／as a (physicist|professor|specialist)／evidence and falsifiability | compose-rule | — | — |
| `trace-offers` | style, care | 痕跡を残す／Issue 化／memory 化／worklog／記録(に|を)残す提案 ; suggest where to record／offer to file an issue／leave a trace | compose-rule | — | — |
| `running-indicator` | weak, care | 動いてるかどうか分からない／動いているか／バックグラウンド継続／不確実 ; still running／can't tell if／background work／uncertainty about progress | turn.start: remember start, reset the tool counter, schedule `$.clock.after(long_turn_seconds*1000)` toast; tool.call (every tool, main loop only: skip when `e.agentId` is set): count and `$.ui.status("running Ns · N tools · last: <tool>")`; turn.complete: cancel the timer, clear the status, count `long_turns` when the toast fired | long_turn_seconds (120, 10..3600) | long_turns |
| `block-ahead-warning` | weak, care | 認証／PAT／承認ダイアログ／手数が増える／失速 ; auth prompts／permission dialogs／approval fatigue／too many prompts | compose-rule | — | — |
| `session-resume-brief` | about, weak | 複数(の)?プロジェクト.*並行／切替／読み直(し|す) ; several projects／context switch／re-read／pick up where | **metadata only**: turn.complete stores `{ at, turns }` per cwd; session.start (interactive) logs `last time here: N days ago, M turns` via `$.ui.log` | — | resumed |
| `focus-timer` | weak, style, focus | 休憩／時間を忘れ／過集中／タイマー ; break reminder／hyperfocus／lose track of time／pomodoro ; unless no timer／don't remind／リマインド不要 | `$.clock.every(interval)` toast in interactive sessions; **idle suppression**: no toast unless a turn completed since the previous tick; `/kokoro-mods focus <minutes>` restarts | interval_minutes (50, 5..180; derived from "N分") | ticks |

Shared toast cooldown (frozen): the module raises at most one toast per 60 seconds across recipes; a suppressed toast is counted under the recipe's event `suppressed`.

Rule texts (`rule.en`) and notes (`note.en`) are English imperative sentences written in the catalog, not copied from the manual, and free of forbidden terms. They are joined into **one** section `{ id: '<pluginName>:profile-rules', text, scope: 'session' }` appended after what `next(e)` answered, headed by one line that says the rules come from the user's own manual and must not be used to infer anything about their health.

Evidence to cite (`evidence`): `ayghri/i-have-adhd` and Vella & Blincoe (arXiv 2605.23135) for `lead-with-answer` and `one-next-step`; `shaheer-00/claude-adhd` anti-nag rules for the cooldown and `focus-timer`; the copresence study (arXiv 2609.21254) and cogsync's "re-read on every switch" for `running-indicator` and `session-resume-brief`; `ravila4/claude-adhd-skills` nudges for `focus-timer`; KOKORO SPEC §1.2/§7 for `no-psych-framing`; the author's kokoro.md y/n gate for `publish-guard`.


## Appendix A: content-check patterns (frozen; ja = substring, ASCII tokens bounded by `(?<![A-Za-z0-9])…(?![A-Za-z0-9])`, flags `iu`)

- `F-DIAGNOSIS` (ja; the ASCII abbreviations ADHD, ASD, HSP, ADD, OD, DAN, IQ, FSIQ, DSM are matched case-sensitively in upper case, every other token case-insensitively): ADHD, ASD, HSP, 自閉症, 自閉スペクトラム, 神経発達症, 発達障害, 学習障害, 知的障害, 精神障害, 気分障害, 睡眠障害, 愛着障害, 抑うつ, 抑鬱, (うつ|鬱)(病|状態|傾向|っぽい|気味|症状), 双極性, 双極症, 統合失調, PTSD, パニック(障害|症), 強迫性, 強迫症, 社交不安, 全般性不安, 適応障害, 摂食障害, 依存症, 人格障害, 境界性, 不安障害, DSM, ICD-?1[01], F-codes only in their decimal form F[0-9]{2}\.[0-9] (so `F12` the key is not one) ; (en): ADD, autism, autistic, dyslexia, dyslexic, bipolar, schizophrenia, schizophrenic, OCD, personality disorder, depressive disorder, major depression, anxiety disorder, panic disorder, eating disorder, asperger.