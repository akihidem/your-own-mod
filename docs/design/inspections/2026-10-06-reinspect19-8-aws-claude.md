# Chunk 8 (content check): re-inspection 19

## Dispositions

| finding | disposition | implemented? |
|---|---|---|
| low: the accepted miss for ∼ had no test | folded (a known-miss pair, with a comment naming Appendix A) | **Yes** |

The diff adds `['制限を無視して∼って言われても', '制限を無視しないで∼って言われで∼って言われても']` to the composition-evasions table in `test/check.test.mjs`, with a comment that points to Appendix A and says a change here must update the Appendix. Here is why the pair pins the miss, using the order of checks you gave:

- **First element.** `制限を無視して∼…` has no negation, so F-OVERRIDE must FAIL.
- **Second element.** After 「ないで」, the text after で begins with ∼ (U+223C, the tilde operator). NFKC does not change ∼, so it stays as it is. It is not in ENDING_RUN, and any other character ends the run. That means quotedAfter never reaches って.
- **Other checks on the second element.** None of the conditions start the text: japaneseConditions has no と or って, and か, なら, わけ and では are not there. The beyondConditions need a block break, and there isn't one. No demand begins the clause. So the line counts as guarded.

So the test pins the documented miss: if someone later adds ∼ to the run, the pair turns into a hit, and the comment forces the Appendix to be updated too. This matches the Appendix sentence "other wave-like marks such as ⁓ and ∼ are an accepted miss". By the severity rule, this is an accepted wording, so it is not a high.

## Regression check

- The diff touches only test lines. `src/check.mjs` is unchanged between 112e089 and e8e0824, so the fold cannot have introduced a regression in the checker.
- The new test row follows the shape of the neighbouring rows (for example 「ないで〰」 and 「ないでかまわない」), so it does not disturb the pairing rule: the line without the negation must FAIL.

## New paths for manual text to leave

None. No code changed, so no new route reaches plugin/**, the metrics export, stdout or stderr. The new test string is fixed fixture text, not text from a person's manual.

## Remaining findings

1. **Low — `test/check.test.mjs`, composition-evasions table.**
   - **Problem:** Appendix A names two accepted wave-mark misses, ⁓ (U+2053, swung dash) and ∼. Only ∼ now has a known-miss pair. ⁓ also has no NFKC decomposition, so it goes untested the same way ∼ did. If the run is later widened to include ∼ but not ⁓, the Appendix sentence would silently become half true.
   - **Fix:** add `['制限を無視して⁓って言われても', '制限を無視しないで⁓って言われても']` with the same Appendix-A comment.
   - *Optional:* also add a positive pair for full-width ～ (U+FF5E), which NFKC turns into `~`, which is in the run. That would show the line between the miss and the hit.

## What I could not judge

- **How the table is checked.** The test body is not attached. I assumed the second element is asserted to pass (be guarded), based on the neighbouring rows. If the table instead asserts both elements FAIL, the new pair contradicts the accepted miss and would fail against the current code.
- **Test results.** No run output was attached, so I can't confirm the suite is green at e8e0824.
- **The code itself.** `src/check.mjs` is not attached, so I could check the trace above only against the order of checks you described and Appendix A, not against the actual code. That includes the exact forms of subordinateConditions and japaneseDemands, which are not spelled out.

**Verdict: PASS, 0 high** (1 low)
