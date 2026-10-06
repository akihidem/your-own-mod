# Design review log

Commit hashes in this log and in `docs/design/inspections/` refer to the development history before publication, which is not part of this repository.

## 2026-10-06 design review of DESIGN.md v0.1 (reviewer: GPT-6 Astra on AWS via `ask-codex.sh ask -B astra`; 33 findings, 26 must-fix)

Full text: `docs/research/2026-10-06-design-review-astra.md`. Dispositions below; "folded" means the fix is in DESIGN.md v0.2.

| # | finding (short) | disposition |
|---|---|---|
| 1 | emitter has no access to catalog metadata | folded: `emitPlugin({ bundle, recipes })`; Recipe carries `template`, `rule`, `note` (§5.3, §5.5) |
| 2 | ranking undefined | folded: §5.4a (confidence, evidence count, catalog order, maxEnabled, param conflict = first hit wins, clamping) |
| 3 | quote vs table rows | folded: `quote = raw` line; matching uses `text`/cells (§5.1, §5.4) |
| 4 | checker lists missing | folded: Appendix A with complete bilingual patterns and boundary rule |
| 5 | Diff shape undefined | folded: §5.7 |
| 6 | rewrite identity tied to sha | folded: identity = `pluginName`; `files` list; atomic replace of owned paths; exit 5 only on a different pluginName (§5.4, §5.5, A11) |
| 7 | export schema rejects declared strings | folded: closed schema, `options` holds booleans and numbers only (§5.6) |
| 8 | counter concurrency | folded: one promise chain; export drains; `reset` defined (§5.6) |
| 9 | running-indicator wiring | folded: turn.start / tool.call (all tools, main loop) / clock.after toast during the turn / turn.complete cleanup (§6) |
| 10 | vacuous acceptance | folded: inventories, non-empty evidence, frozen expected recipe sets per fixture (A2–A4, A8) |
| 11 | leak oracle weak | folded: structural restriction + canaries (short, HTML, JSON-escaped) + real-fixture scan (A5) |
| 12 | A6 tests a substitute | partly folded: generated test 5 captures the real `export --print`; the Node side re-validates the captured text. Limit recorded in A6 |
| 13 | A9 test names, missing-tool conflict | folded: direct tests (offline imports, protected home, bounded) and one missing-tool policy (§4, A9) |
| 14 | free-text parameters | folded: deriveParams limited to bounded numbers and enum strings; phrases/patterns never derived; strings never exported (§5.3, §5.6, §6) |
| 15 | evidence inside the distributable | folded: `<out>/plugin/` is the distributable; PROPOSALS.* outside it (§5.5, A5) |
| 16 | resume text not local-only | folded: metadata only (at, turns), no answer text (§6) |
| 17 | active markdown in evidence | folded: quotes inside fenced code blocks, no HTML/images; A10 |
| 18 | exception disclosure | folded: `error: <CODE>: <message>` without input values; `--debug` for stacks (§9, A12) |
| 19 | prompt.compose result shape | folded: `{ sections }` everywhere; generated test asserts `result.sections` (§7, §7.1) |
| 20 | context attachment direction | folded: `next({ ...e, context: [...] })` only (§7) |
| 21 | guard guarantee | folded: validate and read the grant before `next`; failed store read denies; `.catch` idiom (§7) |
| 22 | config key hyphens, multiple | folded: `snake(recipeId) + '_' + param`; `multiple` only for strings (§5.5) |
| 23 | manifest authority | folded: schema summary in `api-digest-w3.md`; golden manifest + mod validated on 2.1.290 in `docs/design/golden/` |
| 24 | approval provenance | folded: `allow-publish` accepted only from `e.origin.kind === 'composer'`; minutes integer 1..720 (§7) |
| 25 | instruction polarity | folded: candidate lines exclude history/examples/headings; `unless` for negations; `cell` on row triggers; polarity-negative test per recipe (§5.4a, §6) |
| 26 | benign forbidden matches | folded: `myself` required for hanging; negation guard for override; two benign fixtures (Appendix A) |
| 27 | runtime phrase matching | folded: equals or starts-with, not substring; stop takes precedence; one note (§6) |
| 28 | publish patterns, named gates | folded: `git -C … push` pattern; unprotected paths stated; quiet-confirmations names fixed gates (§6) |
| 29 | generic manual rejection | folded: `F-STRUCTURE` only for kokoro/torisetsu; generic gets `W-NO-SECTIONS` and low-confidence proposals (§5.1, §5.2) |
| 30 | missing chunking recipe, timer limits | folded: `one-next-step` recipe (17 total); idle suppression and shared 60 s toast cooldown (§6) |
| 31 | testing declarations missing | folded: `api-digest-w3.md` carries the kit entry points; golden test proven on 2.1.290 |
| 32 | tests assume absent recipes | folded: generated tests are conditional (§7.1) |
| 33 | returned values do not prove interception | folded: bottom hooks record what reached them; deny asserted before the bottom (§7.1, golden test) |

Not adopted: none. Open: A6's Node-side check still validates captured text rather than driving the TypeScript module from Node (the module only runs inside Claude Code); the generated test is the primary check.

## 2026-10-06 inspection of W3 round 2, part A (emitter, manifest, module and report templates; reviewer: Claude on AWS Bedrock via `ask-aws.sh`; verdict FAIL with 1 high)

| finding | disposition |
|---|---|
| high: string params without `options` reach `plugin.json` unchecked and `leakCheck` is not wired into `emitPlugin` | folded into DESIGN §5.5 (free-string params must equal the recipe default; `leakCheck` runs inside `emitPlugin` and throws); sent to W3 round 3 |
| medium: profile file name in manifest descriptions | folded (sha prefix only); W3 round 3 |
| medium: `export <path>`, `reset`, `focus` accept any origin | folded into §7 (composer only for state-changing subcommands); W3 round 3 |
| medium: `matchesPhrase` tail accepts any kana (「あとでテストして」 matched); en phrases case-sensitive; symbols not allowed | folded into §6 (closed particle set, normalisation); W3 round 3 |
| low: patterns type unchecked, NaN timers, relative outDirName, fence-inner escaping, empty needles | W3 round 3 |
| low: `.catch` replay could run Bash twice | not adopted: the plugin API states that `next(e)` after `next.called` replays the settled result and runs nothing twice (plugin-authoring reference, "Developing one") |

## 2026-10-06 inspection of W3 round 2, part B (generated-test template and Node tests; reviewer: Claude on AWS Bedrock; verdict FAIL with 1 high)

| finding | disposition |
|---|---|
| high M-1: phrase tail accepts any kana (「あとでテストして」 matched) | folded (closed particle set, §6 v0.2.2); W3 round 3 with the reviewer's negatives as regression cases |
| medium P-1/P-2: param strings and file name reach plugin.json | same as part A; W3 round 3 |
| medium P-3/P-4: canaries cover only 4 of 7 quotes; `matched` not checked outside fences | W3 round 3 (canaries derived from every quote and matched; matched rendered inside the fence) |
| medium T-1..T-3: submit tests read only the last record; export test not always emitted; no fail-closed / expired-grant test | W3 round 3 |
| medium N-1: claude-backed test accepts exit 0 with zero tests | W3 round 3 (assert the counts) |
| low M-2/M-3, D-1..D-3, T-4/T-5, overclaiming test names | W3 round 3 |

## 2026-10-06 inspection of W1 round 2 (parser, content check, tests, fixtures; reviewer: Claude on AWS Bedrock; part B verdict FAIL with 2 high; part A pending)

| finding | disposition |
|---|---|
| the `unknown`→`style` expectation change | judged by the reviewer a legitimate contract change, not a weakening (section keys never affect the F rules); the reviewer asked for per-keyword tests, and the keyword "how i like" was narrowed to "how i like answers" / "how i like replies" so "How I like to be supported" stays in `care` |
| high H1: en negation unbounded within a clause ("don't hesitate to ignore …" guarded) | folded into Appendix A (at most three words between negation and match); W1 round 3 |
| high H2: ja しない in conditional forms; prefix guard applied to ja | folded into Appendix A (exclusions と|か|なんて|では|限り; nothing before a ja match counts); W1 round 3 |
| medium M1: inline comments make `text` not a substring of `raw`, and quoting `raw` would expose a private comment | folded: lines carry `quote` (raw minus inline comments) and evidence quotes it (§5.1, §5.4); W1 round 3 and W2 round 3 |
| medium M3/M4/M5: evasions (zero-width, emphasis, entities, mixed width), NFKC does not straighten curly apostrophes, fixture line without a trigger | folded into Appendix A; W1 round 3 |
| medium M7: ICD-10-CM extensions | folded (F[0-9]{2}\.[0-9A-Z]{1,2}); W1 round 3 |
| medium M8: 「あなたは医者に行くよう勧めて」 false positive | folded (role-play form required); W1 round 3 |
| low L1-L5, M2, M6, paired guard tests, overclaiming test names | W1 round 3 |

## 2026-10-06 inspection of W1 round 2, part A (sources; reviewer: Claude on AWS Bedrock, 32 inputs reproduced by the reviewer; verdict FAIL with 4 high)

| finding | disposition |
|---|---|
| H1 ja prefix window exempts a later request; H2 suffix forms that are not negations; H3 en negation governs another verb; H4 normalisation gaps and no cross-line scan | all folded into Appendix A v0.2.3 (connector+stem+ending form for ja, three-word window for en, full pre-scan normalisation, adjacent-line scan); W1 round 3 |
| M1 lowercase adhd and katakana/old-kanji variants pass | folded (only ADD/OD/DAN upper-case-only; ウツ/欝 variants); W1 round 3 |
| M2 "you're a doctor", "act like" | folded; W1 round 3 |
| M3 「無効にしないで」 false positives | folded (connector and stem allowed before the negation); W1 round 3 |
| M4 F-STRUCTURE counts unknown sections | folded; W1 round 3 |
| M5 table starts on any piped line; M6 frontmatter swallows the body up to a later rule; M7 contract contradiction on inline comments | folded into §5.1; W1 round 3 |
| L1 homoglyphs, L3/L4 edge forms | not adopted for v0.1 (recorded as known limits) |
| the `unknown`→`style` change: part A could not verify; part B judged it legitimate | the keyword change is in `src/constants.mjs` (design-owned) and DESIGN.md records it in its commit message; per-keyword tests requested in W1 round 3 |

## 2026-10-06 inspection of W2 round 2, part B (matcher, diff, tests; reviewer: Claude on AWS Bedrock; verdict FAIL with 2 high)

| finding | disposition |
|---|---|
| high 1: for rows `unless` is tested on the joined text, so an avoid-cell negation cancels a right-cell trigger | folded into §5.4a (unless on the matched cell); W2 round 3 |
| high 2: publish-guard waivers cancel negated requests | folded into §5.4a (a waiver counts only when not itself negated; conflicts → the guard wins at medium); W2 round 3 |
| medium 3–6: waiver-wins test, guard pushed out of default-on slots, cells not explicit, confidence hit not quoted | folded (`priority: 'safety'`, explicit `cell` with a `left` allow-list, confidence hit quoted); W2 round 3 |
| low 7–10 | slug forbidden-term check and maxEnabled validation folded; W2 round 3 |

## 2026-10-06 inspection of W2 round 2, part A (catalog; reviewer: Claude on AWS Bedrock, patterns executed by the reviewer; verdict FAIL with 9 high)

| finding | disposition |
|---|---|
| H1–H4 publish-guard: en triggers miss "Ask me before pushing" etc.; waivers cancel requests; ja vocabulary narrow | folded into §6 (trigger forms, order words, waiver rules); W2 round 3 |
| M1 ja 確認 too broad | folded (before/after order required); W2 round 3 |
| M2–M4, L1–L3, M5 false positives (bare pause/wrap up/したら, 時間を忘れずに, receive it, 読み直, 不確実, 短く, bare 以上/at least) | folded into §6; W2 round 3 |
| H5 accept-typos on "point out my typos"; H6 offer-options left cell; H7 focus-timer on "don't interrupt me when I hyperfocus" | folded (unless lists, left-cell nouns); W2 round 3 |
| H8 max_chars from 「50字以内」; H9 response-language from the first language name; M6 focus-timer interval words | folded into §5.4a derivation sources; W2 round 3 |
| M7 one-next-step vs detector notes; M8 max_lines applied to code | folded into §6 rule texts; W2 round 3 |
| L4/L5 full-width digits, ja rule texts without placeholders | W2 round 3 |

## 2026-10-06 final inspection of the merged tree (reviewer: Claude Opus on AWS Bedrock via `ask-aws.sh review`, five chunks in parallel; reports `inspections/2026-10-06-final-{a,b,c,d,e}-aws-claude.md`; folded by the integrator in commits f51e368 (chunk A) and 49ed5d8 (chunks B–E), DESIGN v0.2.5)

### Chunk A: parser and content check (verdict FAIL, 4 high)

| finding | disposition |
|---|---|
| H1 tag removal swallowed `<ADHD>` | folded: the text before tag removal is scanned as well; only a real HTML tag (`<name …>`) is removed (Appendix A) |
| H2 entities decoded after NFKC and zero-width removal (`A&#8203;DHD`, `&#xFF21;DHD` passed) | folded: entities first, repeatedly (`&amp;` included), then NFKC, then invisible characters (Appendix A) |
| H3 en negation guard let any word stand between the negation and the verb ("don't forget to ignore") | folded: at most two words from the closed adverb set ever/really/just/please/even/also/again; dashes and parentheses end a clause (Appendix A) |
| H4 ja negation guard was a stop-list of conditions, so 「無視しないのはだめ」「無視しないでほしくない」 passed | folded: a bare ない must end the request (allow-list of endings); ないで/ず(に) open a subordinate clause and hold unless a demand follows (Appendix A) |
| M1 invisible characters beyond U+200B–U+200D (CGJ, U+2061) | folded: `\p{Cf}`, U+034F, variation selectors, control characters |
| M2 「カウンセラーとして振る舞わないでください」 was a hit | folded: a verb may stand between the role phrase and its negation |
| M3 `<!--` inside backticks opened a comment in the checker but not in the parser | folded: code spans are not comment markers |
| M4 「するな」 was accepted but not in the frozen stem set | folded into Appendix A (stem す) |
| L1 generic manual whose headings all map to `unknown` got no warning | folded: `W-NO-SECTIONS` counts recognised sections only |
| L2 `x_ADHD_y`, plurals (ADHDers), `F10.239` passed | folded: pre-emphasis scan, plural forms, `{1,4}` |
| L3 BOM in the first line's `quote` | already stripped by the parser (profile.mjs); verified |
| L4 an unclosed fence makes the rest `code` | recorded as a known limit (those lines are still scanned, never matched) |
| L5 `format: ""` fell through `??` | folded (`||`) |
| L6 `quote` collapses the spaces around a removed inline comment | recorded: A3 (quote equals the line on disk) holds for every line without an inline comment, which is what the fixtures and the test assert |

### Chunk B: recipe catalog (verdict FAIL, 2 high)

| finding | disposition |
|---|---|
| H1 waiver cancellation was a stop-list; 「確認なしのpushは厳禁」 "Avoid pushing without confirmation" lost the gate | folded: the matcher judges polarity; a waiver counts only with explicit permission and no prohibition in its clause (DESIGN §5.4a; catalog `unless: []`) |
| H2 `push notification` / 「push通知」 cancelled the whole line | folded: object-level lookahead `push(?!\s*(?:通知\|notifications?))` in the triggers |
| M1 「500文字以内」 not matched | folded: `(?:文字\|字)` in trigger, unless and derivation |
| M2 「短く答えないで」 "Don't be too brief" fired | folded: unless forms added |
| M3 max_chars from another object's limit (「ブランチ名は30字以内」) | folded: the reply word must stand within a dozen characters before the count (DESIGN §5.4a) |
| M4 accept-typos cancelled by an unrelated ない; 「誤字があったら教えて」 "point them out" fired | folded: negation right after the verb only; 教えて/知らせて/point them out/let me know added |
| M5 「常に英語の資料を読むが、返答は日本語で」 → en | folded: 常に(日本語\|英語)で(返\|答\|応答\|話) |
| M6 「タイマーを25分で入れて」 derived an interval outside the frozen sources | kept and frozen: a timer set to N minutes names the interval (DESIGN §5.4a, refreeze reason recorded) |
| M7 `cell: 'left'` triggers would invert bullets if the matcher read them there | folded: left-cell triggers read table rows only (matcher), bullets need their own verb (catalog); tested |
| L 「あとでPRを出したら確認して」 as a stop signal | folded: the signal word must follow the phrase directly |
| L "I work as a professor" selected the expert role | folded (unless) |
| L 「タイマーを使うのはやめて」 enabled the timer | folded (unless) |
| L bare 手数が増える / 失速 triggers missing | folded (triggers added) |
| L clause-wide `(?:ない\|不要)` unless forms cancel too much | recorded as a known limit (safe side: a proposal is dropped, never inverted) |
| L evidence defaults name the KOKORO spec on ten recipes; `cogsync` ref | recorded: the default is a provenance note, not a benefit claim; §6 lists the specific references |

### Chunk C: emitter, templates, generated plugin (verdict PASS with two conditions; both resolved)

| finding | disposition |
|---|---|
| M needles dropped every quote under 12 characters and all `matched` | folded: `leakNeedles` (every quote and matched, folded; short ones exempt only when the catalog, the templates or the plugin name contain them; DESIGN §5.5) |
| M `pluginName` not validated by the emitter (the first condition) | folded: `PLUGIN_NAME_PATTERN` enforced (`E_PLUGIN_NAME`); and the slug no longer derives from the manual (chunk E H1) |
| L other bundle fields unchecked | folded (`E_BUNDLE`: sha256, version, confidence, enabledByDefault, params) |
| L leak check ignored NFKC and case | folded |
| M a pattern that fails to compile silently stopped guarding | folded: all patterns compiled before any is tested; a bad list denies (module, golden plugin, DESIGN §7) |
| L boolean options had no default | folded (`BOOLEAN_DEFAULTS`) |
| L numbers not clamped at runtime | folded (`NUMBER_BOUNDS` in `normalizeOptions`) |
| M module-level state shared across registrations | folded (`resetState()` at the top of `register`) |
| L `PHRASE_SUFFIX` wider than the frozen set | DESIGN §6 revised to include ー・ぁぃぅぇぉっ (the second condition: DESIGN and code aligned) |
| L `$.session.cwd()` existence | verified in the 2.1.290 type declarations; the call is also wrapped in try |
| M composer gate not exercised by the generated tests | folded: the export test runs `reset` first and checks the refusal; the kit dispatches without a composer origin |
| L stop negatives proved nothing in a receive-only bundle | folded: negatives listed under their own detector |
| L compose test checked only the heading | folded: line count and placeholder check |
| L untested: invalid patterns, allow-publish range, cooldown, running, focus, resume | invalid patterns, the grant, reset and export are now executed through the real module by the Node runner (A6); cooldown, running, focus and resume remain untested in the generated tests (known limit) |

### Chunk D: matcher, diff, CLI, report, metrics (verdict FAIL, 1 high)

| finding | disposition |
|---|---|
| H1 publish-guard negation was a stop-list of negation forms | folded: permission-based polarity with prohibitions (DESIGN §5.4a); the six probe lines are tests |
| M1 unknown export keys echoed by name | folded: reported by position only |
| M2 `plugin` field accepted any string | folded: `PLUGIN_NAME_PATTERN`, 52 characters |
| M3 a rejected `--name` silently replaced | folded: usage error (exit 2) |
| M4 `parseProfile` not given the filename | DESIGN §4 corrected: `parseProfile(text)` takes the text alone (§5.1 already said so) |
| M5 `diff` printed unvalidated recipe ids | folded: `assertBundle` checks every field against the catalog before diff or re-run; messages name keys only |
| M6 exports of different plugins compared | folded: `E_EXPORT_MISMATCH`; a changed manual hash is a warning |
| L1 `paramsFor` throws with four source lines | unreachable with the v0.2 catalog (at most one derivation source per recipe, plus the confidence hit); the throw guards a future recipe |
| L2 `quote ?? raw` fallback | folded: a line without `quote` is a TypeError |
| L3 polarity judged per cell, DESIGN said per line | DESIGN §5.4a now says per cell |
| L4 numbers without bounds are dropped rather than clamped | recorded: every catalog number has bounds |
| L5 `suppressed` allowed for every recipe; options untyped; no count ceiling | folded: per-recipe events, typed options, safe integers |
| L6 `--help` exited 2 | folded: exit 0 |
| L7 temporary folder after SIGINT; no `.gitignore` in `<out>`; `--json` prints quotes | README states that `--json` output is private; no extra file is written (the owned layout is frozen); the SIGINT leftover is a known limit |
| L8 read errors did not name which export | folded (`before:` label) |
| L9 forbidden slug terms case-insensitive (dan, add, od) | folded earlier (those three are not slug terms) |

### Chunk E: README, package, CI, end-to-end tests (verdict FAIL, 1 high)

| finding | disposition |
|---|---|
| H1 the manual's name/alias/title became the plugin name and reached `plugin/` and exports | folded: slug from `--name` only, `profile` fallback (DESIGN §5.4a); README; A5c checks the identity fields and uses a four-character threshold |
| M1 the manual's hash sits in `plugin/` while the README called it private | folded: README states that `plugin/` and exports carry the SHA-256 and what it reveals |
| M2 no test that the terminal never shows manual text | folded: non-JSON `propose` and `check` on every fixture are scanned; the token in a finding message is kept by design (§5.2, §11) |
| M3 "offline" test ignored global `fetch` and other modules | folded: static checks widened; every command runs with a throwing `fetch` |
| M4 CI green when Claude failed to install; version floating | folded: pinned 2.1.290, `::warning::`, failure on main and tags |
| M5 `claude plugin test` judged by exit code only | folded: count and names checked |
| M6 golden export hand-written; `suppressed` for every recipe | folded: the module is executed under type stripping and its own export validated; `suppressed` per recipe |
| M7 Node 20 end of life; 24 untested | folded: Node ≥22, CI 22 and 24 |
| L1 exit-1 wording | folded |
| L2 "At most three" vs `--all` | folded ("By default") |
| L3 README claims without tests (diff on re-run, install path, recipes columns, option errors) | folded (tests added) |
| L4 determinism only in one process | folded (child process under another TZ and locale) |
| L5 `focus` wording differed between languages | folded |
| L6 resume key is the directory path | folded (README says so) |
| L7 facts tables lost the `\|` | folded |
| L8 `repository`/`homepage`/`bugs` missing | folded |
| L9 Claude ran with the developer's HOME | folded (empty temporary HOME) |
| L10 actions unpinned; `node --test test/` claim unverified | folded: commit hashes; the claim was removed |

## 2026-10-06 re-inspection of the fold (reviewer: Claude Opus on AWS Bedrock, eight focused requests against the diff 7b6e003..a91675c with the disposition tables attached; reports `inspections/2026-10-06-reinspect-{1..8}-aws-claude.md`; folded by the integrator in the following commit)

Verdicts as returned: 1 matcher FAIL (4 high, 1 conditional), 2 catalog FAIL (1 high), 3 matcher tests FAIL (2 high), 4 emitter PASS (3 medium), 5 emitter tests PASS (5 medium), 6 CLI/report/metrics PASS (2 medium), 7 end-to-end tests PASS (3 medium), 8 checker FAIL (1 high).

### 1 Matcher (`src/match.mjs`)

| finding | disposition |
|---|---|
| H-1 `EXPLICIT_WAIVER` was tested on the matched phrase, so its end-of-phrase lookahead always held and a bare 「確認なし」「確認せず」 counted as permission | folded: tested on the clause; the predicate forms carry their subject (「確認は不要」「pushは確認しない。」); 「確認なしのpushが心配」「確認せずにpushしてしまう癖がある」 keep the gate (DESIGN §5.4a) |
| H-2 a negated permission (「大丈夫じゃない」 "isn't ok") passed as permission | folded: negated permissions are prohibitions |
| H-3 a prohibition after a comma was cut off from the waiver's clause | folded: permission is read in the clause, prohibition in the sentence |
| H-4 `(?:ing)?` made a gerund subject an imperative ("Pushing without asking has burned me") | folded: the imperative must be the verb and must end the clause |
| H-5 (conditional) avoid-cell text reaching the polarity judge | not applicable: every publish-guard trigger reads the DO cell only (`cell: 'right'`) |
| M-1 a waiver about something else (「テストは確認なしで回してOK、pushは慎重に」) dropped the gate | folded: a waiver counts only when its clause names a publishing action |
| M-2 `OK` matched inside "token" | folded: ASCII word bounds |
| M-3 comment claimed "Before you push, push without asking" is a conflict | the comment was wrong, the behaviour (a waiver) is the frozen one; comment corrected |
| M-4 frontmatter `version` copied unvalidated | folded: only a version-shaped value is kept |
| L-1 longer forbidden terms inside a word ("adhdtools") | folded (substring rule for the terms of four letters or more) |
| L-2 `--name ""` silently fell back | folded: rejected |
| L-3 error named the recipe id; unused constants | folded (position only; constants removed) |

### 2 Catalog (`src/catalog/index.mjs`)

| finding | disposition |
|---|---|
| H-1 quiet-confirmations fired on "Never skip the confirmation before deleting" 「確認の質問はやめないで」 | folded: the verb must not be negated (lookbehind / lookahead) and the `unless` covers the negated forms beside another trigger |
| M-1 "pushing notifications" slipped the exclusion; the either-side trigger had no exclusion and crossed sentences | folded: exclusion after the suffix in every trigger, same sentence only, hyphenated form |
| M-2 `短く…\S*?ない` reached a later 「しないで」 | folded: four characters at most |
| M-3 `PR` unbounded ("project"); whole-line lookahead | folded: bounded; the object and the count must share a clause, and the exclusion moved into the trigger and the derivation so a brevity request elsewhere in the line still proposes |
| L-1 accept-typos "point it out" too broad; "do not ever"; 「教えてくれなくていい」 | folded |
| L-2 expert-role "I'm a professor" | folded |
| L-3 bare 失速 | folded: a gate word must share the clause |
| L-4 「あとで出したら見て」 a stop signal; 「おわりって言ったら」 missed | folded |
| L-5 stale comment; L-6 「回答は、200字以内」, 「説明コメント」 | folded |

### 3 Matcher and diff tests

| finding | disposition |
|---|---|
| H-1 `assertSuppressed` proved only that some regex matched some cell | folded: the trigger must match the cell it reads in the profile's language; a recipe with `unless` must propose without it; publish-guard must receive a waiver-without-request ruling from `publishPolarity` (exported) |
| H-2 the object-named-limit negatives disappeared | folded: cases for both languages, with the twelve-character boundary |
| M-1 "Avoid pushing without confirmation" | folded (high) |
| M-2 the mirror row cases | folded with explicit expectations |
| M-3 「pushは確認しない」「pushの許可なし」 "Do not ask before you push." | kept as waivers: a predicate at the end of the clause states the opt-out (DESIGN §5.4a); the test says so |
| M-4 the TypeError message | folded: asserted to hold the line number only |
| M-5 the deleted lastIndex and cell-scope checks | folded with a probe recipe |
| L-1 to L-4 | folded (boundary rule, slug source asserted, `unless: []` asserted, ADD/OD/DAN recorded in DESIGN §5.4a) |

### 4 Emitter and templates

| finding | disposition |
|---|---|
| M1 params unchecked; stripped bundle built by subtraction | folded: keys and required params checked, pattern lists compiled, bundle rebuilt from known fields |
| M2 stop negatives without positives | folded |
| M3 `'u'` compilation could deny every command for a shipped catalog; deny text; event | folded: emit-time compilation (`E_BUNDLE`), deny text names the consequence and the remedy; a separate event was not added (the schema stays closed) |
| L1 golden plugin out of step | folded: the golden plugin is now the generator's output, kept byte-identical by a test |
| L2 one-sided bounds | folded |
| L3 placeholder regex | folded (generic) |
| L4 a long quote equal to catalog text failed a legitimate manual | folded: catalog text is exempt at any length; the error names the evidence position |
| L5 null evidence; version with build metadata | folded |
| L6 async handlers after a reset | recorded as a known limit (the engine reloads the module; the kit runs tests sequentially) |

### 5 Emitter tests

| finding | disposition |
|---|---|
| M1/M2 preconditions on the synthetic catalog; the 確認 case | folded |
| M3 an empty pattern list | folded: refused by the module and by the emitter |
| M4 `resetState` checked by a hand-written list | folded: every `let` of the module, cancel-before-clear order |
| M5 `E_BUNDLE` fields | folded with positive neighbours |
| L1 defaults compared to plugin.json | folded, which exposed that the runtime fallback was the recipe default rather than the manifest default; the module now falls back to the proposal's value |
| L2, L3, L4, L5, L6 | folded (folded copies, name boundaries, two-character floor documented, grant/off cases, emit-time compilation) |

### 6 CLI, report, metrics

| finding | disposition |
|---|---|
| F1 an export's `plugin` could carry a forbidden term and be printed | folded: `isPluginName` in the export validator, the emitter and the bundle check; no release precedes the slug rule, so no older export exists and the version is not bumped |
| F2 params and `pluginName` of a hand-edited bundle | folded: parameter names checked against the recipe, `pluginName` must be a kokoro-mods name |
| F3 `--name` without a value | already a usage error in `argumentsFor`; verified |
| F4 hash compared case-sensitively | folded |
| F5 shape errors did not name the export | folded (`export:` / `before:` prefix) |
| F6 `Failure` bypass | verified: `Failure` instances pass `publicFailure` unchanged |

### 7 End-to-end tests

| finding | disposition |
|---|---|
| M the terminal check took the checker's own messages as its allow-list | folded: the token of every invalid fixture is frozen in the test, the message format is asserted, and the scan allows that token only |
| M a throwing `fetch` proves nothing if the code caught it | folded: calls are counted |
| M `plugin/**` not scanned for network use | folded |
| L stderr of the module runner; a refused re-run's folder; `__proto__` keys; counts of an unselected recipe | folded |
| L per-recipe test names; a Turkish locale | recorded: the generated tests name the guard, detector and export tests; Node's case folding is locale-independent |

### 8 Content check and parser

| finding | disposition |
|---|---|
| H-1 a base kana, an invisible character and a combining mark did not compose (`ハ&#8203;&#12442;ニック障害`) | folded: NFKC and invisible removal repeated until stable (Appendix A) |
| M-1 negation judged on the spellings that still held tags and double spaces | folded: the guard reads a cleaned context |
| M-2 `<A_DHD>` | folded: a fourth spelling, tags kept and emphasis dropped |
| M-3 「ように」「です」 and a closing bracket as request endings | folded |
| M-4 conditions after 「ないで」 | folded |
| M-5 join positions per spelling | folded: each spelling carries its own join positions |
| L-1 entity rounds | folded (until stable) |
| L-2 comment markers judged after decoding | recorded as a known limit (the F rules scan comment bodies too, so only a W rule could be affected) |
| L-3 「ほしくはない」「ありません」; `just` | folded for the demands; `just` kept in the adverb set ("don't just ignore" negates ignoring) |
| L-4 comment; L-5 Hangul fillers | folded |

## 2026-10-06 second re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 3 matcher tests, 8 checker against the diff a91675c..1b499e9; reports `inspections/2026-10-06-reinspect2-{1,2,3,8}-aws-claude.md`)

Verdicts: 1 FAIL (3 high), 2 FAIL (1 high), 3 PASS (4 medium), 8 FAIL (1 high).

### 1 Matcher

| finding | disposition |
|---|---|
| F1 the English explicit-waiver forms were incomplete ("no confirmation" alone, "don't want" alone) | folded: "no confirmation needed/required/necessary", "don't want/need (any) confirmation/permission/…" |
| F2 negated permissions "can't", "may not", "don't think it's ok", 「言ってない」「わけがない」 | folded (PROHIBITION; `you can/may` not before n't/not) |
| F3 the Japanese predicates could be followed by の or a space (「確認不要のpushが怖い」「確認せず pushして」) | folded: each predicate must end its clause |
| F4 the plain form 「pushする」 as an imperative; 「勝手に」 as permission; the passive | folded: only 「pushして」 is an order (「確認せずにpushする」 is now a hit), 勝手に removed from the permission words (DESIGN §5.4a refrozen), 「される」 is a prohibition |
| F5 frontmatter version with a free suffix | folded: numbers and alpha/beta/rc/dev/pre only |
| F6 PUBLISH_OBJECT wider than the frozen list; no word bounds | folded: deploy removed, English words bounded; プルリク kept (it is in the catalog's frozen object list) |
| F7 "ad-hd" in a slug | not adopted: the person chooses the name, and stripping hyphens would refuse ordinary names such as scripts-demo (ptsd); recorded |
| F8 the manual's file name in the bundle | recorded: it enters PROPOSALS.json only (private), never the distributable or the export |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 the object exclusion looked before the count only (「50文字以内のコミット件名」, "72 chars max in commit bodies") | folded: a lookahead after the count too, in triggers and derivations |
| M-a "don't keep asking" cancelled by the unless | folded (lookbehind) |
| M-b 「やめて構わない」「控えてもらえませんか」 cancelled | folded: negations immediately after the verb only, in the trigger and the unless |
| M-c the object window crossed commas | folded: the window ends at a comma |
| M-d "My typos: please don't point them out" cancelled | folded (lookbehind before "point") |
| L-a "Never just skip" | folded (adverbs between the negation and the verb) |
| L-b 「短く答えなくていい」「短くまとめようとしないで」 | folded |
| L-c 確認 as a gate word | folded (確認ダイアログ/画面 only) |
| L-d 「あとで打ったら教えて」 | folded: あとで needs a quote or と/って |
| L-e 「回答は日本語で、引用は200字以内」 derived 200 | folded: a 、 counts only right after the reply word |
| L-f "Never push to main without running the tests" | folded: "without" must be followed by an asking word |
| (noted by request 3) 「終わりを出したら止めて」 is no longer a signal | recorded: 「終わりの合図を出したら」 is; a bare 出したら was the L-4 false positive |

### 3 Matcher tests

| finding | disposition |
|---|---|
| M-A negatives in no section; no counterfactual | folded: the same section as the positives; the polarity ruling and the trigger-in-cell precondition are the counterfactual |
| M-B the mirror row judged by `deepEqual []` | folded (`assertSuppressed`) |
| M-C version suffix | folded with F5 |
| M-D positives missing for three negated forms | folded |
| low items (返答に含めるコメント, 許可なし, OKではない/is not ok/not fine, book, lang-specific unless) | folded |

### 8 Content check

| finding | disposition |
|---|---|
| H-a a block tag between a negation and the command was dropped from the context ("Don't</p><p>Ignore") | folded: block tags are clause breaks, inline tags spaces |
| M-a 「です」 read as 「で」 | folded; 「ないですか」 stays a hit |
| M-b conditions after ず/ないで | already handled by the check that precedes the subordinate branch (「無視せずにはいられない」 and 「無視しないではいられない」 are tested hits); verified |
| M-c entity decoding capped at ten rounds | folded (until nothing changes; every round shortens the text) |
| M-d no test of the per-spelling join positions | folded |
| L-a a tautology in the test; L-b the normalisation cap | folded (the loop runs until stable with a cap of eight; NFKC and removal converge) |
| L-c 「無視しないでとお願いしました」 is a hit | recorded (safe side) |

## 2026-10-06 third re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 1b499e9..a2e2c47; reports `inspections/2026-10-06-reinspect3-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (3 high), 2 FAIL (2 high), 8 FAIL (1 high). Each high was a further natural-language form of a rule already folded (polite negations, an adverb between a negation and its word, an unanchored imperative, a late negation, a block tag after 「ないで」); all were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H1 polite negations 「思いません」「ではありません」「良くありません」 passed as permission | folded (PROHIBITION; 「構いません」 as permission) |
| H2 "isn't really OK", "hardly ok" | folded (an adverb between the negation and the word; hardly/barely) |
| H3 the Japanese imperative was not anchored (「pushしてよく事故る」) | folded (anchored to the clause end) |
| M1 questions (「確認不要ですか？」 「いい？ダメ。」) | folded (a question states no opt-out; read from the clause terminator) |
| M2 a bare "don't" in the sentence ("Please don't, even if it seems fine, push without asking") | folded: every waiver phrase is removed from the sentence first, then a bare don't/do not/didn't is a prohibition |
| M3 「だと」「だった」 | folded |
| M4 first-person habits ("I never ask before pushing", 「私は…確認しない」) | folded with the exception of a stated wish ("I don't want confirmation"); DESIGN §5.4a refrozen |
| L1 push without word bounds | folded |
| L2 いい inside かわいい | folded (predicate position only) |
| L3 a birthday-shaped version | recorded: the bundle is private |

### 2 Catalog

| finding | disposition |
|---|---|
| H1 late negations (「やめてほしくない」「不要ではない」「省かずに」) fired quiet-confirmations | folded (trigger lookahead and unless) |
| H2 "without confirming with me", "without my go-ahead", "without letting me review it" lost the gate | folded: a lookahead for an asking word within thirty characters after "without"; the either-side trigger takes ask/confirm/approv stems |
| M1 a second limit in the same clause removed the reply's limit; windows crossed line ends | folded: after the count only a modifier relation (「の…件名」 "in/for … bodies") names the object; line ends and commas of both widths end every window |
| M2 "Don't ever stop checking in" | folded |
| L1 ASCII comma in the Japanese window | folded |
| L2 「回答、200字以内」「回答については、200字以内」 | folded |
| L3 「トークン消費で応答が失速」 | folded (トークン入力/発行/認証 only) |
| L4 "no need to point them out", "don't ever point them out" | folded |

### 8 Content check

| finding | disposition |
|---|---|
| H-1 a block tag after 「ないで」 hid the demand or condition behind it | folded: both sides of the break are read |
| M-1 a block tag after a bare 「ない」 became an unknown ending | folded: the break is 。 |
| M-2 the entity test was not nested | folded (twelve levels) |
| L-1 quadratic decoding of nested &amp; | folded (one collapse first) |
| L-2 the join test could not tell the spellings apart | folded (a join shifted by 35 characters of removed tags) |
| L-3 「ないですって」 | folded |
| M-b (conditions after ず/ないで) | verified by the existing tests; the pre-check runs before the subordinate branch |

## 2026-10-06 fourth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff a2e2c47..f69f832; reports `inspections/2026-10-06-reinspect4-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (2 high), 2 FAIL (1 high), 8 FAIL (1 high). The highs were polite and continuative tails of rules already folded, a closed adverb list, and a second block break; all were folded in the following commit together with the medium and low items.

### 1 Matcher

| finding | disposition |
|---|---|
| High-1 advice forms 「しない方がいい」「避けたほうがいい」 read as permission | folded: advice against is a prohibition; いい after 「ほうが」 is not permission |
| High-2 adverbs between a negation and "ok" were a closed list; "no longer" | folded: up to two adverbs of any kind; no longer; "you can no longer" |
| Medium-1 reported speech inside the clause (「OKって言う人がいる」 "some people say") | folded for the stated and the permission paths |
| Medium-2 outer negations ("nobody said", "not true that", 「なんてことはない」) | folded |
| Medium-3 tag questions ("…, right?") | folded: a sentence that ends with a question mark makes every clause a question |
| Low-1 "fix issues" as a publishing object | folded: only a filed issue is one |
| L2 かわいい at the clause end | folded (adjective stems excluded) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 polite and continuative negations (「不要ではありません」「やめてほしくありません」「控えるべきではありません」「ではなく」) fired quiet-confirmations | folded: one shared negated-verb form for the trigger lookahead and the unless |
| M-1 a bare limit no longer refused an object after the count in other than modifier form (「50字以内でコミット件名を付ける」) | folded: the derivation form (reply word before the count) takes only a modifier after it, the bare form refuses any object in the clause after it; the trigger is the union |
| M-2 "without running my tests", "without reviewing the diff yourself", "When asked" | folded: me/my only next to an approval word; ask(ing) only |
| M-3 the outer typo negations | folded: one shared negation list before every verb |
| L-1 「テストは不要ではない」 cancelled quiet-confirmations | folded: the unless requires a confirmation word in the clause |
| L-2 「トークンの入力」 | folded |

### 8 Content check

| finding | disposition |
|---|---|
| H-A two breaks in a row (`</p><p>`) | folded: every run of breaks is stripped |
| M-A a real 。 was read as a break, so the next sentence became a condition (「しないで。とても大切です」 failed) | folded: the break is its own mark (¶ in the context, a 。 in the final spelling), a 。 ends the sentence, and beyond a break only a quoting or demanding form keeps the request alive |
| M-B 「無視しない<br>と答えられない」 | folded |
| L-A the join test could not tell the spellings apart | folded (the term is whole only without tags) |
| L-B/L-C nested entity spellings and the loop test | folded (one-step collapse of every ampersand spelling; a chain of entities tested) |
| L-D 「ないです<br>って」 | folded |

## 2026-10-06 fifth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff f69f832..2357119; reports `inspections/2026-10-06-reinspect5-{1,2,8}-aws-claude.md`; severity rule stated in the request: high only for a plain sentence that loses the gate or inverts a recipe, or for manual text leaving the machine)

Verdicts: 1 FAIL (1 high), 2 FAIL (3 high), 8 FAIL (1 high). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| High-1 「いいという方針にします」 read as reported speech (a false gate) | folded: only speech with a speaker is reported (「言う人」「言われた」, "people say"), 方針/方法 excluded |
| Medium-1 "no longer" anywhere in the sentence | folded: only "can/may/is/are no longer" |
| Medium-2 "Just push without asking, OK?" read as a question | folded: an order's own OK tag is not a question |
| Medium-3 「いいでしょう」「いいけど」 not permission | folded |
| Low-1 かっこいい, 気持ちいい | folded |
| Low-2 "open a new issue"; 「issueの」 | folded: article and "new" in either order; Japanese only as filed (化・作成・起票・を出す) |

### 2 Catalog

| finding | disposition |
|---|---|
| High-1 「やめるべきでない」「やめてほしくはありません」 fired quiet-confirmations | folded (は optional, で without は) |
| High-2 "without me reviewing it", "without a review from me" lost the gate | folded |
| High-3 "Do not push unless asked", "Never publish unless the user asks" | folded (an "unless" trigger with an asking word) |
| Medium-1 "don't have to / do not need to / shouldn't fix my typos" cancelled | folded |
| Medium-2 「ては駄目」「いただきたくない」「不要だとは思いません」 | folded |
| Medium-3 the unless crossed a 、 (「やめて、テストは省かないで」) | folded |
| Low-1 「省く」; Low-2 「250字以内で答えて件名は不要」 | folded |

### 8 Content check

| finding | disposition |
|---|---|
| HIGH-1 the colloquial quoting particle 「って」 (「しないでって言われても」) | folded (Appendix A refrozen) |
| MEDIUM-1 the 「です」 branch read a broad condition beyond a break | folded |
| MEDIUM-2 the final spelling turned a block tag into 。, cutting a demand off | folded: the break mark is the same in every spelling |
| MEDIUM-3 「といわれても」 | folded |
| LOW-1 a loop test, the comment | folded (a full-width ＆ entity needs a second round) |
| LOW-2 pairs | folded |
| LOW-3 a ¶ in the manual | folded: the mark is a private-use character |

## 2026-10-06 sixth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 2357119..99ca7d1; reports `inspections/2026-10-06-reinspect6-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high), 2 FAIL (2 high), 8 FAIL (1 high). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H-1 the clause-following reported form had no speaker (「、という方針です」 was a false gate) | folded: both reported forms need a speaker |
| M-1 "…, right?" treated as an order's tag | folded (ok/okay/alright only) |
| M-2 「いいでしょうか」「いいかな」 as permission | folded (question endings without a mark) |
| M-3 the speaker was optional in the in-clause form | folded |
| L-1 "open issues" as a noun; イシュー | folded |

### 2 Catalog

| finding | disposition |
|---|---|
| H-A "without showing me first", "without letting me see it" | folded |
| H-B "unless I say so", "until I tell you to", "before I give the go-ahead" | folded: unless/until/before with an asking word or a person's say-so |
| M-1 a concessive clause followed by 「やめないで」 | folded |
| M-2 「不要だとは思っていません」「不要とは言いません」 | folded |
| L-1 「省くな」「省くべきではない」 | folded |
| L-2 "unless the tests are confirmed green" | folded: a confirmation needs a person |
| L-3 the て-form stop of the bare-limit window | recorded (rare word order) |

### 8 Content check

| finding | disposition |
|---|---|
| H-1 a polite ending between 「ないで」 and the quoting condition (「ないでくださいと言われても」「ないようにと言われても」) | folded (Appendix A refrozen) |
| M-1 a benign report of the rule (「無視しないでって何度も伝えています」) is a hit | recorded in Appendix A as an accepted false positive |
| L-1 the outer cap | folded (until nothing changes) |
| L-2 private-use characters | folded (removed with the invisible ones) |
| L-3 「といっしょに」, 「とか言われても」 | folded |

## 2026-10-06 seventh re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 99ca7d1..2ad55e8; reports `inspections/2026-10-06-reinspect7-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (2 high), 2 FAIL (2 high, one of them a regression of the sixth fold), 8 FAIL (2 high). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H-A the speaker exclusion was a word list (「という方向で」「という方式」 were reported speech, a false gate) | folded: a speaker is a positive existence predicate (人/方 + いる/いた/多い, 声/話/噂 + ある) |
| H-B "isn't something I'm OK with": a standalone isn't/is not was not a prohibition | folded (isn't/aren't/wasn't/weren't/is not/are not count on their own; "no longer" too) |
| M-A 「大丈夫ですかね」: a question ending with a tail | folded (ね/な/ねえ/なあ after the ending; のか) |
| M-B "open new issues", 「イシューは…立てていい」 | folded (new as a determiner; イシュー/issue as a topic with a filing verb) |
| L-A 「pushして、OK？」 read as a question | folded: a 、 before the tag counts like a comma (this row first said "recorded"; the eighth-round reviewer caught it) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 (regression of L-2) a confirmation bound to a person dropped "Never push unless confirmed", "Don't push until I've confirmed", "until I've signed off" | folded: a bare confirmation after unless/until/before/without keeps the gate unless it is a CI state (tests/build/CI/checks/pipeline … confirmed); subjects take 've/have/has and an adverb; past tenses; sign(ed) off |
| H-2 「省くのはやめてください」「省くことはしないでください」 fired quiet-confirmations | folded ((の|こと)(は|を)?(やめ|しないで|控え|禁止) is a negation in the trigger and in the unless) |
| M-a the concessive clause crossed to another topic (「やめてほしいけど、テストは省かないで」 lost the recipe) | folded (が dropped; the follow-up names at most 確認/それ before the negated verb) |
| M-b "unless the user explicitly confirms", "until you hear from me" | folded |
| L-a 「いらないな。」 cancelled by the bare な | folded (な only after a dictionary-form ending) |
| L-b the without form still took a CI-state confirmation | folded (same exclusion) |
| L-c a bare ok after until ("until the build looks OK") | folded (ok bound to a person; approve stays, safe side) |

### 8 Content check

| finding | disposition |
|---|---|
| 高1 the polite ending consumed one ending only (「ないようにしてくださいと言われても」「ないでほしいですと言われても」「ないでくださいねと言われても」 lost the hit) | folded: endings and auxiliaries chain before the quoting condition (Appendix A refrozen) |
| 高2 a closing quotation mark before the quoting condition (「『…しないで』と言われても」) | folded (closing marks and 、 are consumed with the endings) |
| 中 nested full-width ＆ costs one outer pass per level | recorded (a crafted input in the person's own file; every pass shortens the text, so the loop ends) |
| 低1 the `\uE000` pair tested nothing once private-use characters were removed | folded (`<br>` pairs) |
| 低2 no test for an ending followed by a break, nor for an ending followed by text that is not a quotation | folded (「ないでください<br>と言われても」 is a hit; 「無視しないようにとにかく注意して」 stays guarded) |
| 低3 「無視しないようにと言っています」「ないでくださいとお願いしています」 become hits | recorded (the accepted false positive of the sixth round, safe side) |

## 2026-10-06 eighth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 2ad55e8..5e4b216; reports `inspections/2026-10-06-reinspect8-{1,2,8}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 3 medium), 2 FAIL (2 high, one of them a regression of the seventh fold), 8 FAIL (2 high). All were folded in the following commit. The matcher reviewer also caught an error in the seventh-round table above (L-A was folded, not recorded); the row is corrected.

### 1 Matcher

| finding | disposition |
|---|---|
| Medium-1 (regression) the speaker nouns were only 人/方/の/声/話/噂/意見, so 「OKって言う同僚もいる」 was the person's own words | folded (person nouns: 同僚・上司・先輩・後輩・メンバー・チーム・仲間・友人・知人・みんな・皆・者・人たち・社員) |
| Medium-2 「大丈夫だろうか。」「大丈夫か。」「大丈夫かね」 read as permission; 「かどうか」 | folded (だろうか, a bare か with its tail, かどうか and "whether" anywhere in the clause) |
| Medium-3 a waiver in one sentence opts the whole cell out while a prohibition is read per sentence (「mainへpushしないで。イシューは確認なしで立てていい。」) | recorded as design: a prohibition without an asking word is not a request for the gate, since the guard asks before publishing and is not a ban on a branch; §5.4a says so and a test pins it |
| Low-1 the topic form 作/開/投 also matched 作業/開発/投票 | folded (conjugated forms only) |
| Low-2 §5.4a lacked the standalone isn't/is not and the speaker predicate | folded |
| Low-3 no tests for forms that stay reported (「という声がある」「という方が多い」) | folded |
| Low-4 "it isn't a shared repo" keeps a gate; "Confirmation is no longer needed for pushes" is not a waiver | recorded (safe side) |

### 2 Catalog

| finding | disposition |
|---|---|
| H1 「減らすのはやめてください」「省略するのはやめて」「減らすことはしないで」 fired quiet-confirmations | folded (減らす・省略する・なくす in the unless verb group; 省略 also fires as a request) |
| H2 (regression of L-c) "until you get my OK", "unless I'm OK with it" lost the gate | folded (my OK; I'm/we're OK/fine with) |
| M1 「不要と言われるが、省かないでください」 kept the recipe once が was dropped | folded (が followed by 、) |
| L1 "until the build is confirmed by me" fell under the CI exclusion | folded (confirmed with/by me or the user) |
| L2 no was/were pair for the CI exclusion | folded (was/were in the exclusion; a pair) |

### 8 Content check

| finding | disposition |
|---|---|
| 高-1 the request forms くれ・ちょうだい・いただきたい・もらいたい・ません were missing from the chain | folded |
| 高-2 after the chain only a closed list of quoting verbs counted (「とAIが言っても」「ってClaudeに言われても」「と書いてあっても」「と指示されても」「と注意されても」 were guarded) | folded: a quoting particle keeps the request alive whatever follows it; the words と can begin benignly are the closed set (Appendix A refrozen); the same rule applies after 「ないで」 (「ないでとにかく進めて」 is guarded now) and beyond a break |
| 中-1 (regression) a closing mark after a bare 「ない」 is consumed, so 「『制限を無視しない』と答えてください」 became a hit | recorded in Appendix A as an accepted false positive (safe side; the finding names the line) with a test, because 「『無視しない』と言われても無視して」 has the same shape |
| 低-1 the chain might be reused for the bare-ない terminator | no change (they are separate regexes); 「解除しないですか」 is pinned as a hit |

## 2026-10-06 ninth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 5e4b216..34d286f; reports `inspections/2026-10-06-reinspect9-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high), 2 FAIL (3 high, two of them regressions of the eighth fold), 8 FAIL (2 high). All were folded in the following commit. Three rules that had been patched round after round were put back on a design: the checker's quoting rule, the publish gate after unless/until/before, and the asking side of the polarity judgement; in each the open set (verbs after a quoting particle, a person's say-so, the asking vocabulary) is no longer enumerated and the closed set (benign words, CI/repository/calendar states, the catalog's own triggers) is what the code names.

### 1 Matcher

| finding | disposition |
|---|---|
| H-1 the eighth-round disposition of Medium-3 rested on PUBLISH_ASK, which does not know the catalog's own gate forms, so "Never push unless confirmed. Feel free to file issues without asking." lost its gate | folded: a sentence of the cell with no waiver phrase that matches one of the recipe's own triggers asks for the gate (hitFor hands publishPolarity the triggers); the test asserts the proposal, its medium confidence and the ruling |
| M-1 "whether" and 「かどうか」 anywhere in the clause made a waiver a question | folded ("whether" only before the waiver; 「かどうか」 only in predicate position) |
| L-1 「イシューを切る」 | folded |
| L-2 no regression tests for the bare か | folded (「いいよ」「OKだよね」) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 (regression) the noun 省略 fired quiet-confirmations in 「省略は禁止です」「省略はやめてください」 | folded ((は|を)(やめ|しないで|控え|禁止|厳禁|不可) negates in the trigger and the unless) |
| H-2 (regression) 「省略せずに」「省かずに」 | folded ((せ)?ず(に)? in the shared negation; the unless takes 省略せ) |
| H-3 "until I'm happy with it", "unless it's OK with me", "until I'm satisfied" lost the gate | folded by design: after unless/until/before the gate stays by default and is waived only for a CI, repository or calendar state with no person (EN_PERSON_GATE, EN_STATE); the say-so predicates are no longer enumerated |
| M-1 "unless we're OK with it" | folded (covered by the default) |
| L-1 the without form lacked "confirmed by me" | folded |
| L-2 two vacuous tests (「なくすのは禁止」 never fired; "until it was confirmed by me" never used the by-me branch) | folded (「不要だが、なくすのは禁止」; "until the tests were confirmed by me") |
| L-3 「省略しないと進まない」 was cancelled as a negation | folded (ないと is a condition) |

### 8 Content check

| finding | disposition |
|---|---|
| high-1 imperative and hortative auxiliaries (しなさい・しましょう・おいて) missing from the chain | folded: the run of endings is a closed set of hiragana auxiliaries, request forms, punctuation, closing marks and breaks; the verbs after the particle are not enumerated at all |
| high-2 sentence punctuation before a closing mark (「『しないで！』と言われても」「しないで。と言われても」) | folded (punctuation is part of the run) |
| medium-1 a benign と-word followed by a concessive (「と約束したけど今回は」「と思われても」) was guarded | folded: a concessive or conditional marker in the clause after the particle keeps the hit before the benign words are consulted |
| medium-2 the elongation marks and な・わ | folded |
| low-1 Appendix A said とき without the code's condition | folded (Appendix A names the forms) |
| low-2 「無視しないでかまわない」 as the condition か | folded (not a condition) |
| low-3 tests for ちょうだい・ません and the accepted report | folded |

## 2026-10-06 tenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 34d286f..8d115a2; reports `inspections/2026-10-06-reinspect10-{1,2,8}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 1 medium), 2 FAIL (2 high, both regressions of the ninth fold's own fixes), 8 PASS (0 high, 2 medium). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| M-A the asking sentence was read per sentence only, so a clause joined by 、 or "but" (「私がいいと言ってから、イシューは…」 "Wait for my go-ahead before pushing, but …") lost the gate | folded: a clause asks too when it names a person or an asking act; a bare time clause ("Before you push, push without asking.") still belongs to its waiver, as §5.4a froze it; the catalog gained the Japanese say-so trigger (object + person + てから/まで) the example needs |
| L-A two of the three H-1 examples held by the vocabulary alone | folded (each row says whether the vocabulary alone keeps the gate; three rows now prove the trigger path) |
| L-B 「切り分け」 as filing an issue | folded |

### 2 Catalog

| finding | disposition |
|---|---|
| F-1 (regression) ない(?!と) reached the polite tails, so 「減らしてほしくないと思っています」「不要ではないと思います」 lost their negation | folded: only the bare verb negation looks past と, and not before a verb of thought or speech |
| F-2 (regression) "green" as a state waived "until you get the green light" | folded (green light, nod, thumbs up are a person's; green is a state only when no light follows) |
| F-3 "until it's OK'd", "until it looks good"; the person stood beyond the 40-character window | folded (OK'd, looks good, LGTM, good to go; the person is searched to the end of the clause) |
| F-4 the design kept "before lunch", the code waived it | folded (meals are not states) |
| F-5 承諾・了承・合図・OK as ask words but not as waiver words (「了承は不要です」 was a gate) | folded (the catalog's and the matcher's waiver vocabularies take them) |
| F-6 「テストのOKが出てから」 as a gate | folded for OK (a CI's OK is not a person's); 「pushしてから合図して」 does not fire |

### 8 Content check

| finding | disposition |
|---|---|
| M-1 が・ものの・ながら missing from the concessives (「と約束したが、今回は無視して」 was guarded) | folded |
| M-2 the lookbehind for とても also excluded 「と思っても」 | folded (a leading とても/とっても is removed before the markers are read) |
| L-2 (regression) the full condition set was read beyond a block break (「ないで</li><li>かならず守って」 became a hit) | folded (only にはいられ/かどうか beyond a break) |
| L-3, L-1 Appendix A named fewer run tokens than the code, and とき without its condition | folded (Appendix A lists the run and the とき forms) |

## 2026-10-06 eleventh re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 8d115a2..70e39f4; reports `inspections/2026-10-06-reinspect11-{1,2,8}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 2 medium), 2 FAIL (1 high), 8 PASS (0 high, 1 medium). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| 1 the clause rule was gated by a second hand-written vocabulary, the drift the ninth fold had removed elsewhere (「レビューが通ってから」 "the team lead says so" were not in it) | folded: the rule is inverted; once a sentence's waiver clauses are blanked, what remains asks when a trigger still matches it and it is more than a bare time clause ("Before you push", 「pushする前に」); no vocabulary |
| 2 a topic split off by 、 (「pushは、私がいいと言ってから、…」) left no clause for the trigger | folded (the triggers read the remainder of the sentence, not single clauses) |
| 3 OK without ASCII bounds in that vocabulary | moot (the vocabulary is gone) |
| 4 no test that the clause rule leaves a waiver alone ("Push without asking; I'll review the PR later.") | folded (three waivers asserted with the triggers) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 (regression) "green light" and "thumbs up" with a space did not count as a person's say-so while "changes" counted as a state | folded (green[- ]?light, thumbs?[- ]?up; tests with a state word in the clause) |
| M-1 the Japanese say-so triggers fired on a person's branch or machine (「私のブランチにマージしてから」) | folded (a closed set of states after the person, mirroring the English rule) |
| M-2 the exclusions after ないと were a closed set of verbs, so 「やめないと約束して」 read as a condition | folded (inverted: ないと is a condition only before a closed set of consequences) |
| M-3 "until it's OK" | folded (it's OK/fine/good is a person's) |
| L-1 an unbounded nested quantifier | folded (200 characters) |
| L-2 OK without ASCII bounds in the Japanese waiver | folded |
| L-3 missing tests for F-6 | folded |

### 8 Content check

| finding | disposition |
|---|---|
| 中1 が as a concessive only before 、, a space or a content word, and not after ん (「と約束したがやっぱり」「していませんが、」) | folded (が after a predicate counts whatever follows, except したがって/したがう; ん before が) |
| 低1 が after a noun's last kana (「あなたが決めて」) is a concessive | recorded in Appendix A as an accepted false positive |
| 低2 the ながら test did not need ながら; no にもかかわらず test | folded |
| 低3, L-1 Appendix A's run tokens short of the code's; とき before a space | folded (the list is the code's, token for token) |
| regression note: a とても not at the start counts as ても | recorded (safe side) |

## 2026-10-06 twelfth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 70e39f4..645dabc; reports `inspections/2026-10-06-reinspect12-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high), 2 FAIL (1 high, a regression of the eleventh fold), 8 PASS (0 high, 1 medium). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H-1 "and" was not a clause boundary, so "Wait for my go-ahead before pushing and feel free to open new issues without asking." was blanked as one clause and lost the gate | folded ("and" splits clauses for the blanking and for the permission scope) |
| M-1 (regression) レビュー as an asking word made 「確認せずにpushして。PRのレビューは後で私がする。」 a conflict | folded (レビュー stays a waiver word; the triggers decide the asking side) |
| L-1 a CI condition before the waiver (「CIが通ってから、pushは確認なしでしていい」) | folded as a pinned waiver (no trigger matches the remainder) |

### 2 Catalog

| finding | disposition |
|---|---|
| 高-1 (regression) the state lookahead after a person crossed てから/まで and named コード・原稿・テスト, so 「私がいいと言ってからコードをpushして」「pushは私がコードを見てから」 lost the gate | folded (the lookahead stops at てから/まで; a state is the person's branch, machine or repository right after の, or a state verb such as マージ・デプロイ・テストする) |
| 中-1 レビュー as an ask word fired on the agent's own review (「自分でコードをレビューして」「PRをレビューしてコメントして」) | folded (only a review received or awaited counts: もらう・受ける・依頼・が通る・を待つ) |
| 中-2 the consequences after ないと were read only right after と (「やめないと仕事にならない」 was a negation) | folded (within six characters; ならない・かかる・遅い・面倒・効率 added) |
| 低-1 the design said "anywhere", the code 200 characters | folded (the design names the bound) |
| 低-2 no test for the ASCII bounds of OK | folded (「LOOKをもらってから」) |

### 8 Content check

| finding | disposition |
|---|---|
| M-1 the exclusion after が rejected nine following kana, so 「と約束したがいまは」「したがわたしは」 were guarded | folded (only the words したがって/したがう are excluded) |
| L-1 no test of the exclusion itself | folded (「と思いますしたがって確認してください」 stays guarded, 「と思いますがいまは無視して」 is a hit) |

## 2026-10-06 thirteenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 645dabc..35c58a8; reports `inspections/2026-10-06-reinspect13-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high, a regression of the twelfth fold), 2 FAIL (2 high, one of them a regression of the twelfth fold), 8 PASS (0 high, 0 medium, 2 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H-a (regression) "and" in the permission scope cut "You can push and open PRs without asking" from its permission | folded (permission is read up to but/however again; "and" splits only the blanking on the asking side) |
| M-a 査読 left the asking words together with レビュー, unrecorded | folded (recorded; the catalog's trigger carries 査読 and a test pins 「公開前に査読を通して。…」) |
| L-b でから in the bare time clause, unrecorded | folded (comment) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 (regression) the received-review forms were too narrow (「レビューしてもらってから」「レビュー後に」「レビューを経てから」 lost the gate) | folded (してもらう・後・を経る・してから added; the agent's own 「レビューして」 still does not count) |
| H-2 a state verb with the person's say-so after it (「私がテストしてOKを出すまで」) was read as a state | folded (a state waives only when no say-so word stands between it and てから/まで) |
| M-1 厳しい・つらい among the consequences made 「省かないと厳しく言われている」 a condition | folded (manner words removed; a verb of speech or thought before the consequence keeps the negation) |
| L-1 「本人の手元でいいと言ってから」 | folded (the same rule as H-2) |

### 8 Content check

| finding | disposition |
|---|---|
| low the comment and Appendix A said したがって/したがう while the code excludes a が before って or a word-final う | folded (the words now say what the code does) |
| low no boundary tests for the exclusion | folded (「と約束したがうまくいかないので」 is a hit; 「と思いますしたがう」 stays guarded) |

## 2026-10-06 fourteenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 35c58a8..070fa79; reports `inspections/2026-10-06-reinspect14-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high, a regression of the thirteenth fold), 2 FAIL (2 high, one of them a regression of the thirteenth fold), 8 PASS (0 high, 2 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| High-1 (regression) with "and" out of the permission scope, "Just push without asking and I'll check it afterwards" no longer ended its clause and became a negated waiver | folded: a tight clause that also ends at "and" is used for the imperative and explicit waivers, the publishing object and the first-person habit; permission, question and reported speech keep the wider clause |
| Medium-1 §5.4a still said clauses end at "and" | folded (the two scopes are written out) |
| Low-1 a publishing object beyond the "and" counted for the waiver | folded (the object is looked for in the tight clause) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-A (regression) 後に・あとで・次に as linkers of the ask-then-object trigger made 「確認は後でいいので先にpushして」 a gate | folded (the linkers are 前・から again; 「レビュー後にpushして」 has its own trigger; 「確認は後でいい」 is a waiver phrase in the catalog and in the matcher) |
| H-B a say-so before a state verb (「私が確認してマージするまで」) was still read as a state | folded (a say-so word anywhere between the person and てから/まで keeps the gate) |
| M-1 疲れる・しんどい had been dropped from the consequences | folded (the predicative forms are back; only 厳しく stays out) |
| M-2 「自分で」 counted only immediately before レビュー | folded (within eight characters) |
| L-1 CIのチェック as a say-so | folded |
| L-2 the design row's linkers | folded |

### 8 Content check

| finding | disposition |
|---|---|
| low the う exclusion also covered an elongation mark (「したがう〜ん、」) | folded (ー・〜・~ count like hiragana) |
| low no test for う followed by kanji | folded (「と思いますしたがう人」 stays guarded) |

## 2026-10-06 fifteenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 070fa79..07aa59a; reports `inspections/2026-10-06-reinspect15-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high), 2 FAIL (2 high, one of them a regression of the fourteenth fold), 8 PASS (0 high, 2 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| High-1 けど・けれど・ですが・だが were not clause ends, so 「レビューは後でいいけど公開は私がチェックしてから」 became a waiver once 後でいい joined the waiver words | folded (the Japanese concessives end a clause like "but", with or without a 、) |
| Medium-1 the tight clause lost "Don't ask me and just push." (the object beyond the "and") | folded (a waiver that is the whole of its clause borrows the object from the order the "and" opens; "Feel free to run the linter without asking and push when it passes" still waives nothing) |
| Low-1 §5.4a did not say the habit is read in the tight clause | folded |
| Low-2 the English explicit waivers are not anchored at the clause end while §5.4a said "must end" | folded (the design says the Japanese ones end their clause, the English ones stand anywhere in the tight clause) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 (regression) with 後 gone from the linkers, 「確認後にpushして」「承認後にリリースして」「許可をもらった後でpushして」 lost the gate | folded (後に・後で・あとで are linkers again unless いい・OK・構わない・大丈夫 follows, so 「確認は後でいい」 stays a waiver) |
| H-2 the eight-character window after 自分で crossed てから (「自分でテストしてからレビューしてもらって」 lost the gate) | folded (the window may not contain て・ず・から) |
| M-1 減らす in a non-request (「減らすとミスが増える」「減らすかどうか」) fired quiet-confirmations | folded (減らす not before と・か) |
| L-1 the comment above the consequences still said つらい is not one | folded |
| L-2 the design row listed 後 among the review forms | folded |
| L-3 lintのチェック・CI のチェック as a say-so | folded |

### 8 Content check

| finding | disposition |
|---|---|
| low only 〜 among the elongation marks was tested | folded (ー and the full-width ～ through NFKC) |
| low a hesitation 「したがう、」 is taken as the word | recorded in Appendix A as an accepted miss |

## 2026-10-06 sixteenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 07aa59a..3a9e33c; reports `inspections/2026-10-06-reinspect16-{1,2,8}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 1 conditional medium), 2 FAIL (1 high, a regression of the fifteenth fold), 8 PASS (0 high, 1 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| medium-1 with けど a clause end, 「pushの確認は不要だけど、mainへのpushは私が見てから」 becomes a waiver whose gate depends on the catalog matching the remainder | pinned: the remainder matches the person-say-so trigger, so the line keeps its gate at medium confidence (test) |
| low-1 §5.4a said less than the code about borrowing the object | folded (the bare-waiver condition and the comma are written out) |
| low-2 "publishing notes is up to you" borrowed as an order | folded (a noun followed by is/are is not the order) |
| low-3 only けど was tested; a misplaced comment | folded (けれど・ですが・だが pinned; the comment corrected) |

### 2 Catalog

| finding | disposition |
|---|---|
| High-1 (regression) 「確認は後にしてpushして」「確認は後でもいいので先にpushして」 became gates once 後に/後で linked again | folded: an ask word put off (は・も・を before 後, or も/にして after it) is not a linker, and 「後にして」「後でもいい」「後回し」 are waiver phrases in the catalog and the matcher, whose imperative form takes them before 「pushして」 |
| Medium-1 the state tail window had grown to 24 characters unrecorded; 確かめ・納得・試し were not say-so words | folded (recorded; the words added; 「動作に納得してから」 keeps the gate) |
| Medium-2 「減らすと助かります」 no longer fired | folded (減らすと before 助かる・嬉しい・ありがたい is a request) |
| Medium-3 the 自分で window stopped at any て | folded (it stops at てから・でから・もら・いただ) |
| Low-1 lint のOK | folded |
| Low-2 a duplicate test row; no negatives for 後でも・後にして | folded |

### 8 Content check

| finding | disposition |
|---|---|
| low the half-width ｰ and the wavy dash 〰 | folded (〰 joins the marks; both tested) |

## 2026-10-06 seventeenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 3a9e33c..d478e7e; reports `inspections/2026-10-06-reinspect17-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high, a regression of the sixteenth fold), 2 FAIL (2 high, one of them a regression of the sixteenth fold), 8 PASS (0 high, 2 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| HIGH-1 (regression) the put-off waiver 「後にして」 took an optional particle, so 「pushは確認後にして」「リリースは承認後にして。」 (ask first) became waivers | folded (the particle は/も is required, an adverb allowed after it; the catalog's ask-then-後 trigger makes those lines gates) |
| MEDIUM-1 「pushはレビュー後で大丈夫」「公開は承認後でもいい」 as waivers | folded (same rule; the catalog's object-first review-後 form gates them) |
| LOW-1 「pushは確認不要で、mainだけは私が見る」 | pinned as a waiver |
| low the design said the please/just may stand only before the bare waiver; one-word noun phrases only; 「いいだが」 | folded (around it; up to three words; 「いいのだが」) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 (regression) the 自分で window stopped at もらう/いただく, which follow レビュー, so 「自分でテストしてレビューしてもらってから」 lost the gate | folded (a review received is a person's wherever it stands; only 「レビューしてから」 is subject to the 自分で window) |
| H-2 an adverb between は and 後 (「確認は一旦後にして」) was neither a waiver nor excluded from the linker | folded (up to six characters allowed after the particle; the linker's exclusion reads 後にして before consuming に) |
| M-1 「後回しにしないで」 as a waiver | pinned: the trigger fires and the matcher's prohibition keeps the gate |
| M-2 「減らすといいとは思わない」 fired | folded (いい before とは is a doubt) |
| L-1 the design rows behind the code | folded |
| L-2 the state negative did not pass through the state path | folded (「公開は私のブランチにCIがデプロイしてから」) |

### 8 Content check

| finding | disposition |
|---|---|
| low no test for the wavy dash inside the run | folded (「無視しないで〰って言われても」 is a hit, 「無視しないで〰」 stays guarded) |
| low other wave-like marks | recorded in Appendix A as an accepted miss |

## 2026-10-06 eighteenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff d478e7e..112e089; reports `inspections/2026-10-06-reinspect18-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high, a regression of the seventeenth fold), 2 FAIL (1 high, the same regression on the catalog's side), 8 PASS (0 high, 1 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H-1 (regression) the six-character window after the particle admitted a verb, so 「pushはテストも確認も終わった後にして」 (ask first) became a waiver | folded (only a closed list of adverbs may stand between は/も and 後, on both sides; the catalog gained the object-ask-verb-後 trigger that gates such lines) |
| M-1 the lookbehind reached a は of an earlier word | folded (the same closed list) |
| L-1 "Don't ask me and just push changes that are green" treated as a noun phrase | folded (only is/are followed by up to/fine/ok/optional/your/allowed/welcome marks the noun phrase) |
| L-2 a negative example replaced without a record | folded (both kept) |

### 2 Catalog

| finding | disposition |
|---|---|
| F-1 (regression) the topic's は (「公開はOKが出た後にして」) was read as putting the confirmation off | folded (the closed adverb list; the object-ask-verb-後 trigger gates 「公開はOKが出た後にして」「リリースは承認を得た後にして」「pushは確認が済んだ後で」) |
| F-2 「後でもう一度pushして」 excluded from the linker | folded (でも counts only before いい・OK・構わない・大丈夫) |
| F-3 (regression) 「承認は後で取るので」「確認は後で、」 linked and gated | folded (after は/も, 後で before 、・取る・もらう・済ませる・する・やる・回す is neither) |
| F-4 (regression) 「セルフレビューが済んでから」 as a person's review | folded (が通る・を通す・が済む・が終わる・してから are subject to the 自分で/セルフ window) |
| F-5 「減らすといいとは思います」 no longer fired | folded (only a negated とは思わない is a doubt) |

### 8 Content check

| finding | disposition |
|---|---|
| low the accepted miss for ∼ had no test | folded (a known-miss pair, with a comment naming Appendix A) |

## 2026-10-06 nineteenth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 112e089..e8e0824; reports `inspections/2026-10-06-reinspect19-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high, a regression of the eighteenth fold), 2 FAIL (1 high, the window of the eighteenth fold's new trigger), 8 PASS (0 high, 1 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| High-1 (regression) the closed adverb list excluded the publishing act itself, so 「確認はpush後でいい」「レビューはPRを出した後でいい」 (the confirmation after publishing) were no longer waivers | folded (the publishing act may stand between the particle and 後; the catalog's waiver vocabulary takes it too) |
| Low-1 the imperative waiver's lookbehind was not bound to an ask word | folded |
| Low-2 "push changes that are fine" treated as a noun phrase | folded (only a gerund subject marks one) |
| Low-3 no test for the earlier は | folded (「pushは確認後でいい」 keeps the gate) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-1 the object-ask-verb-後 trigger read the ask word within 12 characters of 後 (「確認とテストとlintが全部終わった後にして」 lost the gate) | folded (24 characters) |
| M-1 (regression) the doubt after 減らすといい looked for 思・考 only (「とは限らない」「とは言えない」 fired) | folded (思・考・言・限ら) |
| M-2 もう・また missing from the adverbs; 「確認を後にして」 and the particle-less 「確認後でいいので」 became gates | folded (the adverbs added; を and a particle-less 後でいい are waivers; the first linker branch excludes 後でいい) |
| M-3 「自分で書いたコードのレビューが通ってから」 as the agent's own review | folded (a 「のレビュー」 ends the window) |
| L-1 the design row behind the code | folded |
| L-2 one test per exclusion word and adverb | folded |

### 8 Content check

| finding | disposition |
|---|---|
| low only ∼ of the two accepted wave marks had a test | folded (⁓ pinned too; the full-width ～ pinned as a hit) |

## 2026-10-06 twentieth re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff e8e0824..3179221; reports `inspections/2026-10-06-reinspect20-{1,2,8}-aws-claude.md`)

Verdicts: 1 FAIL (1 high, a regression of the nineteenth fold), 2 FAIL (2 high, the same regression on the catalog's side), 8 PASS (0 high, 1 low). All were folded in the following commit.

### 1 Matcher

| finding | disposition |
|---|---|
| H-1 (regression) the particle-less 「後でいい(ので|から)」 waiver let 「pushは確認後でいいので、急がなくて大丈夫」「私の確認後でいいのでpushして」 (once confirmed, no hurry) lose the gate | folded (the particle-less form counts only before 先に/まず and the publishing; the catalog gained a trigger for the no-hurry shape) |
| M-1 the conjugations of the publishing act (作った・作成した・立てた) | folded |
| L-1 the imperative waiver's optional particle | folded (the particle is required except for the 先に-bound form) |
| L-2 し after 後でいい | folded (dropped) |

### 2 Catalog

| finding | disposition |
|---|---|
| H-a (regression) 「pushは確認後でいいので、先にテストを書いて」 was blanked as a waiver | folded (the particle-less waiver needs 先に/まず and the publishing after ので/から; pinned) |
| H-b (regression) the first linker branch's exclusion also removed 「承認をもらった後でいいのでリリースして」「確認した後でいいのでpushして」 | folded (the exclusion is the waiver shape only: でいい(ので|から) + 先に/まず) |
| M-c 「自分でコードのレビューをしてから」 as a person's review | folded (a 「のレビュー」 ends the 自分で window only when received: が通る・が済む・が終わる・をもらう・を受ける・してもらう) |
| M-d 「不要とは限らない」 fired quiet-confirmations | folded (限ら in the outer doubt too) |
| L-e 「後に回す」 named in the design but not a waiver | folded (に回 is a put-off ending) |
| L-2 one test per adverb and exclusion word | folded (a generated pair per word) |

### 8 Content check

| finding | disposition |
|---|---|
| low the comments named ∼ only | folded (∼ and ⁓ named; the full-width ～ explained) |

## 2026-10-06 twenty-first re-inspection (same reviewer lineage; requests 1 matcher, 2 catalog, 8 checker against the diff 3179221..4991504; reports `inspections/2026-10-06-reinspect21-{1,2,8}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 2 medium, 3 low), 2 PASS (0 high, 2 medium, 4 low), 8 PASS (no finding). This is the first round in which all three chunks pass; the loop's exit condition (no high finding left) is met. The medium and low findings were folded in the following commit all the same.

### 1 Matcher

| finding | disposition |
|---|---|
| Medium-1 a negated put-off (「後回しにしなくていい」「後に回さなくていい」) was a waiver through the permission word | folded (the negated forms are prohibitions) |
| Medium-2 「レビューはPRを作った後にして、pushはその後で」 lost the gate | folded (the catalog gates 「pushはその後で」) |
| Low-1 「に回」 unbounded (「後に回答」) | folded (に回 before し・す・さ) |
| Low-2 a 、 after ので and PR/リリース as the ordered object | folded (with the catalog's 中1) |
| Low-3 a duplicate test row; no tests for 作成した・切った and 「確認後にして」 | folded |

### 2 Catalog

| finding | disposition |
|---|---|
| 中1 no 、 allowed after ので in the particle-less waiver shape | folded (「確認後でいいので、先にpushして」 waives; the blanking step now finds waiver phrases on the whole sentence, since this phrase looks past its clause) |
| 中2 「pushは確認後でいいので先にPRを作って」 blanked as a waiver | folded (an ask word that is the predicate of a publishing topic is not the particle-less waiver) |
| 低1 the duplicate row did not test 「後に回す」 | folded (the ruling is pinned) |
| 低2 the generated adverb list was short | folded (the design's list, token for token) |
| 低3 the no-hurry trigger duplicated the first linker and lacked 構わない | folded (removed) |
| 低4 「不要とまでは言えない」 fired quiet-confirmations | folded (と(まで)?は) |

### 8 Content check

No finding.

## 2026-10-06 twenty-second re-inspection, the confirmation of the final tree (same reviewer lineage; requests 1 matcher, 2 catalog against the diff 4991504..03ebcf6; the checker had no change since its clean pass; reports `inspections/2026-10-06-reinspect22-{1,2}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 1 medium, 2 low), 2 FAIL (1 high, the topic rule of the twenty-first fold read only adjacent words). The high and the folded items below went into the following commit; the catalog is confirmed once more after it.

### 1 Matcher

| finding | disposition |
|---|---|
| M-1 the negated put-off lacked the colloquial 「後回ししなくていい」「後回しにはしなくていい」 | folded |
| L-1 「に回さない」 anywhere in the sentence negated a waiver (「テストはCIに回さなくていい、pushは確認なしでいい」) | folded (only after an ask word and its particle) |
| L-2 the imperative waiver's objects are push/publish only while the waiver phrase accepts PR/リリース | recorded (the permission word covers those; an intended asymmetry) |

### 2 Catalog

| finding | disposition |
|---|---|
| 高1 the topic-object exclusion read only adjacent words, so 「リリースは私の確認後でいいので、先にリリースノートを書いて」「pushは私の確認後でいいので、先にPRを作って」「pushは、確認後でいいので先にPRを作って」 were waivers | folded (a word or 、 between the topic and the ask word is allowed, within sixteen characters; the ordered thing must be the publishing itself, not a compound) |
| 中1 (regression) the その後で form gated 「lintを直して、pushはその後で自由にして」 | folded (a permission after その後で says it is no gate; a lookbehind for an ask word cannot work there, since the matcher blanks the clause that was put off before it reads the remainder) |
| 低1 OK/オーケー missing from the topic rule's ask words | folded |
| 低2 「後に回せばいいので」 neither a waiver nor a gate | folded (回せ) |
| 低3 全て in the tests but not in the design's list | folded (the design lists it) |

## 2026-10-06 twenty-third re-inspection, the second confirmation (same reviewer lineage; requests 1 matcher, 2 catalog against the diff 03ebcf6..367cd76; reports `inspections/2026-10-06-reinspect23-{1,2}-aws-claude.md`)

Verdicts: 1 PASS (0 high, 2 medium, 2 low), 2 FAIL (1 high, introduced by the previous confirmation fold's permission list after その後で). Folded in the following commit; the catalog is confirmed once more after it. The その後で and put-off forms have now taken a fold in three consecutive rounds, so they are settled on the safe side: a gate unless a strong permission follows, and a negated put-off only after an ask word.

### 1 Matcher

| finding | disposition |
|---|---|
| 中-1 the negated put-off read 後 only (「あと回しにしなくていい」 lost the gate) | folded (後 and あと) |
| 中-2 the potential 「後回しにできない」「後に回せない」 | folded |
| 低-1 the first two negated forms were not bound to an ask word (「バグは後回しせず」 negated a waiver) | folded (all forms after an ask word and its particle) |
| 低-2 OK/オーケー in the matcher's topic rule could never match | folded (removed there) |

### 2 Catalog

| finding | disposition |
|---|---|
| 高-A (regression) いい・OK・大丈夫 among the permissions after その後で made 「pushはその後でいい」 lose the gate | folded (only 自由・好きに・勝手に・任せる count) |
| 中-B the permission window crossed a 、 (「pushはその後で、私がOKを出したら」) | folded |
| 中-C the topic rule required a particle (「push確認後でいいので」 waived again) and reached an object in an earlier clause (「PRを作ったら、確認後でいいので先にpushして」 gated) | folded (the particle optional; no 、 inside the window except right after the particle) |
| 中-D 「先にPRの説明を書いて」 taken as the publishing | folded (の removed from the ordered-object forms; the linker exclusion mirrors the full waiver shape) |
| 低-E no test for OK as the topic's ask word | folded |

## 2026-10-06 twenty-fourth re-inspection, the catalog re-check (same reviewer lineage; request 2 catalog against the diff 367cd76..70dd6c3; report `inspections/2026-10-06-reinspect24-2-aws-claude.md`)

Verdict: 2 PASS (0 high, 2 medium, 2 low). With this the final tree carries a pass for every chunk: the matcher (twenty-third round), the catalog (this round) and the content check (unchanged since its clean twenty-first-round pass). The loop ends here; the findings below are recorded as open items rather than folded, because the その後で and put-off forms had taken a fold in three consecutive rounds and each fold produced the next round's high.

| finding | disposition |
|---|---|
| 中-1 a negated put-off more than eight characters after the ask word and its particle (「確認は後でいいと前に書いたが、後回しにはしないで」) is no longer a prohibition | open (a restated line; the prohibition is bound to the ask word on purpose, so that 「バグは後回しせず」 beside a waiver is not one) |
| 中-2 「pushの確認は絶対に後回しにしないで」 matches no trigger (絶対に・決して are not put-off adverbs, and no ordering word is present) | open (the recipe is still proposed from any other asking line; the reviewer's suggested gate trigger, object…ask…後回し…しない, is the next fold if one is wanted) |
| 低-1 「pushしてOK、テストを書いた後でマージして」 gates (a bare OK with a 、 before 後) | open (safe side) |
| 低-2 no positive tests for the four strong permissions after その後で, nor for the eight-character bound | open |
