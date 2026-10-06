# Your Own Mod

“Answer first.” You have asked for that again today.  
Hand over your own user manual to help the AI work your way.  
From **17 recipes**, it proposes the ones that match your manual. You choose what to install.

[日本語](README.ja.md)

Your Own Mod (the `kokoro-mods` command) reads an AI user manual such as `kokoro.md`, `torisetsu.md`, or `HUMAN.md`. It suggests small additions to Claude Code called function-hook plugins, based on the preferences in your manual. Every proposal quotes the line you wrote that led to it. You choose what to install.

The plugin counts selected actions without recording what you or the AI wrote. You can check what ran and compare counts later. Think of it as a sticky note on Claude Code's screen for the things you keep asking.

This is for people who use Claude Code regularly and keep saying “answer first”, “read past typos”, “ask before pushing”, or “show whether work is still running”.

You can use a `kokoro.md` translated with a psychologist in the same way. That help is optional. You can also write a short manual yourself. Describe concrete situations, how you want the AI to respond, and which actions need your permission. A kit to guide you through writing one is in preparation. We will link to it here when it is released.

`kokoro.md` is a personal AI user manual that follows the **KOKORO specification**. Your Own Mod was designed by a Certified Public Psychologist (公認心理師, Japan's national license for psychologists), who also wrote the specification. The [relationship to KOKORO](#relationship-to-kokoro) is explained below.

Write about your traits, habits, strengths, difficulties, and how you want the AI to respond while you work. Leave out diagnosis labels and assessment scores. The content check refuses those labels and other forbidden content. This tool is not a substitute for diagnosis or treatment.

[Short posts for sharing (Japanese)](docs/share-copy.md) are available, too.

## What matters here

1. Every proposal includes one to three lines quoted exactly as you wrote them. It matches your words, without using diagnosis labels.
2. Reading, matching, and generation happen offline. There are no model calls or network requests. The same input and options produce exactly the same bytes in the files the tool manages.
3. Generation creates a folder of proposals. You read them and install what you choose. The CLI does not change your Claude Code settings.
4. At most three recipes are on at first. `--max-enabled` and `--all` change this. Other matching recipes stay available to switch on. All notifications share a 60-second pause between notices.
5. Mods count actions. They do not record prompts (your input to the AI), answers, tool output, or the manual's text.
6. Quotes from your manual stay in private reports outside `plugin/`. The folder you can distribute contains catalog text, parameters kept within set limits, your chosen plugin name (or `profile`), and the manual's SHA-256, a fingerprint of its version.

## Install and run

Use Node.js 22 or newer. The CLI (the terminal command) has no dependencies. Generated plugins need Claude Code's early-access function-hook API, which runs code at particular points during work.

```sh
npx kokoro-mods --help
```

`npx kokoro-mods` works once the package is on npm. Until then, or if you want to use the source, clone this repository and enter its root directory. Run `node bin/kokoro-mods.mjs --help`, and use that same prefix for the other commands.

Installing a package may download software. The CLI's check, propose, diff, report, and recipes commands make no network requests. Help returns exit code 0.

First, check your manual and make proposals:

```sh
kokoro-mods check   profile.md
kokoro-mods propose profile.md --out ./mods/me --name me
```

Read `./mods/me/PROPOSALS.md`. Then run the install commands printed by `propose` **inside Claude Code**. For a plugin named `kokoro-mods-me`, use:

```text
/plugin marketplace add ./mods/me/plugin
/plugin install kokoro-mods-me
```

Paths in `PROPOSALS.md` that are not absolute start from the output folder. The CLI prints the path to use from your current directory.

The folder name does not set the plugin name. To choose a name, add `--name me` to both the first proposal run and later runs. If you omit it, the plugin is `kokoro-mods-profile`, and the CLI prints a hint. The name never comes from the manual. Neither its title nor a name in front matter (the settings at the start of a document) can enter the folder you distribute. A `--name` with no letters or digits, or one that includes a diagnosis term, is refused with exit code 2. Without `--out`, files go to `./kokoro-mods-out/<slug>`. Use `/config` in Claude Code to turn individual recipes on or off.

After editing the manual, run the same proposal command again. It shows a diff, then replaces the files it manages. It does not wait for approval or install anything. Files you added separately stay in place. A changed plugin identity returns exit code 5. `--force` lets you replace it.

A temporary folder beside the output folder holds files while they are prepared. The `files` array in `PROPOSALS.json` lists the files the tool owns. If a `PROPOSALS.json` does not match the catalog, it is refused before anything is read from it. This applies whether it was edited by hand or written by another tool.

```sh
kokoro-mods propose profile.md --out ./mods/me --name me
kokoro-mods diff old/PROPOSALS.json new/PROPOSALS.json
kokoro-mods report export.json export-before.json --settings ~/.claude/settings.json
kokoro-mods recipes
```

For one export, leave out `export-before.json`. To see counts without reading settings, leave out `--settings`. The difference is the first export minus the second. A reset can make that difference negative. Both exports must come from the same plugin. If their manual hashes differ, the report shows a warning.

Settings are read only. The report lists toggles explicitly turned on for the export's plugin. A missing setting does not tell you its default value.

## Commands inside Claude Code

After installation, these commands are available in Claude Code:

```text
/kokoro-mods status
/kokoro-mods export /absolute/path/export.json
/kokoro-mods export --print
/kokoro-mods allow-publish 30
/kokoro-mods focus 50
/kokoro-mods reset
```

`allow-publish` gives permission for 1 to 720 minutes. If you leave out the duration, it uses 30 minutes. `focus N` sets the break reminder to N minutes and starts the timer again. `reset` clears the counts and sets their start time.

To export a file, grant permission, change focus, or reset counts, you must type the command yourself in the composer. `status` and `export --print` also accept commands from other origins.

`check --json` prints the check results as JSON. `propose --json` prints the proposal bundle as JSON on standard output. Warnings, the diff, the summary, and install instructions go to standard error. The bundle includes quoted manual lines, so keep that output private.

`--max-enabled N` changes how many recipes start enabled. Zero is allowed. `--all` turns on every match. You cannot use these two options together. `propose --lang ja|en` changes the display language. `recipes --lang ja|en` lists catalog titles, templates, sections that give a high-confidence match, and parameters with their types, in the selected language. `--debug` adds a sanitized error stack, a trace of the calls leading to an error without input text.

Here is part of the proposal summary for `fixtures/valid/en-generic.md`:

```text
on   publish-guard  medium  quotes=1
on   lead-with-answer  medium  quotes=1
on   one-next-step  medium  quotes=1
off  focus-timer  medium  quotes=1
```

These recipes quote lines 4, 12, 13, and 21, in that order. The private report shows the exact words in fenced code blocks. By default, the publish grant lasts 30 minutes and the answer limit is 12 lines; the focus reminder is set to 50 minutes but starts switched off. `medium` describes a section match in this loosely structured manual. It does not show that a mod will help. The full report includes the other matching recipes.

## Recipes

Each recipe is a small adjustment you can add to Claude Code. Here are all 17, with what each one counts.

| Recipe | What it does | What it counts |
|---|---|---|
| `lead-with-answer` | Requests the answer first, with short explanations. | `long_answers`: answers over the line limit |
| `accept-typos-as-intent` | Reads for intended meaning without pointing out spelling differences. | None |
| `response-language` | Requests replies in the language you choose. | None |
| `one-next-step` | Splits up large tasks and ends with one next action. | None |
| `receive-only-fragments` | Acknowledges short utterances you configure, without giving advice. | `detected` |
| `respect-stop-signals` | Acknowledges a stop signal without adding another task. | `detected` |
| `no-psych-framing` | Follows your written preferences without interpreting you. | None |
| `publish-guard` | Blocks matching Bash publish commands outside the permitted time. | `denied`, `allowed` |
| `quiet-confirmations` | Avoids routine confirmations while keeping required permission steps. | None |
| `offer-options` | Compares several options before recommending one. | None |
| `plain-language` | Uses plain words and explains any needed terms. | None |
| `expert-role-with-evidence` | Asks for evidence and ways to check expert claims. | None |
| `trace-offers` | Suggests places to record decisions or progress. | None |
| `running-indicator` | Shows elapsed time and tool activity. Sends notices on long turns. | `long_turns`, `suppressed` |
| `block-ahead-warning` | Explains authentication and approval steps before you reach them. | None |
| `session-resume-brief` | Shows days since your last visit and the turn count from that visit. | `resumed` |
| `focus-timer` | Reminds you about breaks only if there has been activity since the previous timer check. | `ticks`, `suppressed` |

`detected` counts matching utterances. `suppressed` counts notices held back to keep the shared gap between notices. “None” means the recipe has no event counter.

## Privacy and limits

The CLI reads only the manual, proposal bundles, exports, and optional settings file that you name. It writes `plugin/.claude-plugin/{plugin,marketplace}.json`, `plugin/hooks/{hooks.json,register.ts,register.test.ts}`, `PROPOSALS.md`, and `PROPOSALS.json` below `--out`. Temporary files are prepared in its parent folder. It never edits the input or settings file, and it does not automatically write to home configuration.

Keep both proposal reports private. They contain source quotes and the manual's basename (its filename without the folders). Share only the reviewed `plugin/` folder. That folder and every export contain the plugin name and the manual's SHA-256. This fingerprint lets someone who already has the manual check which version produced the plugin. It does not reveal the manual's contents.

Content check messages show the rule and matched term (`forbidden term "…"`). They never show the source line.

The plugin store keeps two kinds of local activity records: event counts with their start time, and the resume brief's last time and turn count for each working directory. The directory's path is the key for that second record. The publish guard also stores a grant's expiry time as permission state. The plugin never stores prompts, answers, tool output, or manual text.

When you explicitly export, the plugin writes to the absolute path you choose, or prints JSON with `--print`. The export contains only plugin identity, profile hash, export time, counts, and boolean (on/off) or numeric settings. It leaves out string parameters such as phrases, patterns, and language.

kokoro-mods sends neither your manual nor these records to a network service. Recipe rules from the catalog may enter Claude Code's model context, the information the model sees. Quotes from the manual stay out of the plugin. Claude Code's own data settings stay as they are.

The publish guard protects **Bash only**. It blocks matching Bash publish commands outside the permitted time. It does not cover other tools or scripts that publish internally. If the pattern list is empty or cannot be compiled, the guard blocks every Bash command until you fix the setting in `/config`. You can switch the guard off with the recipe's toggle.

Counts tell you which actions happened. They cannot tell you whether your work felt easier, or whether this change caused an improvement. The plugin API is early access. The golden plugin (the generator's own output for the English fixture) and generated plugins were checked with Claude Code 2.1.290 and 2.1.291. Later versions still need compatibility checks.

## Relationship to KOKORO

The **KOKORO specification** defines `kokoro.md`, a personal AI user manual. A psychologist translates a clinical formulation, their professional understanding of the person's situation, into working preferences for an AI. The clinical findings themselves are not passed on. The specification's repository is private at the time of writing. The public part of the project is [kokoro-mcp](https://github.com/akihidem/kokoro-mcp). It is a loader and MCP server that signs, verifies, revokes, and delivers a `kokoro.md` to the model. The specification and kokoro-mcp are both by the Certified Public Psychologist (公認心理師) who designed Your Own Mod.

Your Own Mod is a separate tool. It is not part of the specification.

- It reads a `kokoro.md` (frontmatter `format: kokoro/...`, or `format_version` as the specification calls it), a self-written `torisetsu.md` (`format: torisetsu/...`), or any loosely structured profile. It reads these only to find working preferences. It does not read or require diagnosis labels, a psychologist's review, or a consent field. It does not check signatures.
- Its content check follows the specification's forbidden-content rules. It refuses diagnosis labels, assessment scores, content about hurting yourself, instructions to override safety rules, role-play instructions, and broken structure (Appendix A of the [design](docs/design/DESIGN.md)). Passing the check does not make a document a conformant `kokoro.md`. Checking conformance, review, and signing remain the job of the specification and kokoro-mcp.
- It does not send the manual into the model's context. kokoro-mcp does that. You can use both together: kokoro-mcp gives the manual to the model, and Your Own Mod turns a few preferences into hooks, actions that the working environment enforces and counts.
- This repository contains no specification text and no real manual. The fixtures describe fictional people. The proposals you generate stay on your machine.

## Development

Use Node's built-in tests and the actual plugin validator:

```sh
node --test test/*.test.mjs
claude plugin validate --strict docs/design/golden/plugin
```

`npm test` uses the explicit glob, a filename pattern. Avoid bare `node --test`, which can pick up the golden plugin's TypeScript tests. Integration tests generate plugins from each of the three valid fixtures. With an empty temporary `HOME`, they run `claude plugin validate --strict` and `claude plugin test`, then check the number and names of generated tests that ran. They also run the generated module using Node's type stripping, which removes type annotations, to check the export the module writes.

If Claude is absent, the tests fail with `claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip`. Setting that variable to `1` lists the affected tests as skipped by name. A2 is then unverified. CI runs on Node 22 and 24 and installs Claude Code 2.1.290. It sets the skip variable only if installation fails. On `main` and on tags, an installation failure fails the job.

The [design](docs/design/DESIGN.md), [public interfaces](docs/design/contracts/w4-interfaces.md), and [fixture facts](docs/design/contracts/w4-facts.md) describe the contracts and acceptance criteria.

Exit codes are 0 for success and help, 1 for failure (an unreadable or invalid input file, a refused ownership record, or an unexpected error), 2 for a usage error, 3 for a failed content check, 4 for a changed diff, and 5 for an output conflict. Errors show codes and keys, without excerpts from the input.

MIT license. See [LICENSE](LICENSE).
