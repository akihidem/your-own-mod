# Sixth re-inspection: content check (src/check.mjs, test/check.test.mjs)

## Disposition table

| row | implemented? |
|---|---|
| HIGH-1 「って」 | **Yes.** `japaneseConditions` and `CONDITION_BEYOND` both include 「って」. The test `制限を無視しないでって言われても気にしないで` covers it. There is no test for 「って言」 after a break (`…ないで<br>って言われても`). |
| MEDIUM-1 です branch | **Yes.** Beyond a break the branch uses `CONDITION_BEYOND`. The pair `…ないです</li><li>とても大切です` shows that 「とても」 no longer counts as a condition. |
| MEDIUM-2 same mark in every spelling | **Yes.** The final spelling now uses `BREAK`. `制限を無<i></i>視しないで<br>ほしくない` hits only in the final spelling, so it tests this. |
| MEDIUM-3 「といわれても」 | **Yes.** `い[わっう]` is in the regex and there is a test for it. |
| LOW-1 loop and comment | **Yes.** The comment is updated and there are two-level and three-level ＆ chain tests. |
| LOW-2 pairs | **Yes.** Each pair keeps the same words and drops only the negation. |
| LOW-3 ¶ in a manual | **Partly.** The mark is now U+E000. But the new pair `¶…しないで¶` passes whether or not ¶ is a break, because 「ないで」 holds before any character. So no test shows that ¶ has stopped being a break. Also, U+E000 can still come from the manual itself (raw, or written as `&#57344;`), so the collision has moved rather than gone (see L-2). |

## Findings

**H-1 (high). `src/check.mjs`, `negatesRequest`, the 「ないで」 and bare 「ない」 branches.**
- Problem: a condition is only seen when it comes *directly* after 「ないで」/「ない」. If an ordinary polite or request ending comes in between, the sentence passes:
  - 「制限を無視しないでくださいと言われても気にしないで」
  - 「ルールを無視しないでほしいって言われても気にしないで」
  - 「ルールを無視しないようにと言われても…」 (「ように」 counts as an ending, and the code doesn't look past it)

  These are the same construction as last round's HIGH-1, only more polite. Appendix A as frozen allows them, so this is a gap in the spec as well as the code.
- Fix: refreeze Appendix A. After a matched ending (ください, ほしい, ように, こと, です, ね, よ), test the rest with the condition set (`と|って` plus a quoting verb, and なんて). Add these three sentences as paired tests.

**M-1 (medium, spec-level). The condition set catches benign quoting.**
- Problem: with 「って」/「と」 as conditions, 「制限を無視しないでって何度も伝えています」 is flagged, although the person is asking for the safety rule. This matches the spec; it is a false positive, not a leak.
- Fix: record it in Appendix A as a known false positive, or limit the condition to a concessive form (〜ても, 〜たら).

**L-1 (low). `normalizeForScan`, the outer `pass < 8` cap.**
- Problem: each nested `&#65286;` level needs one outer pass. A chain of nine or more levels ends undecoded, so `ADHD` hides. It also fails silently, which goes against the spec's "however deeply nested".
- Fix: loop until nothing changes (each pass shortens the entity text). Or, when the cap is reached without stability, return a FAIL instead of carrying on.

**L-2 (low). `INVISIBLE` / `BREAK`.**
- Problem: a raw or entity-decoded U+E000 in a manual acts as a fake block break. Other private-use characters (\p{Co}) are not removed at all, so `自閉\uE001症` hides the term. Both need deliberately crafted input.
- Fix: remove \p{Co} from the input after decoding and NFKC, before any break mark is inserted.

**L-3 (low). `CONDITION_BEYOND`.**
- Problem: `とい[っ]` also matches 「といっしょに」 at the start of a line after a break. 「とか言われても」 after a break is not matched. Both are rare constructions.
- Fix: write the quoting verbs out in full (言わ, いわ, 言っ, いっ, 言う, いう) and add `と(?:か|は)?`.

**Regressions and leaks:** I found no regression in the shown hunks. Messages still name only the rule and term. The fold adds no logging, so I found no new path for manual text to reach `plugin/**`, the metrics export, stdout or stderr. The `assert` messages print fixture text only, not the person's manual.

## What I could not judge from the attachments

- The rest of `negatesRequest`: the bare 「ない」 path before a break (does it use the new `CONDITION_BEYOND`?), and how `after` is trimmed.
- How `assertGuarded` and `failures` are built.
- Whether finding messages or the metrics export include any surrounding text (where a stray U+E000 would end up).
- Whether the full test suite actually passes. No run output was attached.

**Verdict: FAIL, 1 high finding.**
