# W2 round 3: fixes from the independent inspection of round 2

This is round 3b: the **matcher** (`src/match.mjs`) and `test/match.test.mjs` (attached as they are after round 3a). The catalog was already updated in round 3a and is not attached; rely on the Recipe contract in the excerpt (`docs/design/contracts/w2-brief-matcher-v0.2.4.md`). An independent reviewer (a different model) inspected round 2; the design is now v0.2.4 (excerpt `docs/design/contracts/w2-brief-v0.2.4.md` attached: §5.1, §5.3, §5.4a changed). Apply every item; you may change only the attached files. Keep tests that are still correct.

## A. Matcher (`src/match.mjs`)

1. For rows, test `unless` against the cell the trigger matched, not the joined `text` (a negation in the left "avoid" cell must not cancel a right-cell trigger). Bullets and text lines keep the whole `text`.
2. Evidence quotes `line.quote` (the parser now provides it: `raw` minus inline comments; fall back to `raw` when absent). `matched` stays the matched substring.
3. Ranking: recipes with `priority: 'safety'` come first, then confidence, evidence count, catalog order. `maxEnabled` must be a non-negative integer or `Infinity`, else `TypeError`.
4. The first hit that determined the proposal's confidence is always quoted (same mechanism as the parameter-source rule: replace the last entry when the cap is reached).
5. `slugFor`: skip a candidate that contains a forbidden term of Appendix A's English list (case-insensitive) and continue the chain; report `slugSource`.
6. `publish-guard` conflict rule: when a line both waives and asks (a waiver pattern and a trigger both match the same text), the recipe still hits with confidence capped at `medium`; a waiver counts only when it is not itself negated (see B7).


## C. Tests for this round (in `test/match.test.mjs`)

- Items 11, 12, 14 of the full round-3 list: a DO/DON'T row whose left cell carries a negation and whose right cell asks to be asked before pushing → publish-guard hits (and the same for quiet-confirmations' left cell); ranking with three high-confidence style recipes (three quotes each) plus publish-guard with one quote → publish-guard first and on by default; `maxEnabled` 0 → none on, `-1` and `'3'` → TypeError; confidence quoting (three unknown-section hits then one style hit → high, and the style line is quoted); slug: a title containing a forbidden English term falls through to the next candidate; `slugSource` values.
- Turn any `{ todo: true }` test left by round 3a into a real test.
- Hand-built Profile lines in the helper now carry `quote` (equal to `raw` unless the test plants an inline comment) and `sectionIndex`.

Return only the unified diff against the attached files.
