<!-- generated: 2026-10-06T09:55:50+09:00 / ask-codex.sh ask -B astra -f DESIGN.md -f constants.mjs -f api-digest / prompt: 2026-10-06-design-review-prompt.md -->
1. **must-fix — §§5.3–5.5, 10: emitter dependency.** `emitPlugin(bundle)` receives no titles, parameter schemas or template mappings, yet W3 cannot access W2’s catalog during implementation. **Fix:** Put canonical recipe metadata and template IDs in the shared constants, or freeze an injected `emitPlugin(bundle, recipes)` interface with shared test inputs.

2. **must-fix — §§5.4, 6–7: ranking.** “Ranked, see §7” points to no ranking algorithm; `opts`, confidence aggregation and conflicting derived values are undefined. **Fix:** Freeze `maxEnabled=3`, confidence ordering, catalog-order ties, evidence selection and an explicit parameter-conflict policy.

3. **must-fix — §§5.1, 5.4; A3: evidence representation.** `quote === line.text` conflicts with verbatim-substring checking when table pipes are removed and cells combined. **Fix:** Set `quote` to the exact source `raw` line and verify it against the stated line number; use normalized text only for matching.

4. **must-fix — §5.2: unavailable checker definitions.** W1 cannot implement the referenced Japanese lists or honorific pattern from the supplied files. English “F-codes” and matching flags are also underspecified. **Fix:** Supply complete bilingual patterns, flags, boundary rules and positive/negative cases in the frozen inputs.

5. **must-fix — §§4, 5.4; A7: undefined `Diff`.** Neither its return shape nor what makes a recipe “changed” is specified. **Fix:** Freeze Bundle inputs and sorted `{added, removed, changed}` ID arrays, explicitly defining treatment of evidence, confidence, parameters, defaults and ordering.

6. **must-fix — §§3, 5.4, 9: rewrite identity.** A changed manual has a changed SHA; interpreting that as “different profile” would block the advertised rewrite flow. Slug derivation is unspecified. **Fix:** Separate stable profile identity from content hash, freeze slug generation, and specify atomic replacement of owned files after displaying the diff.

7. **must-fix — §5.6: contradictory export schema.** Exported `options` includes language, phrases and patterns, but the validator’s string whitelist excludes those values. **Fix:** Define a closed export schema containing booleans, bounded numbers and approved enums; omit custom phrase/pattern values.

8. **should-fix — §§5.6, 7: counter concurrency.** Asynchronous store read-modify-write can lose increments from overlapping hooks and timers. **Fix:** Serialize updates, drain pending updates before export, define reset semantics, and test concurrent increments.

9. **must-fix — §§5.3, 6–7: running-indicator wiring.** `turn.start` is absent from `mechanisms`; the skeleton lacks all-tool observation and skips submission handling when neither text detector is enabled. **Fix:** Specify independent lifecycle subscriptions, tool counting, timer updates, main/subagent handling and cleanup; issue the threshold toast during the turn.

10. **must-fix — §8 A2–A4, A8: vacuous success.** Empty fixture discovery, zero proposals or absent artifacts can satisfy several stated checks. A3 also accepts empty evidence arrays or empty quotes. **Fix:** Assert the fixture inventory, expected recipe IDs, required artifact set, and nonempty evidence for every proposal.

11. **must-fix — §8 A5: ineffective leak oracle.** It misses short text, headings, fragments and escaped representations; coincidental overlap with fixed template text can fail it. **Fix:** Restrict emitter inputs structurally and test distinctive short and encoded canaries from every profile field, distinguishing fixed catalog text from copied input.

12. **must-fix — §8 A6: testing a substitute.** A hand-built export cannot establish what the generated command writes. **Fix:** Invoke the generated export command with controlled store/clock/filesystem behavior and validate captured bytes, including rejection of unknown nested fields and invalid counts.

13. **must-fix — §8 A9; §§4, 10: insufficient acceptance gate.** Test names prove no behavior, and W3’s “when on PATH” condition conflicts with §4’s explicit missing-tool policy. **Fix:** Assert offline operation, protected-home writes and the three-default limit directly; unify visible skips and leave A2 unverified until Claude actually executes.

14. **must-fix — §§5.3–5.6: free-text parameters.** Unrestricted string derivation can move manual fragments into TypeScript and exported options despite the privacy promise. **Fix:** Derive only bounded numbers and canonical catalog values, serialize them safely, and exclude arbitrary phrase/regex strings from metrics exports.

15. **must-fix — §§2.6, 5.4–5.5: evidence in the distributable.** Both proposal files contain manual text inside marketplace source `./`, allowing installation or sharing to copy it. JSON evidence also contradicts the MD-only exception. **Fix:** Keep both reports in a private location outside the distributable plugin and update the privacy contract.

16. **must-fix — §§2.5, 6–7: resume text is not local-only.** An answer head can echo the manual; `$.ui.log` always writes debug logs and can display on remote surfaces. Interactive mode does not prevent that. **Fix:** Store and display metadata-only resume information instead of answer excerpts.

17. **must-fix — §5.5: active Markdown evidence.** Verbatim manual text may contain remote images or HTML; rendering PROPOSALS.md can initiate requests outside the machine. **Fix:** Render evidence as inert, safely escaped text, with no active HTML, images or automatically fetched resources.

18. **should-fix — §9: exception disclosure.** Raw exception stacks can include input excerpts from JSON parsing or invalid regular expressions. **Fix:** Emit stable error codes and locations with sanitized messages; never print input-bearing exception text automatically.

19. **must-fix — §§6–7: `prompt.compose` result.** The generated test demands a list, but the API returns `{ sections }`. **Fix:** Read `(await next(e)).sections`, append the complete `{id, text, scope:'session'}` section, return `{sections}`, and assert against `result.sections`.

20. **must-fix — §§6–7: context attachment direction.** “Gets context” leaves room for modifying the returned result, which the digest says does not attach context and is logged. **Fix:** Require `next({...e, context:[...(e.context ?? []), note]})`, preserving the other input fields.

21. **must-fix — §7: guard exception guarantee.** The supplied `.catch` idiom is correct, but it cannot undo execution after `next`, or catch failures before registration. **Fix:** Register the guard reliably, complete validation and authorization before calling `next`, and deny on invalid configuration or failed authorization-state reads.

22. **must-fix — §5.5: configuration keys and values.** Literal `<recipe_id>_<param>` contains forbidden hyphens, unlike the boolean key. `multiple` is permitted for types whose arrays are absent from `PluginOptions`. **Fix:** Use `snake(recipeId) + '_' + param`; restrict `multiple` to strings and specify array types/defaults.

23. **must-fix — §5.5: missing manifest authority.** The digest supplies neither reserved-prefix rules nor complete plugin, userConfig and marketplace schemas. Acceptance of bounds, `multiple`, naming and `source:'./'` cannot be certified from it. **Fix:** Attach those schemas and a golden manifest validated on the required Claude version.

24. **must-fix — §§6–7: approval provenance.** `command.run` accepts plugin-origin invocations; observing `allow-publish` therefore does not establish human approval. Command arguments also lack duration validation. **Fix:** Accept grants only from explicitly trusted human origins and require finite integer durations within 1–720 minutes.

25. **must-fix — §§5.1, 6: instruction polarity.** “誤字は訂正して” triggers no-correction and “短くしないで” triggers brevity. Example exclusion and DO/DON’T cell interpretation are not frozen. **Fix:** Specify eligible instruction lines, exclude examples/headings/history, preserve table polarity, and require intent-sensitive positive and negative cases per recipe.

26. **should-fix — §5.2: benign forbidden-content matches.** “Hanging indentation” matches the self-harm vocabulary; “don’t ignore safety” matches the override vocabulary. **Fix:** Context-qualify these checks and add benign-negative fixtures while preserving the explicitly chosen diagnosis-refusal policy.

27. **must-fix — §6: runtime phrase matching.** Substring matching makes `down` match “download it” and `later` suppress ordinary scheduling instructions. Detector precedence is undefined. **Fix:** Use whole-utterance or explicitly delimited intent matching, specify negation handling, and make stop/receive behavior override conflicting proposal rules.

28. **must-fix — §6: publishing and named gates.** Bash patterns miss ordinary forms such as `git -C repo push` and non-Bash publishing. Meanwhile, quiet-confirmations references “named gates” that are never represented. **Fix:** Encode supported gate types explicitly, disable quiet-confirmations for unsupported gates, and describe uncovered publishing paths as unprotected.

29. **should-fix — §§1, 5.2: generic-manual rejection.** A HUMAN.md containing a title and accommodation bullets can fail `F-STRUCTURE` despite having actionable instructions. **Fix:** Allow unsectioned generic manuals to produce low-confidence proposals; reserve mandatory section structure for declared structured formats.

30. **should-fix — §6: missing accommodations and notification limits.** The catalog lacks task chunking/one-next-step support, while the focus timer can repeatedly interrupt idle sessions. **Fix:** Add an opt-in chunking recipe and define pause, idle suppression, shared toast cooldown and notification limits.

31. **must-fix — §7; API digest: insufficient testing declarations.** The excerpt does not declare `test`, its options overload, callback shape, assertions or stubbing facilities. `TurnCompleteFields` and `turn.start` inputs are also missing. **Fix:** Supply these declarations and a minimal passing generated test rather than requiring workers to invent APIs.

32. **must-fix — §7: tests assume absent recipes exist.** A bundle containing only `focus-timer` need not declare the options or hooks required by the unconditional lead/publish/receive tests. **Fix:** Generate tests conditionally for emitted recipes and separately require exhaustive catalog coverage through controlled bundles.

33. **must-fix — §7: returned values do not prove interception.** A late deny or post-`next` context mutation can satisfy result-shape assertions without preventing execution or attaching context. **Fix:** Stub the downstream boundary, assert denied Bash never reaches it and context arrives there, and prevent any test fallthrough to real `git push`.
