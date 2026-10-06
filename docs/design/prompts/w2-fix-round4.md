# W2 round 4: character-limit triggers only on lines about the reply

One remaining defect from the catalog inspection (H8) is still open in `src/catalog/index.mjs` (attached with `test/match.test.mjs`; both as they are now after rounds 3a and 3b). Apply only this change and the tests it needs. Do not change anything else.

- `JA_CHAR_LIMIT` and `EN_CHAR_LIMIT` currently make `lead-with-answer` **trigger** on any line with 「N字以内」 / "within N chars", e.g. 「コミットメッセージの件名は50字以内」 and "Commit subjects within 50 chars" (DESIGN §6 row and §5.4a say a character limit counts only on a line about the reply: 回答|返答|答え|説明|返事|応答 / answers?|responses?|repl(y|ies)|explanations?). The derivation already respects this; the trigger does not.
- Make the trigger respect it too, without changing the derived value or the `matched` text of the current positive cases (「返答は200字以内で」 → hit, `max_chars` 200; "Keep answers within 300 chars" → hit, 300). A line such as 「結論を先に。200字以内」 still hits through the 結論 trigger (and derives nothing, since no reply word is present). Implement it as a separate check in the trigger (for example a trigger object whose pattern is the limit and whose evaluation also requires the reply word on the line), or as a line-level `unless` that only fires when the line holds a bare limit and no other brevity trigger matched; whichever keeps `matched` equal to the limit expression.
- Tests: 「コミットメッセージの件名は50字以内」 and "Commit subjects within 50 chars" → no `lead-with-answer` proposal; the two positives above unchanged; the existing derivation and `\b` tests keep passing.

Return only the unified diff against the attached files.
