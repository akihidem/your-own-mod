# W2 round 3: fixes from the independent inspection of round 2

You wrote `src/catalog/index.mjs`, `src/match.mjs`, `src/diff.mjs` and their tests (attached as they are now). An independent reviewer (a different model) inspected round 2; the design is now v0.2.4 (excerpt `docs/design/contracts/w2-brief-v0.2.4.md` attached: §5.1, §5.3, §5.4a changed). Apply every item; you may change only the attached files. Keep tests that are still correct.

## A. Matcher (`src/match.mjs`)

1. For rows, test `unless` against the cell the trigger matched, not the joined `text` (a negation in the left "avoid" cell must not cancel a right-cell trigger). Bullets and text lines keep the whole `text`.
2. Evidence quotes `line.quote` (the parser now provides it: `raw` minus inline comments; fall back to `raw` when absent). `matched` stays the matched substring.
3. Ranking: recipes with `priority: 'safety'` come first, then confidence, evidence count, catalog order. `maxEnabled` must be a non-negative integer or `Infinity`, else `TypeError`.
4. The first hit that determined the proposal's confidence is always quoted (same mechanism as the parameter-source rule: replace the last entry when the cap is reached).
5. `slugFor`: skip a candidate that contains a forbidden term of Appendix A's English list (case-insensitive) and continue the chain; report `slugSource`.
6. `publish-guard` conflict rule: when a line both waives and asks (a waiver pattern and a trigger both match the same text), the recipe still hits with confidence capped at `medium`; a waiver counts only when it is not itself negated (see B7).

## B. Catalog (`src/catalog/index.mjs`)

7. `publish-guard` `unless`: a waiver is cancelled when the same text ends in a negation (`ないで|ないでください|ないこと|しないこと|禁止|ダメ|だめ`) or starts with `never|don't|do not|do not ever|please don't`. Positive tests: 「確認せずにpushしないで」「許可なしにpushしないこと」「pushは確認しないとダメ」"Don't push without asking." "Never publish with no confirmation." all hit; 「push は確認しなくていい」 and "No confirmation needed for pushing" do not (unless the same line also asks: then hit at medium).
8. Give `publish-guard` `priority: 'safety'`.
9. Every trigger that can read a row carries an explicit `cell`; `left` only on quiet-confirmations, offer-options, one-next-step, plain-language, trace-offers (and only for wording that names the thing to avoid). Add a catalog test: no row-capable trigger lacks `cell`; `left` only on that allow-list.
10. Derived parameters per recipe ≤ 3 (catalog test); keep the throw as an internal invariant with a clear message.

## C. Tests

11. Row tests: a DO/DON'T row whose left cell carries a negation (「確認しない」) and whose right cell asks to be asked before pushing → publish-guard hits; the same with quiet-confirmations' left cell.
12. Ranking: three high-confidence style recipes with three quotes each plus publish-guard with one quote → publish-guard is first and on by default; `maxEnabled` 0 → none on; `maxEnabled: -1` and `'3'` → TypeError.
13. `wrongCell` polarity test: first prove the left-cell wording triggers when read as `any`, then that the real recipe (right cell) does not.
14. Confidence quoting: three unknown-section hits followed by one style-section hit → confidence high and the style line is among the quotes.
15. slug: title "Autism notes" → falls through to the next candidate; forbidden-term test shape: `rule`/`note` are `{ en }` objects (align the test with the contract), titles/summaries `{ ja, en }`.

Return only the unified diff against the attached files.

## D. From the catalog inspection (part A; the reviewer executed your patterns on sample lines)

16. `publish-guard` triggers (§6 v0.2.4): en `\bbefore (?:you )?(?:push|publish)(?:ing|es)?\b`, `\b(?:ask|check with|confirm with|get (?:my )?(?:ok|approval))(?: me)?(?: first)? before\b`, `\b(?:never|don['’]t|do not) (?:push|publish)\w* without\b`; ja objects `push|プッシュ|PR|プルリク|Issue|リリース|外部公開|公開(の)?前|公開する前` with asking words `確認|承認|聞いて|聞く|尋ね|相談|同意|OKをもら|y/n` in a before/after order (`前に|してから|出す前`), so 「PRのレビュー結果を確認して」 does not hit but 「pushは承認を得てから」「プッシュする前に確認して」「公開する前に聞いて」 do. Waivers: drop the en waiver that only looks one word back; a ja or en waiver is cancelled when the text contains any negation (`never|not|don't|do not|no ` / `ない|な(いで)?|禁止`) or an asking word; 「非公開」「公開鍵」 cancel only the 公開 match. Positive tests: "Ask me before pushing.", "Check with me before publishing.", "Confirm with me before you open a PR.", "Don't push without asking.", "Ask before pushing — never ever push without asking.", 「確認せずにpushしないでください」「許可なしでpushしないで」「pushは許可なしにしない」「非公開リポジトリでもpushの前に確認して」.
17. False positives to kill (negative tests): `respect-stop-signals` bare `pause`, bare `wrap up` ("Wrap up each answer with a one-line summary"), bare `したら`; `focus-timer` 「締切の時間を忘れずに伝えて」 (`時間を忘れ(?!ず)`); `receive-only` "When you receive it, validate the JSON"; `session-resume-brief` 「送信前にコードを読み直してから答えて」; `running-indicator` 「不確実な点は明示して」; `lead-with-answer` 「ビルド時間を短く」 and the unless `以上`/`at least` only as `\d+\s*字以上` / `at least \d+ (chars|words|lines)` (「結論を先に。以上の方針で。」 stays a hit).
18. Polarity: `accept-typos-as-intent` unless `(point out|flag|tell me about|catch) (my )?(typos?|spelling)`, `correct me when I misspell`, 「(誤字|表記揺れ).*指摘して(?!.*ない)」 ("Please point out my typos" must not hit); `offer-options` left cell = 一案だけ|一択|only one option|a single option (move "more than one option" to right); `focus-timer` unless `(don't|do not|never) (interrupt|disturb)`, `(話しかけ|割り込|邪魔し)(ないで|ない)` ("Don't interrupt me when I hyperfocus" must not hit); left-cell triggers are noun phrases (`長い前置き|前置きが長い`, `long preambles`), never negated verbs.
19. Derivations (§5.4a v0.2.4): `max_chars` only from a line naming the reply and a bound word (「コミットメッセージの件名は50字以内」 → no derivation); `response-language` from the matched trigger's capture (「コードのコメントは英語で、返答は日本語で」 → ja; "I can read English, but reply in Japanese." → ja); `focus-timer` from `(\d+)\s*分(ごと|おき|毎|間隔)` / `every (\d+) ?min` / `(\d+)\s*(時間|hours?)`×60 on a line mentioning 休憩|break|remind|timer|タイマー|pomodoro|ポモドーロ (「5分の休憩を1時間ごとに知らせて」 → 60; 「タイマーを25分で入れて」 → 25); full-width digits accepted; `(?<![\d.])` before numbers.
20. Rule texts: `one-next-step` ends with "unless the user signals a stop or sends a short state fragment"; `lead-with-answer`: "Lead with the answer. Keep explanations within {max_lines} lines{max_chars_clause}, unless the user asks for more detail or for complete code."; remove `ja` rule/note variants that lack placeholders (the emitter uses `en` only).
