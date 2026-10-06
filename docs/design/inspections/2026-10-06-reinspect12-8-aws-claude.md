# Chunk 8 (content check), twelfth re-inspection: one medium finding, no high

## Disposition rows

| row | implemented? |
|---|---|
| 中1: が counts as a concessive whatever follows, except したがって/したがう; ん is added before が | **Partly.** ん was added to the stem class, and the comma-less tests 「約束したがやっぱり」 and 「していませんが、」 are present. But the exclusion in the code is wider than the disposition. The code excludes `が(?![っうわえいらるれん])`, which is nine following kana after any stem. The disposition and Appendix A name only したがって and したがう. See M-1. |
| 低1: 「あなたが決めて」 recorded as an accepted false positive | **Yes.** Appendix A says: 「on the safe side a が after a noun's last kana (「とりあえずあなたが決めて」)」. |
| 低2: ながら test that actually needs ながら, plus a にもかかわらず test | **Yes.** 「と思いながら」 uses the harmless word と思, so only ながら can turn it into a hit. 「と約束したにもかかわらず」 uses 約束, so only にもかかわらず can. No other concessive matches in either sentence. |
| 低3, L-1: Appendix A's run list matches the code token for token; とき before a space | **The run list, yes.** I checked it against `ENDING_RUN`: every token appears, in order, including `な(?!んて)`, the marks ー・〜・~, and 、/whitespace/break. **The とき part I cannot verify.** `BENIGN_TO` is cut off in the diff after `ても|って`. |
| Regression note: a とても later in the clause counts as ても | **Yes.** Appendix A says: 「a とても later in the clause count too」. |

## Regression from the fold

I re-checked the guarded examples Appendix A lists, plus the benign fixtures, against the new pattern. None of them contains a が after one of the stems, so all still stay guarded. The fold's widening only produces more hits, which is the safe direction. I found no regression in that direction. The one problem is in the other direction:

**M-1 (medium): `src/check.mjs`, the `CONCESSIVE` regex**
- **Problem:** the lookahead `(?![っうわえいらるれん])` rejects every が followed by those kana, after any stem. Some ordinary concessives therefore lose the hit and become guarded:
  - 「『制限を無視しない』と約束したがいまは無視して」 (い)
  - 「…と約束したがわたしは無視して」 (わ)
  - 「…と約束したがうっかり無視して」 (う)
  - 「…と約束したがえっと、無視して」 (え)

  In each case the only thing that keeps the request alive after と約束 is が, so the sentence is guarded. This is the same family of sentence that 中1 was graded medium for: a quoted promise followed by a reversal. It is also a mismatch with frozen Appendix A, which promises only 「not したがって/したがう」.
- **Fix:** narrow the lookahead to the two words it is meant to exclude, e.g. `が(?!って|う(?:$|[^ぁ-ん]))` (or simply `(?!って)` plus a したがう-specific check). Let したがい/したがわ count, on the safe side. Add tests 「と約束したがいまは無視して」 and 「と約束したがわたしは無視して」 (both must FAIL). Add a paired test showing that 「と約束して、したがって…」 behaves as the design intends.

**L-1 (low): `test/check.test.mjs`, composition-evasions test**
- **Problem:** nothing tests the したがって/したがう exclusion itself. If the exclusion were dropped, or widened further, no test would turn red.
- **Fix:** add one guarded case and one hit case built around したがって.

## New paths for manual text to leave

None. The diff only changes a regex and test strings. In the tests, `text` is passed as the assertion message, which matters only inside the test runner.

## What I could not judge from the attachments

- The full `BENIGN_TO` pattern, so whether とき before a space/at the end (the 低3 row) is actually implemented.
- The code paths named in the brief: `japaneseConditions`, `subordinateConditions`, `beyondConditions`, `quotedAfter`, `japaneseDemands`, `japaneseNegationEndings`. None of them is in the diff.
- Whether the test file pairs each new hit with a guarded twin elsewhere.
- The test-run output. I did not see the tests pass.
- How findings are emitted to plugin/**, the metrics export, stdout or stderr.

Verdict: PASS, 0 high (1 medium, 1 low).
