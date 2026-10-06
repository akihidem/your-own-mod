# kokoro-mods, chunk 1 (matcher), twentieth re-inspection

## Disposition rows

| Row | Implemented? |
|---|---|
| High-1: the publishing act may stand between the particle and 後 | **Partly.** All three pinned lines work: 「確認はpush後でいい」, 「レビューはPRを出した後でいい」 and 「確認はリリース後で大丈夫」 pass through `PUBLISH_WAIVER` and then `EXPLICIT_WAIVER` (lookbehind `[はもを]…`). But `JA_PUTOFF_ADV` only accepts `を(出\|作\|立)(した\|して)` or `作成\|した\|して`. So 「PRを作った後」, 「PRを作成した後」, 「イシューを立てた後」 and 「プルリクを作った後」 don't match. The table's "the catalog's waiver vocabulary takes it too" can't be checked, because the catalog isn't attached. |
| Low-1: the imperative waiver's lookbehind is bound to an ask word | **Yes.** The ask-word group is now required. However, the particle group is optional, so 「確認後にしてpushして」 now passes `IMPERATIVE_WAIVER` (see L-1). |
| Low-2: "push changes that are fine" is not a noun phrase | **Yes.** `(?!ing\b)\w*\b` applies the noun-phrase test to gerunds only, and the new assertion traces to `waiver: true`. |
| Low-3: test for the earlier は | **Yes.** 「pushは確認後でいい」 has no match in `PUBLISH_WAIVER` (the particle-less form needs ので/から/し), and the 確認 left in `unlessText` makes it `asking`. |

## Findings

**H-1 (high, regression).** `src/match.mjs`, the particle-less branch `(?:後|あと)で…(?:ので|から|し)` in `PUBLISH_WAIVER`, and `publishPolarity` (the `PERMISSION` / `IMPERATIVE_WAIVER` path).
- **Problem:** Without は/を, 確認後 is an ordinary compound noun ("after confirmation"). 「Xの後でいいので〜して」 is the everyday "do it once X is done, no hurry" (「ご確認後でいいので返信ください」).
- **Plain sentences that lose the gate:**
  - 「pushは確認後でいいので、急がなくて大丈夫」: `PERMISSION` matches いい followed by ので, there is no prohibition, and once the waiver part is blanked nothing asks.
  - 「私の確認後でいいのでpushして」: `IMPERATIVE_WAIVER` matches, and `asksBeyondWaivers` blanks the whole sentence.
- **Contradiction:** These rulings conflict with the pinned 「pushは確認後でいい」 (gate kept) and with §5.4a's "「確認後にして」 without the particle … ask first". The design text attached doesn't name the particle-less form as accepted; only the brief mentions it.
- **Fix:**
  - Accept the particle-less 後でいい only inside `IMPERATIVE_WAIVER`, and only when 先に or まず comes before the verb (the pinned 「確認後でいいので先にpushして」).
  - Take the particle-less branch out of the waivers that `PERMISSION` can grant.
  - Add the two sentences above as hit tests.

**M-1 (medium).** `JA_PUTOFF_ADV`.
- **Problem:** The conjugation list is incomplete (作った, 作成した, 立てた), so the High-1 fold doesn't cover 「レビューはPRを作った後でいい」 or 「確認はイシューを立てた後でいい」. These fall to the safe side (no waiver), but a person asking for the opposite of the recipe gets it whenever a trigger also reads the cell.
- **Fix:** Use `を(?:出し|作っ|作成し|立て)(?:た|て)` and pin these cases with tests.

**L-1 (low).** `IMPERATIVE_WAIVER` lookbehind.
- **Problem:** Because the particle group is optional, 「確認後にしてpushして」 counts as an imperative waiver. It is reachable only when another waiver phrase shares the same tight clause, which is a contrived construction.
- **Fix:** Make the particle required for 後にして/回し, and keep it optional only for the 先に-bound 後でいいので form described in H-1.

**L-2 (low).** `PUBLISH_WAIVER`.
- **Problem:** The code accepts し after a particle-less 後でいい; the brief says ので/から only. In practice 「確認後でいいし」 falls to `negatedWaiver`, because `PERMISSION` has no し lookahead, so it is harmless but drifts from the stated design.
- **Fix:** Drop し, or document it in §5.4a.

## Leak paths
I found no new path. The fold changes only regular expressions. `evidence` still carries `line.quote` and the trigger's `matched`. The error messages carry positions and line numbers only, and the bundle's `version` is still shape-checked.

## What I could not judge
- The catalog's triggers. They decide whether H-1 and M-1 actually produce a hit, though the pinned 「pushは確認後でいい」 implies a trigger reads 確認後.
- The catalog's waiver vocabulary (the table's "takes it too").
- The test assertion bodies outside the diff hunks.
- How the emitter, the metrics export and the CLI use `quote` and `matched`.

**VERDICT: FAIL (1 high)**
