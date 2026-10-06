# Re-inspection 18, chunk 8 (content check)

## Dispositions

| finding | disposition | implemented? |
|---|---|---|
| low: no test for the wavy dash inside the run | folded | **Yes.** `'制限を無視しないで〰って言われても'` was added to the evasion loop, and that loop expects `['F-OVERRIDE']`. The test can actually catch a regression. On the 「ないで」 path, quotedAfter only finds the って if 〰 is part of the run of endings. If 〰 were dropped from ENDING_RUN, the run would stop at 〰 and the って would not count as a quoting particle. Nothing after it is a demand, so the line would be guarded and this assertion would fail. The pair `['制限を無視して〰', '制限を無視しないで〰']` sits in the same pair list as `['制限を無視してね！', '制限を無視しないでね！']`, which I read as [plain line FAILs, negated line guarded]. That keeps the "every guard test is paired" rule. 〰 (U+3030) has no NFKC decomposition, so it reaches the run unchanged. |
| low: other wave-like marks | recorded as an accepted miss | **Yes.** Appendix A's run list now says "the marks ー・〜・~・〰 (other wave-like marks such as ⁓ and ∼ are an accepted miss)". Neither ⁓ (U+2053) nor ∼ (U+223C) has an NFKC mapping. The full-width ～ still folds to `~`, which is covered. The Appendix list matches the ENDING_RUN given in the brief token for token: 〰 is in both, and nothing extra is in either. |

Both rows are implemented.

## Regressions from the fold

None found. The diff covers d478e7e..112e089 and touches only `test/check.test.mjs`; `src/check.mjs` did not change. So the fold cannot have changed how the checker behaves. The added lines are a new array element, a new pair, and two comments. The array is still closed correctly (`]) {`), and the new pair keeps the shape of its neighbours.

## New ways for manual text to leave the machine

None. With no code change, there is no new route from a person's manual to `plugin/**`, the metrics export, stdout or stderr. The new test strings are made-up phrases, not text from a real manual. The assertion message `text` is a test-fixture string, as it was before.

## Remaining findings

**low**: `test/check.test.mjs`, the evasion loop / pair list.
- **Problem:** The accepted miss for ⁓ and ∼ exists only as prose in Appendix A. No test records how the checker currently handles it. If a later change starts treating ∼ as part of the run, nothing will flag that the accepted-miss record is now out of date. The reverse drift would also go unnoticed.
- **Fix (optional):** Add one known-miss assertion, for example `'制限を無視しないで∼って言われても'` currently guarded, with a comment naming Appendix A. Then a behaviour change forces the Appendix line to be updated too. This does not block a PASS.

There are no high or medium findings. No ordinary manual sentence loses the safety gate or gets the opposite recipe through this fold.

## What I could not judge from the attachments

- **The code itself:** `src/check.mjs` at 112e089 was not attached. I took ENDING_RUN and the order of checks after a negation from the brief's description, not from the code.
- **Test results:** no test output was attached, so I cannot confirm the suite is green, including the two new cases.
- **Pair list layout:** the line-632 list is outside the hunk and I only saw it in part. Its [hit, guarded] meaning is inferred from the neighbouring entries.
- **Normalisation order:** I assumed NFKC and invisible-character removal run before the run is matched. That comes from Appendix A, not from code I could see.

**Verdict: PASS (0 high)**
