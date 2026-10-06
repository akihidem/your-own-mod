# W3 round 3: fixes from the independent inspection of round 2 (parts A and B)

You wrote the emitter (`src/emit.mjs`, `src/templates/*.mjs`, `test/emit.test.mjs`); round 2 passes the engine's validator and the plugin tests. An independent reviewer (a different model) inspected the round-2 code; the design is now v0.2.2 (excerpt `docs/design/contracts/w3-brief-v0.2.2.md` attached). Apply every item; you may change only the attached files. Keep every test that is still correct.

## A. Privacy, fail-closed (high)

1. `emitPlugin` must enforce, not assume: a string param without `options` (single or `multiple`) is accepted only when it deep-equals `recipe.params[name].default`; anything else throws `Error('E_PARAM_FREE_TEXT: <recipeId>.<param>')` (never the value). Numbers must be finite and inside `min..max` (throw otherwise); `options` strings must be one of the options.
2. Wire `leakCheck` into `emitPlugin`: before returning the map, collect every `quote` and `matched` of the bundle (skip empty strings and strings shorter than 4 characters), run `leakCheck` over the `plugin/` entries, and throw `Error('E_LEAK: <path>')` on any hit (never print the needle). Keep `leakCheck` exported for the CLI's own test.
3. Descriptions of `plugin.json` and `marketplace.json`: "Mods proposed by kokoro-mods (profile <sha256 first 8>)" — no file name, no format.

## B. Generated module

4. `command.run`: `export <path>`, `allow-publish`, `focus` and `reset` only when `e.origin.kind === 'composer'`; otherwise answer "kokoro-mods: this subcommand must be typed by the user." `status` and `export --print` answer any origin.
5. Validate options before use: when `publish_guard_patterns` is not an array of strings, the guard denies with the fixed sentence "<pluginName>: publish guard configuration is invalid (patterns must be a list of regular expressions); publishing denied." and never throws; non-finite `long_turn_seconds` / `interval_minutes` / `max_lines` / `max_chars` / `allow_minutes` fall back to the recipe default written into the module as a constant.
6. `matchesPhrase(t, phrase)` per DESIGN v0.2.2 §6: NFKC-normalise, lower-case and straighten curly apostrophes on both sides; trim the phrase; a match is the phrase alone, or the phrase followed only by `\p{P}`, `\p{S}`, whitespace, and a trailing tail made only of the closed set ね・よ・な・わ・です・ます・だ・よね・かも (at most 6 characters of tail in all). Regression cases to include in the generated tests and in the Node test (through the emitted text): 「あとでテストして」「終わりました」「終わりにしないで」「疲れたけどやる」「疲れたのでレビュー」 never match; 「一旦やめるね」「眠い…」「疲れた😢」"Stop for now." "That’s enough" (curly) "TIRED" match.
7. `outDirName` in PROPOSALS.md: use its basename for relative paths too; inside fenced code blocks do not entity-escape (fences make the content inert; keep the escaping outside fences).

## C. Tests

- Node tests for A1 (free-text string param → throws with `E_PARAM_FREE_TEXT`, default value passes), A2 (a bundle whose quote is planted into a template output via a stub recipe title → `E_LEAK`), A3 (no file name in descriptions), B4 (emitted module text contains the composer check for the four subcommands), B6 (regression strings above against the emitted `matchesPhrase`, extracted by regex from the emitted text and evaluated with `new Function`, or asserted through the generated plugin test), B7.
- Generated tests: add a case for the composer-origin refusal of `reset` with `origin: { kind: 'plugin', name: 'x' }` if the kit's `$.command.run` lets a test set the origin; otherwise assert the refusal text exists in the module and note why in a comment.

Return only the unified diff against the attached files.

## D. From part B of the inspection (generated tests and Node tests)

8. `matchesPhrase`: also allow `\p{Extended_Pictographic}` and the prolongation/small kana ー・ぁ・ぃ・ぅ・ぇ・ぉ・っ in the tail; ignore empty or whitespace-only phrases (「はい」 must never match an empty phrase); the Node test covers `眠い😴`, `眠いｗ`, `眠い（笑）`, `tired lol`, `TIRED`, and the negatives of item 6 plus 「あとでやって」「あとでおしえて」「あとでメモして」「終わりましたか」「一旦やめるかどうか」.
9. Generated submit tests: before and after every `$.prompt.submit`, assert `seen.length` grew by exactly one and that the bottom received the unchanged `text` (so a dropped or rewritten prompt fails the test); the export test is emitted for every bundle (COUNTS may be empty); add an expired-grant case (grant in the past → deny) and, if the kit lets a bottom `store.get` hook throw, a throwing-store case (→ deny); add `expect(last.scope).toBe('session')` and the header line to the compose test; add an unknown event (`free_text: 1`) and a string count to the export rejection case.
10. Node tests: derive the canaries from every `quote` and `matched` of the test bundle (not a fixed subset) and also from 8+ character fragments of each quote; add a `matched` carrying markup (`<img src=x>[l](https://x)`) and assert nothing of it appears outside fenced blocks; outside fences assert no `/<[a-z!\/]/i`, no `https?://` or `www.`, no reference-link definitions; the claude-backed test asserts the number of plugin tests reported on stdout (7 for the full bundle, 1 for the single-recipe bundle) and that `claude --version` prints a version; the determinism test spawns a child `node` with `TZ=Pacific/Kiritimati LANG=C` and compares bytes; the "independent of proposal order" test permutes the proposals (at least 3 permutations) and compares bytes.
