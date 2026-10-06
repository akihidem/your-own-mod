// Shared constants of kokoro-mods. Written with the design (DESIGN.md §5) so that the
// parser (profile.mjs), the matcher (match.mjs) and the emitter (emit.mjs) agree on
// names without importing each other. Keep this file free of logic.

export const TOOL_NAME = 'kokoro-mods'
export const TOOL_VERSION = '0.1.0'

/** Section keys in the order of the KOKORO spec (§4.1). 'unknown' is for lines before
 *  the first heading and for headings no keyword maps. */
export const SECTION_KEYS = Object.freeze([
  'boundaries', 'about', 'strengths', 'style', 'care', 'weak', 'focus', 'decision', 'history', 'unknown',
])

/** `## N. title` headings map by number, as kokoro.md and torisetsu.md number them. */
export const SECTION_BY_NUMBER = Object.freeze({
  1: 'boundaries', 2: 'about', 3: 'strengths', 4: 'style', 5: 'care',
  6: 'weak', 7: 'focus', 8: 'decision', 9: 'history',
})

/** Unnumbered `##` headings map by keyword (case-insensitive substring; ja and en).
 *  First key whose any keyword matches wins, in this order. */
export const HEADING_KEYWORDS = Object.freeze({
  boundaries: ['境界線', '境界', 'boundar', 'limits', 'do not', "don't do"],
  about: ['私について', 'about me', 'who i am', 'background'],
  strengths: ['強み', '関心', 'strength', 'interest', 'what i', 'good at'],
  style: ['応答スタイル', 'スタイル', 'style', 'tone', 'communication', 'how to talk', 'respond', 'answers', 'how i like answers', 'how i like replies', 'replies'],
  care: ['配慮', 'DO / DON', 'do/don', "do's", 'helps', 'what helps', 'preferences', 'please', 'how i like to be supported'],
  weak: ['苦手', '反応しやすい', 'drain', 'trigger', 'struggle', 'hard for me', 'difficult', 'weakness'],
  focus: ['フォーカス', 'focus', 'current', 'right now', 'this quarter', 'projects'],
  decision: ['意思決定', 'decide', 'decision', 'how i choose'],
  history: ['改訂', '履歴', 'history', 'changelog', 'revision'],
})

/** `###` subsections whose heading contains one of these hold examples, not instructions. */
export const EXAMPLE_HEADING_MARKERS = Object.freeze(['効いた', '効かなかった', 'example', 'examples'])

/** Exit codes (DESIGN.md §9). 1 and 2 are reserved for failures and usage errors so a
 *  verdict can never be confused with a crash. */
export const EXIT = Object.freeze({
  OK: 0, FAILURE: 1, USAGE: 2, CHECK_FAILED: 3, DIFF_CHANGED: 4, OUT_CONFLICT: 5,
})

/** Keys the generated mod uses in `$.store` (DESIGN.md §5.6, §7). */
export const STORE_KEYS = Object.freeze({
  metrics: 'kokoro-mods:metrics',
  publishAllowedUntil: 'kokoro-mods:publish-allowed-until',
  lastTurnPrefix: 'kokoro-mods:last:',   // + cwd
})

/** Default number of proposals enabled by default (DESIGN.md §2 principle 4). */
export const DEFAULT_MAX_ENABLED = 3

/** The plugin name is 'kokoro-mods-' plus a slug of at most 40 characters (DESIGN.md
 *  §5.4a). It enters the distributable and every export, so emitter and report both
 *  refuse anything else. */
export const PLUGIN_NAME_PATTERN = /^kokoro-mods-[a-z0-9]+(?:-[a-z0-9]+)*$/u
export const PLUGIN_NAME_MAX_CHARS = 52
