# Your Own Mod

[日本語](README.ja.md)

Your Own Mod (the `kokoro-mods` command) reads an AI user manual such as `kokoro.md`, `torisetsu.md`, or `HUMAN.md` and proposes Claude Code function-hook plugins. Each proposal cites the manual line that triggered it, and you choose what to install. The generated plugin counts selected actions so you can inspect what ran and compare counts later.

It is for people who regularly use Claude Code and keep repeating preferences such as “answer first”, “read past typos”, “ask before pushing”, or “show whether work is still running”. A `kokoro.md` translated with a psychologist uses the same path; that assistance is optional. You can also write a short manual yourself: describe concrete situations, the response you want, and the actions that need your permission. A guided kit for writing one is in preparation and will be linked here when it is released.

`kokoro.md` is a personal AI user manual following the **KOKORO specification**; the [relationship to KOKORO](#relationship-to-kokoro) is described below. Write working preferences rather than diagnosis labels or test scores; the content check rejects those labels and other forbidden content.

## Principles

1. Every proposal has one to three verbatim source lines. Matching uses what the person wrote, not a diagnosis.
2. Parsing, matching, and generation are offline and deterministic, with no model call or network request. The same input and options produce identical owned file bytes.
3. Generation makes a proposal folder. You review it and install it yourself; the CLI does not change your Claude Code settings.
4. By default, at most three recipes start enabled (`--max-enabled` and `--all` change this). Other matching recipes remain available as toggles, and notifications share a 60-second cooldown.
5. Mods count events, without recording prompt text, answers, tool output, or manual text.
6. Manual quotes stay in the private reports outside `plugin/`. The distributable contains catalog text, bounded parameters, the plugin name you chose (or `profile`), and the manual's SHA-256 as a version fingerprint.

## Install and run

Use Node.js 22 or newer. The CLI has no dependencies; generated plugins need Claude Code's early-access function-hook API.

```sh
npx kokoro-mods --help
```

`npx kokoro-mods` works once the package is on npm. Until then, or to work from source, clone this repository, enter its root directory, and run `node bin/kokoro-mods.mjs --help`; use that prefix for the same commands. Package installation can download software; the CLI's check, propose, diff, report, and recipes commands make no network requests. Help returns exit code 0.

Start by checking the manual and creating proposals:

```sh
kokoro-mods check   profile.md
kokoro-mods propose profile.md --out ./mods/me --name me
```

Read `./mods/me/PROPOSALS.md`, then use the install commands printed by `propose` **inside Claude Code**. For a plugin named `kokoro-mods-me`, they are:

```text
/plugin marketplace add ./mods/me/plugin
/plugin install kokoro-mods-me
```

Relative install paths in `PROPOSALS.md` are relative to its output folder; the CLI prints the path to use from your current directory. The folder name does not determine the plugin name. To choose that name, add `--name me` to both proposal runs; otherwise the plugin is `kokoro-mods-profile` and the CLI prints a hint. The name never comes from the manual, so a title or a front-matter name cannot reach the distributable. A `--name` with no letters or digits, or with a diagnosis term, is refused with exit code 2. Without `--out`, output goes to `./kokoro-mods-out/<slug>`. Use `/config` in Claude Code to toggle individual recipes.

After editing the manual, re-run the same proposal command. It prints a diff and then replaces its owned files; it does not pause for approval or install anything. Files you added separately are preserved. A changed plugin identity returns exit 5; `--force` explicitly permits replacing it. Staging uses a temporary sibling folder, and the ownership list is `PROPOSALS.json`'s `files` array. A `PROPOSALS.json` that does not match the catalog, whether edited by hand or written by another tool, is refused before anything is read from it.

```sh
kokoro-mods propose profile.md --out ./mods/me --name me
kokoro-mods diff old/PROPOSALS.json new/PROPOSALS.json
kokoro-mods report export.json export-before.json --settings ~/.claude/settings.json
kokoro-mods recipes
```

For a single export, omit `export-before.json`. For counts without inspecting settings, omit `--settings`. Deltas are the first export minus the second; resets can produce negative deltas. Both exports must come from the same plugin; a different manual hash between them is reported as a warning. Settings are read only, and the report lists explicitly enabled toggles for the export's plugin; missing settings do not establish a default value.

## Commands inside Claude Code

The installed plugin provides these commands:

```text
/kokoro-mods status
/kokoro-mods export /absolute/path/export.json
/kokoro-mods export --print
/kokoro-mods allow-publish 30
/kokoro-mods focus 50
/kokoro-mods reset
```

`allow-publish` accepts an optional 1–720 minute grant (default 30). `focus N` sets the break reminder interval to N minutes and restarts it, and `reset` clears counts and sets their start time. File export, grants, focus changes, and reset must be typed by the person in the composer. `status` and `export --print` also accept other command origins.

`check --json` prints findings as JSON. `propose --json` prints the bundle as JSON, with warnings, diff, summary, and install instructions on stderr; the bundle includes the quoted manual lines, so treat that output as private. `--max-enabled N` changes the initial limit, including zero; `--all` enables every match. These two options cannot be combined. `propose --lang ja|en` changes display text, and `recipes --lang ja|en` lists localized catalog titles, templates, high-confidence sections, and typed parameters. `--debug` adds a sanitized error stack.

An abbreviated proposal summary for `fixtures/valid/en-generic.md` looks like this:

```text
on   publish-guard  medium  quotes=1
on   lead-with-answer  medium  quotes=1
on   one-next-step  medium  quotes=1
off  focus-timer  medium  quotes=1
```

Those recipes cite lines 4, 12, 13, and 21 respectively; the private report shows their actual words in fenced code blocks. The publish grant defaults to 30 minutes, the answer limit to 12 lines, and the disabled focus reminder to 50 minutes. “Medium” describes the section match in this generic manual, not proof that a mod will help. Other matching recipes are present in the full report.

## Recipes

| Recipe | What it does | What it counts |
|---|---|---|
| `lead-with-answer` | Requests the answer first and brief explanations. | `long_answers`: answers over the line limit |
| `accept-typos-as-intent` | Reads intended meaning without pointing out spelling differences. | — |
| `response-language` | Requests the chosen response language. | — |
| `one-next-step` | Breaks up large tasks and ends with one next action. | — |
| `receive-only-fragments` | Acknowledges configured short utterances without advice. | `detected` |
| `respect-stop-signals` | Acknowledges a stop signal without adding another task. | `detected` |
| `no-psych-framing` | Follows stated preferences without interpreting the person. | — |
| `publish-guard` | Blocks matching Bash publish commands until a timed grant is set. | `denied`, `allowed` |
| `quiet-confirmations` | Avoids routine confirmations while keeping permission gates. | — |
| `offer-options` | Compares several options before recommending one. | — |
| `plain-language` | Uses plain words and explains necessary terms. | — |
| `expert-role-with-evidence` | Requests evidence and ways to test expert claims. | — |
| `trace-offers` | Suggests where to record decisions or progress. | — |
| `running-indicator` | Shows elapsed time and tool activity; notifies on long turns. | `long_turns`, `suppressed` |
| `block-ahead-warning` | Explains authentication and approval steps before reaching them. | — |
| `session-resume-brief` | Shows days since the last visit and its turn count. | `resumed` |
| `focus-timer` | Reminds about breaks only after activity since the previous tick. | `ticks`, `suppressed` |

`detected` counts matching utterances. `suppressed` counts notices held back by the shared cooldown. A dash means the recipe has no event counter.

## Privacy and limits

The CLI reads only the named manual, proposal bundles, exports, and optional settings file. It writes `plugin/.claude-plugin/{plugin,marketplace}.json`, `plugin/hooks/{hooks.json,register.ts,register.test.ts}`, `PROPOSALS.md`, and `PROPOSALS.json` below `--out`, plus temporary staging in its parent. It never edits the input or the settings file and makes no automatic writes to home configuration. Keep the two proposal reports private: they include source quotes and the manual's basename. Share only the reviewed `plugin/` folder. That folder, and every export, carries the plugin name and the manual's SHA-256: a fingerprint that lets someone who already holds the file confirm which version produced the plugin, and that reveals nothing of its content. The content check names the rule and the matched term in its messages (`forbidden term "…"`), never the line.

The two activity records stored locally in the plugin store are event counts with their start time, and the resume brief's last time and turn count per working directory (keyed by the directory's path). The publish guard also keeps the expiry of a grant as permission state. Prompts, answers, tool output, and manual text are never stored by the plugin. An explicit export writes to the absolute path you choose, or prints JSON with `--print`; it includes plugin identity, profile hash, export time, counts, and boolean/numeric settings only. String parameters, including phrases, patterns, and language, are excluded.

kokoro-mods sends neither the manual nor these records to a network service. Authored recipe rules can enter Claude Code's model context; source quotes are excluded from the plugin. This does not change Claude Code's own data settings.

The publish guard protects **Bash only**. Other tools and scripts that publish internally are outside it. A pattern list that is empty or fails to compile makes the guard deny every Bash command until the setting is fixed in `/config`; use the recipe's toggle to switch the guard off. Counts show actions, not whether someone felt less burden or whether a change caused an improvement. The plugin API is early access; the golden plugin (the generator's own output for the English fixture) and the generated plugins were checked with Claude Code 2.1.290 and 2.1.291, and compatibility with later versions needs validation.

## Relationship to KOKORO

The **KOKORO specification** defines `kokoro.md`, a personal AI user manual in which a psychologist translates a clinical formulation into working preferences for an AI, without passing on the clinical findings themselves. Its repository is private at the time of writing. The public part of the project is [kokoro-mcp](https://github.com/akihidem/kokoro-mcp), the loader and MCP server that signs, verifies, revokes, and delivers a `kokoro.md` to the model. Both are by the author of this tool.

Your Own Mod is a separate tool and not part of the specification:

- It reads a `kokoro.md` (frontmatter `format: kokoro/...`, or `format_version` as the specification names it), a self-written `torisetsu.md` (`format: torisetsu/...`), or any loosely structured profile, and only to find working preferences. It does not read or require a diagnosis, a psychologist's review, or a consent field, and it does not check a signature.
- Its content check follows the specification's forbidden-content rules: diagnosis labels, test scores, self-harm, instructions to override safety rules, role-play instructions, and broken structure are refused (Appendix A of the [design](docs/design/DESIGN.md)). Passing this check does not make a document a conformant `kokoro.md`; conformance, review, and signing stay with the specification and kokoro-mcp.
- It does not deliver the manual to the model's context. kokoro-mcp does that, and the two can run side by side: kokoro-mcp puts the manual in front of the model, and Your Own Mod turns a few of its preferences into hooks that the harness enforces and counts.
- This repository contains no text of the specification and no real manual. The fixtures describe fictional people, and the proposals you generate stay on your machine.

## Development

Use the built-in Node tests and the actual plugin validator:

```sh
node --test test/*.test.mjs
claude plugin validate --strict docs/design/golden/plugin
```

`npm test` uses the explicit glob; avoid bare `node --test`, which can discover the golden plugin's TypeScript tests. Integration tests run `claude plugin validate --strict` and `claude plugin test` on each of the three generated valid fixtures with an empty temporary `HOME`, check the number and names of the generated tests that ran, and also execute the generated module under Node's type stripping to validate the export it writes. If Claude is absent, they fail with `claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip`. Setting that variable to `1` reports those tests as skipped by name; A2 is then unverified. CI tests Node 22 and 24, installs Claude Code 2.1.290, and sets the skip variable only if installation fails; on `main` and on tags an installation failure fails the job.

The [design](docs/design/DESIGN.md), [public interfaces](docs/design/contracts/w4-interfaces.md), and [fixture facts](docs/design/contracts/w4-facts.md) describe the contracts and acceptance criteria. Exit codes are 0 success and help, 1 failure (an unreadable or invalid input file, a refused ownership record, or an unexpected error), 2 usage error, 3 failed content check, 4 changed diff, and 5 output conflict. Errors name codes and keys, without input excerpts.

MIT license; see [LICENSE](LICENSE).
