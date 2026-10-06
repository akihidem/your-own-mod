# W3 round 2: fixes from the engine's validator and the updated design

You wrote `src/emit.mjs`, `src/templates/*.mjs` and `test/emit.test.mjs` in round 1 (attached as they are now). The Node tests pass except the one that runs `claude plugin validate --strict` on the emitted module. The design was updated to v0.2.1 (excerpt attached). Apply every item. You may change only the attached files.

## A. The validator's rule (must fix; this is what fails now)

`claude plugin validate --strict` statically reads the emitted `register.ts` and reports:

> compiled line 195 `await bump($, "respect-stop-signals", "detected");`: $ is passed to "bump", which is not a function declared at the top of this file (a function declaration, or a const bound to one); $ is followed nowhere else; $ is always spelled $.noun.event(...) at the call site …

Rule: the engine only lets `$` be used as `$.noun.method(...)` at the call site, or be passed to a function **declared at the top level of the module** (a `function` declaration or a `const` bound to a function). In round 1, `bump` (line 151) and `toast` (line 174) are declared inside `register`, so they are refused. Fix: declare `bump`, `toast`, `readMetrics`, `writeExport` and every other helper that receives `$` at the top level of the file; keep the per-module state they need (`chain`, `lastToastAt`, the running-indicator timer handle, the focus timer handle, `interactive`, `cwd`) as module-level `let` variables (a hot reload re-runs the module, which is fine). Do not pass `$` into closures created inside `register`. Keep the `.catch` guards. After the change the golden idioms still apply.

## B. Other defects

1. `writePluginFolder(files, outDir)` returned `undefined`; it must return the sorted list of relative paths written (DESIGN §5.5 / your own JSDoc).
2. Detector matching (DESIGN v0.2.1 §6): a phrase matches only as a whole utterance: `t === phrase`, or `t` starts with the phrase and what follows is only punctuation, whitespace and at most 6 hiragana/katakana characters (particles such as ね・よ・な・わ・です・ます・だ). Implement one top-level helper `matchesPhrase(t, phrase)` with a frozen regex. receive-only also requires `t.length <= max_chars`; respect-stop requires `t.length <= 40`. 「あとで見返せるように要約して」 and "wrap up this function into a module" never match; 「一旦やめるね」, "stop for now.", 「眠い…」 match.
3. Placeholders: `{language}` is filled with the language **name** (`ja` → `Japanese`, `en` → `English`; unknown codes are passed through); `{max_chars_clause}` is filled with `''` when `max_chars` is 0 and with ` and within N characters` otherwise; `{min}`, `{max}`, `{max_lines}` as before. The template fills placeholders from the proposal's params (the catalog's rule texts carry them).
4. Metrics export `options` contains only boolean and number values (never strings or arrays), as before; double-check after the refactor.

## C. Tests (`test/emit.test.mjs`)

- Keep every existing test. The claude-backed test must now pass: `claude plugin validate --strict` and `claude plugin test` on the emitted `plugin/` of the full bundle **and** of a bundle holding a single `focus-timer` proposal.
- Add: `writePluginFolder` returns the sorted path list; `matchesPhrase` behaviour is visible through the emitted module text (assert the helper is declared at the top level: the module text matches `/^function matchesPhrase\(/m` and `/^function bump\(/m`, and `register` contains no nested `function bump`); placeholders filled (a rule with `{language}` renders `Japanese`; `max_chars` 0 renders no character clause, 200 renders "within 200 characters").

Return only the unified diff against the attached files.
