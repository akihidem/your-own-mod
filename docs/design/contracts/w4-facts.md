# Facts for W4 (generated from the merged sources on 2026-10-06; slug and pattern spelling corrected at the final pass)

Everything below was produced by running the merged modules; freeze these literals in test/cli.test.mjs. The slug no longer derives from the manual (DESIGN §5.4a): without `--name` it is `profile` and `slugSource` is `fallback`. Regex alternation is written `\|` inside the tables.

## Fixture inventory

- fixtures/valid (3): en-generic.md, ja-kokoro.md, ja-torisetsu.md
- fixtures/invalid (13): diagnosis-emphasis.md, diagnosis-entity.md, diagnosis-mixed-width.md, diagnosis-zero-width.md, diagnosis.md, no-structure.md, override-ja-conditional.md, override-too-many-words.md, override-two-clauses.md, override.md, roleplay.md, self-harm.md, test-score.md
- fixtures/benign (2): dont-ignore-safety.md, hanging-indent.md

## Content check per fixture (FAIL rules / WARN rules)

- valid/en-generic.md: format=generic language=en sections=6 FAIL=[] WARN=[]
- valid/ja-kokoro.md: format=kokoro language=ja sections=9 FAIL=[] WARN=[]
- valid/ja-torisetsu.md: format=torisetsu language=ja sections=9 FAIL=[] WARN=[]
- invalid/diagnosis-emphasis.md: format=generic language=en sections=3 FAIL=[F-DIAGNOSIS@L4] WARN=[]
- invalid/diagnosis-entity.md: format=generic language=en sections=3 FAIL=[F-DIAGNOSIS@L4] WARN=[]
- invalid/diagnosis-mixed-width.md: format=generic language=en sections=3 FAIL=[F-DIAGNOSIS@L4] WARN=[]
- invalid/diagnosis-zero-width.md: format=generic language=en sections=3 FAIL=[F-DIAGNOSIS@L4] WARN=[]
- invalid/diagnosis.md: format=kokoro language=ja sections=3 FAIL=[F-DIAGNOSIS@L11] WARN=[]
- invalid/no-structure.md: format=kokoro language=ja sections=0 FAIL=[F-STRUCTURE@Lnull] WARN=[]
- invalid/override-ja-conditional.md: format=generic language=en sections=3 FAIL=[F-OVERRIDE@L4] WARN=[]
- invalid/override-too-many-words.md: format=generic language=en sections=3 FAIL=[F-OVERRIDE@L4] WARN=[]
- invalid/override-two-clauses.md: format=generic language=en sections=3 FAIL=[F-OVERRIDE@L4] WARN=[]
- invalid/override.md: format=generic language=en sections=3 FAIL=[F-OVERRIDE@L4] WARN=[]
- invalid/roleplay.md: format=generic language=en sections=3 FAIL=[F-ROLEPLAY@L4] WARN=[]
- invalid/self-harm.md: format=kokoro language=ja sections=3 FAIL=[F-SELF-HARM@L11] WARN=[]
- invalid/test-score.md: format=torisetsu language=ja sections=3 FAIL=[F-TEST-SCORE@L11] WARN=[]
- benign/dont-ignore-safety.md: format=torisetsu language=ja sections=3 FAIL=[] WARN=[]
- benign/hanging-indent.md: format=generic language=en sections=3 FAIL=[] WARN=[]

## Proposals per valid fixture (default maxEnabled = 3)

### en-generic.md (slug: profile / slugSource: fallback)

| recipe | on by default | confidence | quotes (lines) | params |
|---|---|---|---|---|
| publish-guard | true | medium | 4 | {"allow_minutes":30,"patterns":["\\bgit\\s+(-C\\s+\\S+\\s+)?push\\b","\\bgh\\s+(pr\|issue)\\s+create\\b","\\bgh\\s+repo\\s+(create\|edit\|delete)\\b","\\bgh\\s+release\\s+create\\b","\\bnpm\\s+publish\\b"]} |
| lead-with-answer | true | medium | 12 | {"max_lines":12,"max_chars":0} |
| one-next-step | true | medium | 13 | {} |
| respect-stop-signals | false | medium | 5 | {"phrases":["一旦やめる","あとで","終わり","おわり","一旦ここまで","stop for now","that's enough","let's stop","wrap up"]} |
| offer-options | false | medium | 17 | {"min":2,"max":4} |
| plain-language | false | medium | 16 | {} |
| running-indicator | false | medium | 20 | {"long_turn_seconds":120} |
| session-resume-brief | false | medium | 9 | {} |
| focus-timer | false | medium | 21 | {"interval_minutes":50} |

notMatched: accept-typos-as-intent, block-ahead-warning, expert-role-with-evidence, no-psych-framing, quiet-confirmations, receive-only-fragments, response-language, trace-offers

### ja-kokoro.md (slug: profile / slugSource: fallback)

| recipe | on by default | confidence | quotes (lines) | params |
|---|---|---|---|---|
| one-next-step | true | high | 28,40,50 | {} |
| trace-offers | true | high | 29,41 | {} |
| lead-with-answer | true | high | 24 | {"max_lines":12,"max_chars":0} |
| accept-typos-as-intent | false | high | 25 | {} |
| response-language | false | high | 26 | {"language":"ja"} |
| receive-only-fragments | false | high | 9 | {"max_chars":24,"phrases":["眠い","疲れた","落ち込んでる","つらい","しんどい","tired","exhausted","feeling down"]} |
| respect-stop-signals | false | high | 10 | {"phrases":["一旦やめる","あとで","終わり","おわり","一旦ここまで","stop for now","that's enough","let's stop","wrap up"]} |
| no-psych-framing | false | high | 11 | {} |
| quiet-confirmations | false | high | 38 | {} |
| offer-options | false | high | 57 | {"min":2,"max":4} |
| plain-language | false | high | 39 | {} |
| expert-role-with-evidence | false | high | 27 | {} |
| running-indicator | false | high | 44 | {"long_turn_seconds":120} |
| block-ahead-warning | false | high | 45 | {} |
| session-resume-brief | false | high | 16 | {} |
| focus-timer | false | high | 46 | {"interval_minutes":50} |

notMatched: publish-guard

### ja-torisetsu.md (slug: profile / slugSource: fallback)

| recipe | on by default | confidence | quotes (lines) | params |
|---|---|---|---|---|
| publish-guard | true | high | 18 | {"allow_minutes":30,"patterns":["\\bgit\\s+(-C\\s+\\S+\\s+)?push\\b","\\bgh\\s+(pr\|issue)\\s+create\\b","\\bgh\\s+repo\\s+(create\|edit\|delete)\\b","\\bgh\\s+release\\s+create\\b","\\bnpm\\s+publish\\b"]} |
| respect-stop-signals | true | high | 17,47 | {"phrases":["一旦やめる","あとで","終わり","おわり","一旦ここまで","stop for now","that's enough","let's stop","wrap up"]} |
| lead-with-answer | true | high | 31 | {"max_lines":12,"max_chars":0} |
| one-next-step | false | high | 33 | {} |
| offer-options | false | high | 55 | {"min":2,"max":4} |
| plain-language | false | high | 36 | {} |
| focus-timer | false | high | 45 | {"interval_minutes":50} |

notMatched: accept-typos-as-intent, block-ahead-warning, expert-role-with-evidence, no-psych-framing, quiet-confirmations, receive-only-fragments, response-language, running-indicator, session-resume-brief, trace-offers

## Files emitPlugin returns (relative paths, in order)

- PROPOSALS.json
- PROPOSALS.md
- plugin/.claude-plugin/marketplace.json
- plugin/.claude-plugin/plugin.json
- plugin/hooks/hooks.json
- plugin/hooks/register.test.ts
- plugin/hooks/register.ts

## Exports available

- src/catalog/index.mjs: EVENT_NAMES, RECIPES, RECIPE_IDS, TEMPLATE_KEYS, getRecipe
- src/match.mjs: buildBundle, matchRecipes, slugFor, slugSource
- src/emit.mjs: emitPlugin, leakCheck, stripEvidence, userConfigKey, writePluginFolder
- src/profile.mjs: detectLanguage, parseProfile, sectionKeyForHeading
- src/check.mjs: RULES, checkProfile, summarize
