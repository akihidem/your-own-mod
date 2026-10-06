> Note (2026-10-06): the example phrases in this prompt were reworded before publication so that no line of a real person's manual appears in the repository; the worker received the earlier wording.

# W2 round 2: fixes from the independent inspection (catalog, matcher, diff)

You wrote `src/catalog/index.mjs`, `src/match.mjs`, `src/diff.mjs` and their tests in round 1 (attached as they are now). An independent reviewer (a different model) read them, and an integration run on a real manual found two more defects. The design was updated to v0.2.1 (DESIGN.md attached; §5.3, §5.4a, §5.7 and §6 changed). Apply every item. Keep existing tests that are still correct; change expectations only where this prompt says the design changed.

## A. Defects found on real input (must fix)

1. `quiet-confirmations`: the words 過剰確認／念のため確認／over-confirm live in the **left** (avoid) cell of the DO/DON'T table, so those triggers need `cell: 'left'` (the recipe implements the opposite of what the cell names, DESIGN §6 polarity rule); 確認せず／即実行／"don't ask for confirmation"／"just do it" stay `right`/any. Verify on a hand-built row `{ left: '「本当に進めていいですか」と毎回聞く過剰確認', right: 'すぐ実行し、止まる場面だけ名指しで止まる' }` → hit. Check every other recipe's `cell` choices the same way (plain-language, one-next-step, trace-offers read the right cell; block-ahead-warning's 認証 wording appears in §6 bullets, not rows).
2. `publish-guard` `unless` is too broad: 「都度確認不要、ただし push は確認して」 and "No confirmation needed for edits, but ask before pushing" must still trigger (both quiet-confirmations and publish-guard may be enabled from one line; add that test). Restrict the unless to negations that target publishing itself (`push.*(確認|許可)(不要|しない|なし)`, `(push|publish).*(without|no) (asking|confirmation)` …) plus push通知／push notification.

## B. Design changes to implement (v0.2.1)

3. Placeholders: `{language}` is filled with the language **name** (so the rule reads "Respond in Japanese"); rule text for `lead-with-answer` uses `{max_lines}` and `{max_chars_clause}` (the emitter fills the clause with '' when `max_chars` is 0, else " and within N characters"); never write "when 0 is greater than zero".
4. Evidence: a hit whose line contributed a derived parameter is always included in `evidence` (replacing the last entry when the 3-cap is reached).
5. Derived numbers are rounded to integers then clamped to `min..max`; a derived range with min > max is ignored; strings only from `options`.
6. `buildBundle(profile, proposals, { file, sha256, pluginName, files = [], recipes = RECIPES })`: `notMatched` = ids of `recipes` without a proposal; a proposal whose id is not in `recipes` throws; `files` sorted.
7. `slugFor(profile, { name })` candidate chain: `name` → frontmatter `name` → frontmatter `user_alias` → title; NFKC-normalise each, lowercase, ascii letters/digits/hyphens, collapse, trim, max 40; first non-empty wins; all empty → `'profile'`. Add `slugSource(profile, { name })` → `'option' | 'frontmatter' | 'alias' | 'title' | 'fallback'`.
8. `unless` applies regardless of the profile language (document it in a comment; `lang` is informational).
9. `diffProposals`: throw on duplicate `recipeId` in either input; `formatDiff` labels a change whose only field is `enabledByDefault` as "(default toggle only)" / 「（既定の ON/OFF のみ）」.

## C. Trigger quality (reviewer findings; each gets a positive and a negative test)

10. `lead-with-answer`: the 字/chars derivation requires an upper-bound word (以内|程度|まで|くらい|under|within|max|at most) and `unless 以上|at least`; the number is bounded on the left (`(?<!\d)`); `words` is not derived (drop it).
11. `response-language`: en triggers require a language name right after (`(respond|reply|answer) in (japanese|english)`); derivation strips `X ではなく|でなく|じゃなく` and `not X|instead of X|rather than X` before taking the first language name (「英語ではなく日本語で返答して」 → ja; "in Japanese, not English" → ja).
12. `offer-options` range: `([2-9２-９])\s*[〜～~–-]\s*([2-9２-９])\s*(案|options?|alternatives|choices)`; min ≤ max enforced; the en trigger `alternatives` alone is not enough (require `(give|offer|present|show|compare|list) (me )?(some )?(alternatives|options)` or `(two|2|three|3) to (four|4|five|5) options`).
13. `focus-timer`: minutes derived only from a line that also mentions 休憩|break|remind|timer|pomodoro; triggers 休憩.*(知らせ|促|リマインド|教え)／タイマー.*(入れ|掛け|かけ|使)／時間を忘れ／過集中; en `break reminder|remind me to (take a )?break|hyperfocus|lose track of time|pomodoro`.
14. Narrow the broad ja triggers: block-ahead-warning `(認証|承認ダイアログ|PAT|許可ダイアログ).*(煩雑|手数|失速|負担|面倒|止ま)`; session-resume-brief `(セッション|案件|プロジェクト|タスク|文脈).*(切替|切り替え|並行)|読み直(し|す)`; respect-stop-signals `(一旦やめる|あとで|終わり|おわり|一旦ここまで).*(シグナル|合図|と(言|い)ったら|と打ったら|出したら|したら)|立ち止まり|距離を取`; publish-guard `外部公開|公開(する|前|時)` with `unless 非公開|公開鍵`; receive-only `(まず|ただ)受け取(る|って)|受け取るだけ|短文断片|押し返さ`; running-indicator en `can't tell (if|whether).*(running|working|still|progress)|still running|background work`.
15. `accept-typos-as-intent` en unless: only `(fix|correct) (my |the )?(typos|spelling|misspellings)` (not any "please fix").
16. `publish-guard` ja summary states the limit (Bash only; scripts that push internally and other tools are not covered), as the en summary does.

## D. Tests

17. Forbidden-term scan of catalog texts: assert every title/summary/rule/note is a `{ja, en}` object of strings before scanning; scan with the Appendix A lists (ja and en); short ASCII abbreviations (ADD, ASD, HSP, IQ, OD, DAN) case-sensitively.
18. Every polarity-negative and `unless` case first proves the trigger fires with `unless: []`, then that the real recipe does not fire.
19. Ranking tie test within one confidence (5 hits vs 3 hits vs catalog order); confidence tests select the recipe by id, not `[0]`; `\b` check per alternative of en patterns; derived ranges with min > max ignored; `DEFAULT_MAX_ENABLED` read from constants.
20. `diff`: Japanese labels asserted line by line; the "none" / 「なし」 case; duplicate id throws; an integration test that runs `matchRecipes` on two hand-built profiles differing in one section and feeds the bundles to `diffProposals`, asserting exactly the expected added/removed/changed ids (note a toggle-only change when the ranking shifts).

Return only the unified diff against the attached files.
