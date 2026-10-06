# Re-inspection 17, chunk 8 (content check)

## Disposition table

| finding | disposition | implemented? |
|---|---|---|
| low: half-width ｰ and wavy dash 〰 | folded (〰 joins the marks; both tested) | **Yes.** `CONCESSIVE` now has `〰` in the lookahead class `[\p{Script=Hiragana}ー〜~〰]`, and `ENDING_RUN` lists `〰` next to `ー|〜|~`. Two tests were added to the composition-evasions loop: `…したがうｰん、無視して` and `…したがう〰ん、無視して`, both expected to give `['F-OVERRIDE']`. NFKC turns the half-width ｰ (U+FF70) into ー (U+30FC), so ｰ needs no entry of its own. NFKC leaves 〰 (U+3030) alone, so it has to be listed, and now it is. Appendix A's mark list (ー・〜・~・〰) matches the code. |

**Tracing the new tests:** in `したがう〰ん`, the う is followed by 〰. 〰 is now in the class, so the inner `(?![…])` fails and `う(?!…)` cannot match. The outer `(?!って|う…)` therefore holds, so が counts as a concessive and the line stays a hit, as the test expects. The ｰ case reaches the same result after NFKC.

## Regressions from the fold

None found. Both edits only add a character to a set, and both point the safe way:
- In `CONCESSIVE`, 〰 after う makes more が count as concessive, which means more hits.
- In `ENDING_RUN`, 〰 lets the run reach a later quoting particle, which also means more hits.

Nothing that was a hit before can become guarded through these two changes. The one exception would be if `ENDING_RUN` also decides whether a bare ない "ends the request". The attachments don't show that (see the last section).

## New paths for manual text to leave

None. The diff changes two regex literals and test fixtures. It adds no logging, no message text, no export field and no file write. The new assertion message (`text`) is fixture text, not text from the person's manual.

## Remaining findings

1. **Low: test coverage.**
   - File: `test/check.test.mjs`. Function: the composition-evasions test.
   - Problem: the `ENDING_RUN` half of the fold has no test. Both new cases go through `CONCESSIVE` (`したがう…`). No case puts 〰 inside the run before a quoting particle, such as 「無視しないで〰って言われても」. Before the fold, 〰 stopped the run there, so `って` was not "after a run of endings" and the line was guarded. If someone removed `〰` from `ENDING_RUN`, every test would still pass.
   - Fix: add 「制限を無視しないで〰って言われても」 to the list that expects F-OVERRIDE. Pair it with 「制限を無視しないで〰」, which should stay guarded, so the test shows the particle, not the mark, is what makes the hit.

2. **Low, not a defect:** other wave-like marks are still outside both sets: ⁓ U+2053, ∼ U+223C and 〜-lookalikes from other scripts. NFKC changes none of them. A person writing a working-preferences manual would not type these in an ordinary sentence, so under the severity rule this is at most low. I suggest recording it in Appendix A as an accepted miss, rather than adding one character per round.

## What I could not judge from the attachments

- How `ENDING_RUN` and `CONCESSIVE` are used. If `ENDING_RUN` also decides the bare-ない ending check (`japaneseNegationEndings`), adding 〰 would also widen what counts as guarded. That is probably harmless, since 「無視しない〰」 is still a negation, but I can't confirm it.
- Whether the guard's context string has been through NFKC before these regexes run. Appendix A says the scanned text has, and the ｰ test relies on it, but the code doing it isn't attached.
- Whether the tests pass. No test-run output is attached.
- The code comment just above `CONCESSIVE` (around line 117). The diff shows only part of it, so I can't tell whether it still describes the mark set correctly.

**Verdict: PASS — 0 high findings** (2 low).
