# Public interfaces of the merged modules (generated)


## `src/catalog/index.mjs`

```js
/** The six emitter templates, in their frozen order. @type {string[]} */
export const TEMPLATE_KEYS = [
  'compose-rule', 'submit-detector', 'publish-guard', 'running-indicator', 'resume-brief', 'focus-timer',
]

/** The 17 recipes in DESIGN §6 order; all injected text is authored here. */
export const RECIPES = [
  recipe(
```

```js
/** The 17 recipes in DESIGN §6 order; all injected text is authored here. */
export const RECIPES = [
  recipe(
```

```js
/** Recipe ids in catalog order. @type {string[]} */
export const RECIPE_IDS = RECIPES.map(({ id }) => id)

/** Distinct countable event names, sorted for stable schema generation. @type {string[]} */
export const EVENT_NAMES = [...new Set(RECIPES.flatMap(({ metrics }) => metrics))].sort()

/** Look up a recipe by its frozen id; return undefined for an unknown id. */
export function getRecipe(id)
```

```js
/** Distinct countable event names, sorted for stable schema generation. @type {string[]} */
export const EVENT_NAMES = [...new Set(RECIPES.flatMap(({ metrics }) => metrics))].sort()

/** Look up a recipe by its frozen id; return undefined for an unknown id. */
export function getRecipe(id)
```

```js
/** Look up a recipe by its frozen id; return undefined for an unknown id. */
export function getRecipe(id)
```


## `src/check.mjs`

```js
/** Frozen, input-independent rule metadata for command listings. */
export const RULES = Object.freeze(definitions.map(({ id, level, description }) =>
  Object.freeze({ id, level, description })))

function negatesRequest(text, match, rule)
```

```js
/**
 * Check every raw line against Appendix A without interpreting the person's labels.
 * @param {object} profile A parsed Profile.
 * @returns {{level: 'FAIL'|'WARN', rule: string, line: number|null, message: string}[]} Sorted findings.
 */
export function checkProfile(profile)
```

```js
/**
 * Count the two finding levels without changing the findings.
 * @param {{level: 'FAIL'|'WARN'}[]} findings
 * @returns {{fails: number, warns: number}}
 */
export function summarize(findings)
```


## `src/constants.mjs`

```js
export const TOOL_NAME = 'kokoro-mods'
export const TOOL_VERSION = '0.1.0'

/** Section keys in the order of the KOKORO spec (§4.1). 'unknown' is for lines before
 *  the first heading and for headings no keyword maps. */
export const SECTION_KEYS = Object.freeze([
  'boundaries', 'about', 'strengths', 'style', 'care', 'weak', 'focus', 'decision', 'history', 'unknown',
```

```js
export const TOOL_VERSION = '0.1.0'

/** Section keys in the order of the KOKORO spec (§4.1). 'unknown' is for lines before
 *  the first heading and for headings no keyword maps. */
export const SECTION_KEYS = Object.freeze([
  'boundaries', 'about', 'strengths', 'style', 'care', 'weak', 'focus', 'decision', 'history', 'unknown',
])
```

```js
/** Section keys in the order of the KOKORO spec (§4.1). 'unknown' is for lines before
 *  the first heading and for headings no keyword maps. */
export const SECTION_KEYS = Object.freeze([
  'boundaries', 'about', 'strengths', 'style', 'care', 'weak', 'focus', 'decision', 'history', 'unknown',
])

/** `## N. title` headings map by number, as kokoro.md and torisetsu.md number them. */
export const SECTION_BY_NUMBER = Object.freeze(
```

```js
/** `## N. title` headings map by number, as kokoro.md and torisetsu.md number them. */
export const SECTION_BY_NUMBER = Object.freeze(
```

```js
/** Unnumbered `##` headings map by keyword (case-insensitive substring; ja and en).
 *  First key whose any keyword matches wins, in this order. */
export const HEADING_KEYWORDS = Object.freeze(
```

```js
/** `###` subsections whose heading contains one of these hold examples, not instructions. */
export const EXAMPLE_HEADING_MARKERS = Object.freeze(['効いた', '効かなかった', 'example', 'examples'])

/** Exit codes (DESIGN.md §9). 1 and 2 are reserved for failures and usage errors so a
 *  verdict can never be confused with a crash. */
export const EXIT = Object.freeze(
```

```js
/** Exit codes (DESIGN.md §9). 1 and 2 are reserved for failures and usage errors so a
 *  verdict can never be confused with a crash. */
export const EXIT = Object.freeze(
```

```js
/** Keys the generated mod uses in `$.store` (DESIGN.md §5.6, §7). */
export const STORE_KEYS = Object.freeze(
```

```js
/** Default number of proposals enabled by default (DESIGN.md §2 principle 4). */
export const DEFAULT_MAX_ENABLED = 3

/** Minimum length of a profile line for the leak check (DESIGN.md §8 A5). */
export const LEAK_CHECK_MIN_CHARS = 12

```

```js
/** Minimum length of a profile line for the leak check (DESIGN.md §8 A5). */
export const LEAK_CHECK_MIN_CHARS = 12

```


## `src/diff.mjs`

```js
/**
 * Compare bundles by recipe id, ignoring metadata and evidence line renumbering.
 * Duplicate ids in either input are rejected rather than silently overwritten.
 * @param {{proposals: object[]}} before A Bundle or a proposals-only wrapper.
 * @param {{proposals: object[]}} after A Bundle or a proposals-only wrapper.
 * @returns {{added: string[], removed: string[], changed: {recipeId: string, fields: string[]}[], same: string[], hasChanges: boolean}} Sorted changes.
 */
export function diffProposals(before, after)
```

```js
/**
 * Render a proposal diff in four CLI lines, mentioning each recipe id once.
 * @param {ReturnType<typeof diffProposals>} diff A proposal diff.
 * @param {{lang?: 'ja'|'en'}} [options] Display language, defaulting to English.
 * @returns {string} Human-readable added, removed, changed, and unchanged lists.
 */
export function formatDiff(diff, { lang = 'en' } = {})
```


## `src/emit.mjs`

```js
/** Return snake(recipeId), optionally followed by an underscore and param. */
export function userConfigKey(recipeId, param = null)
```

```js
/** Copy the bundle without proposal evidence, leaving the input untouched. */
export function stripEvidence(bundle)
```

```js
/** Emit the seven owned files as a sorted Map of relative paths to UTF-8 text. */
export function emitPlugin({ bundle, recipes, lang = 'en', outDirName = '.' })
```

```js
/** Write a file map beneath outDir and resolve to the sorted relative paths written. */
export async function writePluginFolder(files, outDir)
```

```js
/** Find every needle under plugin/, including its JSON-escaped spelling, at any length. */
export function leakCheck(files, needles)
```


## `src/match.mjs`

```js
/**
 * Match a Profile to ranked proposals without modifying the profile or catalog.
 * deriveParams receives all hits in line order, with the source line fields plus
 * quote and matched; recipe derivations keep the first explicit value per param.
 * It is also called on source-ordered prefixes to retain parameter source evidence.
 * @param {object} profile A Profile as defined in DESIGN §5.1.
 * @param {object[]} [recipes=RECIPES] Recipes in catalog order.
 * @param {{maxEnabled?: number}} [options] Maximum initially enabled proposals.
 * @returns {object[]} Proposals with one to three source evidence entries.
 */
export function matchRecipes(profile, recipes = RECIPES, { maxEnabled = DEFAULT_MAX_ENABLED } = {})
```

```js
/**
 * Package proposals as given with deterministic profile metadata and sorted paths.
 * @param {object} profile A Profile.
 * @param {object[]} proposals Proposals whose order and values are retained.
 * @param {{file: string, sha256: string, pluginName: string, files?: string[], recipes?: object[]}} options Output metadata and catalog.
 * @returns {object} A Bundle as defined in DESIGN §5.4.
 */
export function buildBundle(profile, proposals, { file, sha256, pluginName, files = [], recipes = RECIPES })
```

```js
/**
 * Use the first non-empty normalized candidate without an Appendix A English term.
 * @param {object} profile A Profile.
 * @param {{name?: string}} [options] Optional name taking precedence over the profile.
 * @returns {string} A kebab-case slug of at most 40 characters, or 'profile'.
 */
export function slugFor(profile, options = {})
```

```js
/** @returns {'option'|'frontmatter'|'alias'|'title'|'fallback'} The winning slug candidate. */
export function slugSource(profile, options = {})
```


## `src/profile.mjs`

```js
/**
 * Detect Japanese when CJK code points are at least 20% of non-space text.
 * @param {string} text
 * @returns {'ja'|'en'}
 */
export function detectLanguage(text)
```

```js
/**
 * Resolve a heading using the frozen number map or the first keyword match.
 * @param {string} heading
 * @param {number|null} [number]
 * @returns {keyof typeof HEADING_KEYWORDS|'unknown'}
 */
export function sectionKeyForHeading(heading, number = null)
```

```js
/**
 * Parse the frozen Profile shape (DESIGN.md §5.1), preserving evidence lines.
 * @param {string} text
 * @returns {object} A Profile with inclusive section ranges and verbatim raw lines.
 */
export function parseProfile(text)
```


## `src/templates/manifest.mjs`

```js
/** Return the shared manifest identifier for a recipe toggle or parameter. */
export function configKey(recipeId, param = null)
```

```js
/** Include cooldown suppression in the two recipes that can raise toasts. */
export function metricEvents(recipe)
```

```js
/** Build userConfig from an evidence-free bundle, using only declared fields. */
export function buildUserConfig({ bundle, recipes, lang = 'en' })
```

```js
/** Render the two strict manifests; proposal evidence is rejected at this boundary. */
export function renderManifest({ bundle, recipes, lang = 'en' })
```


## `src/templates/proposals.mjs`

```js
/** Render the private reports; this is the only template that receives evidence. */
export function renderProposals({ bundle, recipes, lang = 'en', outDirName = '.' })
```


## `src/templates/register.mjs`

```js
/** Render readable, dependency-free hooks from an evidence-free bundle. */
export function renderRegister({ bundle, recipes })
```

```js
export const register: Register = (on, options) =>
```


## `src/templates/tests.mjs`

```js
/** Render engine tests using only catalog text and an evidence-free bundle. */
export function renderTests({ bundle, recipes })
```
