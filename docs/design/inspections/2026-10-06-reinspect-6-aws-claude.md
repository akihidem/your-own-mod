# Re-inspection: kokoro-mods chunk D/E (CLI, report, metrics)

## 1. Rows marked "folded": do the attached files implement them?

**Chunk D**

| Row | Implemented? | Basis |
|---|---|---|
| M1 | Yes | `objectAt` names an unknown key only by `index`. Every later message that includes a key (`$.options.${key}`, `$.metrics.counts.${id}`, `${path}.${event}`, the accessor message) is reached only after that key passed the allowlist. |
| M2 | Partly checkable | The check runs `PLUGIN_NAME_PATTERN` and `PLUGIN_NAME_MAX_CHARS`, but `constants.mjs` is not attached. I can't confirm the 52-character limit or what the pattern accepts. See finding F1. |
| M3 | Yes, with one caveat | `argumentsFor` refuses a name for which `slugSource(null, {name})` returns `'rejected'`, using a fixed message through `usage()`. Caveat: whether `usage()` exits with 2, and what `slugSource` does with a non-string `flags.name` (for example `--name` given with no value), are not attached. |
| M5 | Mostly | `assertBundle` checks the recipe id against the catalog, duplicates, confidence, `enabledByDefault`, the number of evidence entries, and each entry's line, section, quote and `matched` fields. Messages contain key paths only. Two gaps: `params` is only checked to be an object, and `pluginName` only to be a string (F2). I also can't see that the re-run's `before` bundle actually goes through `bundleFrom`. That code is not in the diff. |
| M6 | Yes | `assertComparable` throws `E_EXPORT_MISMATCH` with a fixed message, and `publicFailure` passes it through. A changed hash prints a fixed warning to stderr. See F4 for a false-warning case. |
| L5 | Yes | Options are typed through `optionTypes`. Allowed events are set per recipe through `recipeEvents`. Counts must be safe integers. The CLI builds all of these with `exportSets`. |
| L6 | Yes | `--help` returns `EXIT.OK`. |
| L8 | Partly | Read and JSON-parse errors now say `before:`. Shape errors from `assertMetricsExport` still begin with `$.…` and don't say which export failed (F5). |
| H1, L2, L9 | Can't judge | The matcher, `emit` and the slug term list are not attached. |

**Chunk E**

- **H1** (slug from `--name` only): can't judge, because `match.mjs` is not attached. Both call sites (`argumentsFor` and `propose`) do go through `slugSource`.
- **M1–M7, L1–L10:** README, CI, the package file and the tests are not attached, so none of these can be judged.

**Tests:** none are attached. I therefore can't say whether any negative case proves a guard rather than the mere absence of a trigger.

## 2. Regressions

None that the diff shows.

- **Naming hint:** it now prints only after `replaceOutput` and the summary succeed, so on a failed run the error line comes first. With `--json` it goes to stderr, before the JSON on stdout. This is correct.
- **`RegExp(pattern, 'u')`:** dropping `i` doesn't change which patterns are valid, so the check is unchanged. I can't confirm the comment's claim that the generated module uses the same flag.
- **`buildOptionKeys`:** still exported. Removing its import from `cli.mjs` breaks nothing visible.

## 3. New paths for text from the manual

Checked and found clean:

- **Text the change adds:** the hint, the hash warning, the `E_PLUGIN_NAME` and `E_EXPORT_MISMATCH` messages, and all `assertBundle` messages are fixed strings or key paths with indices.
- **`plugin/**`:** no new route reaches it.

One path remains to stdout (F1), plus one that depends on code not attached (F2).

## 4. Findings

**F1: medium.** `src/metrics.mjs` `assertMetricsExport`, together with `src/cli.mjs` `main` (report).
- **Problem:** `EXPORT_VERSION` is still 1, and `$.plugin` is checked by its shape only. The report prints `after.plugin` to stdout and uses it to look up settings. Suppose an export came from a plugin generated before chunk E's H1 fix, when the slug came from the manual's name, alias or title. It still validates, and the manual's words are then printed. The shape check also doesn't apply the forbidden-term rejection that `--name` now gets in `argumentsFor`.
- **Fix:**
  - Validate `$.plugin` with the same normalise-and-reject function `slugSource` uses for `--name`.
  - Then do one of the following: bump `EXPORT_VERSION` or the plugin manifest version, so exports from before the fix are refused with a fixed message; or stop printing the plugin name in the report.
  - Add a test that feeds a slug-shaped name built from fixture manual words and asserts it is refused or not printed.

**F2: medium.** `src/cli.mjs` `assertBundle`.
- **Problem:** the keys and values inside `params` aren't checked against the recipe's param definitions, and `pluginName` is accepted as any string. If `formatDiff` or the re-run prints param names or values, or `pluginName`, then free text from a hand-edited `PROPOSALS.json` reaches stdout. That is the same class of problem as M5, one level deeper. `diff.mjs` is not attached, so whether this happens depends on code I can't see.
- **Fix:**
  - For each param key, require it to be in `RECIPES[recipeId].params`, with the declared type and bounds.
  - Reject string values the way `E_PARAM_FREE_TEXT` does.
  - Validate `pluginName` with the plugin-name pattern and the rejection rule, and report a failure by key only.

**F3: low.** `src/cli.mjs` `argumentsFor`.
- **Problem:** `slugSource(null, …)` is called with a null profile, and `flags.name` may not be a string. If `slugSource` reads the profile or calls string methods on the name, the result is `E_UNEXPECTED` (exit 1) instead of a usage error (exit 2).
- **Fix:** first check that `typeof flags.name === 'string'` (otherwise call `usage('name: expected a value')`). Also make sure `slugSource` never reads the profile when a name is given, or pass a dedicated name-only normaliser.

**F4: low.** `src/report.mjs` `assertComparable`.
- **Problem:** `profileSha256` is accepted with the `/i` flag, but compared case-sensitively. The same hash written in different case therefore triggers the "different versions" warning.
- **Fix:** lowercase both values before comparing, or accept lowercase only.

**F5: low.** `src/report.mjs` `readExport` and `src/metrics.mjs` `assertMetricsExport`.
- **Problem:** shape errors don't name which export failed, so L8 is only half fixed.
- **Fix:** prefix the shape message with `label` in `readExport`, for example by catching `E_EXPORT_SHAPE` and rethrowing with `${label}: ${message}`. The message still contains key paths only.

**F6: low.** `src/cli.mjs` `publicFailure`.
- **Problem:** `E_PROPOSALS_SHAPE` and `E_PROPOSALS_JSON` aren't in `safeCodes`. If a `Failure` is not passed through before `publicFailure` runs, the new `assertBundle` messages become `E_UNEXPECTED`. The catch block is not attached.
- **Fix:** confirm that `Failure` instances bypass `publicFailure`, or add both codes to `safeCodes`. Add a test asserting `E_PROPOSALS_SHAPE` and the key path.

## 5. What the attachments don't let me judge

- **Constants:** `constants.mjs`, including `PLUGIN_NAME_PATTERN`, its flags and the 52-character limit, and `SECTION_KEYS`.
- **Slug logic:** `slugSource` and `slugFor` in `match.mjs`, so chunk E's H1 and chunk D's L9.
- **Diff output:** `diffProposals` and `formatDiff` (what they print from a bundle), so F2's severity.
- **The `propose` re-run:** where `before` is read and whether it goes through `bundleFrom`.
- **Generated module and emitted plugin:** `metricEvents` and its agreement with `EVENT_NAMES`, and `emit.mjs` (`userConfigKey`, the leak check, `E_PLUGIN_NAME`).
- **Error handling:** `usage()`'s exit code and the `main` catch block.
- **Settings:** the rest of `readSettingsToggles`, including whether the `key` in `E_PATTERN` messages is allowlisted.
- **Chunk E:** README, CI and the package file.
- **Tests:** all of them, so no negative case could be assessed.

**Verdict: PASS (0 high).** The folded rows I could check are implemented. Medium findings F1 and F2 remain open.
