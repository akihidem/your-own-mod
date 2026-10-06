import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, win32 } from 'node:path'
import { TOOL_NAME } from './constants.mjs'
import { isPluginName } from './match.mjs'
import { configKey, renderManifest } from './templates/manifest.mjs'
import { renderRegister } from './templates/register.mjs'
import { renderTests } from './templates/tests.mjs'
import { renderProposals } from './templates/proposals.mjs'

const PATHS = [
  'PROPOSALS.json',
  'PROPOSALS.md',
  'plugin/.claude-plugin/marketplace.json',
  'plugin/.claude-plugin/plugin.json',
  'plugin/hooks/hooks.json',
  'plugin/hooks/register.test.ts',
  'plugin/hooks/register.ts',
]
const TEMPLATES = new Set([
  'compose-rule', 'submit-detector', 'publish-guard',
  'running-indicator', 'resume-brief', 'focus-timer',
])
const CONFIDENCES = new Set(['high', 'medium', 'low'])

// Text the distributable may contain apart from the bundle's own values: every static
// line of the generated files comes from the templates' source, and the store keys from
// the shared constants. Read once, at load; used only to exempt leak-check needles.
const STATIC_SOURCES = ['./templates/manifest.mjs', './templates/register.mjs', './templates/tests.mjs', './templates/proposals.mjs', './constants.mjs']
  .map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

function fold(text) {
  return String(text).normalize('NFKC').toLowerCase()
}

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(item => strings(item, out))
  else if (value !== null && typeof value === 'object' && !(value instanceof RegExp)) Object.values(value).forEach(item => strings(item, out))
  return out
}

// The bundle fields that enter the manifest, the module and every export are checked
// here because this is the last step before text becomes distributable; the CLI builds
// the bundle itself, so a failure is an internal defect, except the plugin name, which a
// caller chooses (final inspection, chunk C).
function assertEmittable(bundle) {
  const fail = (code, message) => {
    const error = new Error(`${TOOL_NAME}: ${message}`)
    error.code = code
    throw error
  }
  if (bundle === null || typeof bundle !== 'object') fail('E_BUNDLE', 'bundle: expected an object')
  if (!isPluginName(bundle.pluginName)) fail('E_PLUGIN_NAME', 'pluginName: expected a kokoro-mods plugin name')
  if (!/^[a-f0-9]{64}$/u.test(bundle.profile?.sha256 ?? '')) fail('E_BUNDLE', 'profile.sha256: expected a SHA-256 hex digest')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(bundle.tool?.version ?? '')) fail('E_BUNDLE', 'tool.version: expected a version')
  if (!Array.isArray(bundle.proposals)) fail('E_BUNDLE', 'proposals: expected an array')
  bundle.proposals.forEach((proposal, index) => {
    if (proposal === null || typeof proposal !== 'object') fail('E_BUNDLE', `proposals[${index}]: expected an object`)
    if (!CONFIDENCES.has(proposal.confidence)) fail('E_BUNDLE', `proposals[${index}].confidence: expected high, medium or low`)
    if (typeof proposal.enabledByDefault !== 'boolean') fail('E_BUNDLE', `proposals[${index}].enabledByDefault: expected a boolean`)
    if (proposal.params === null || typeof proposal.params !== 'object') fail('E_BUNDLE', `proposals[${index}].params: expected an object`)
    if (!Array.isArray(proposal.evidence)) fail('E_BUNDLE', `proposals[${index}].evidence: expected an array`)
    proposal.evidence.forEach((entry, position) => {
      if (entry === null || typeof entry !== 'object') fail('E_BUNDLE', `proposals[${index}].evidence[${position}]: expected an object`)
    })
  })
}

// Parameters are checked against the recipe here as well as in the manifest template:
// an undeclared key is named by position, and a pattern list must compile in Unicode
// mode before it is shipped, because the generated guard denies every Bash command when
// one pattern does not (re-inspection, chunk C, M1 and M3).
function assertParams(proposal, recipe, index) {
  const fail = message => {
    const error = new Error(`${TOOL_NAME}: ${message}`)
    error.code = 'E_BUNDLE'
    throw error
  }
  Object.keys(proposal.params).forEach((name, position) => {
    if (!Object.hasOwn(recipe.params, name)) fail(`proposals[${index}].params: unknown key at index ${position}`)
  })
  for (const [name, spec] of Object.entries(recipe.params)) {
    if (!Object.hasOwn(proposal.params, name)) fail(`proposals[${index}].params.${name}: required parameter is missing`)
    if (name !== 'patterns' || spec.type !== 'string' || !spec.multiple) continue
    const patterns = proposal.params[name]
    if (!Array.isArray(patterns) || patterns.length === 0) fail(`proposals[${index}].params.${name}: expected a non-empty list of patterns`)
    patterns.forEach((source, position) => {
      if (typeof source !== 'string') fail(`proposals[${index}].params.${name}[${position}]: expected a pattern string`)
      try { new RegExp(source, 'u') } catch { fail(`proposals[${index}].params.${name}[${position}]: expected a pattern valid in Unicode mode`) }
    })
  }
}

/** Return snake(recipeId), optionally followed by an underscore and param. */
export function userConfigKey(recipeId, param = null) {
  return configKey(recipeId, param)
}

/**
 * Copy the bundle for the distributable templates, leaving the input untouched. The copy
 * is built additively from the known fields: evidence is left out, and so is any other
 * field a hand-edited or future bundle might carry (re-inspection, chunk C, M1).
 */
export function stripEvidence(bundle) {
  const { tool, profile } = bundle
  return {
    tool: { name: tool.name, version: tool.version },
    profile: { file: profile.file, format: profile.format, language: profile.language, version: profile.version ?? null, sha256: profile.sha256 },
    pluginName: bundle.pluginName,
    proposals: bundle.proposals.map(({ recipeId, confidence, params, enabledByDefault }) => ({ recipeId, confidence, params, enabledByDefault })),
    notMatched: [...(bundle.notMatched ?? [])],
    files: [...(bundle.files ?? [])],
  }
}

/**
 * The needles of the leak check, NFKC-folded and lower-cased: every `quote` and
 * `matched` of the bundle that is at least two characters long, except those that the
 * catalog's own text, the templates' source or the plugin name contains. Such text
 * ("push", 確認, a line that is word for word a recipe title) occurs in the distributable
 * legitimately and reveals nothing beyond which recipes matched, so it cannot evidence
 * a leak; a needle of any length that is not such text can (final inspection, chunk C;
 * re-inspection, chunk C, L4, which removed the earlier twelve-character floor).
 * @param {object} bundle A Bundle with evidence.
 * @param {Object<string, object>} recipes The catalog, keyed by id.
 * @returns {Map<string, string>} Folded needle to its first source, `proposals[i].evidence[j]`.
 */
export function leakNeedles(bundle, recipes) {
  const corpus = fold([STATIC_SOURCES, bundle.pluginName, ...strings(Object.values(recipes))].join('\n'))
  const needles = new Map()
  bundle.proposals.forEach((proposal, index) => {
    (proposal.evidence ?? []).forEach(({ quote, matched }, position) => {
      for (const value of [quote, matched]) {
        if (typeof value !== 'string') continue
        const needle = fold(value).trim()
        if (needle.length < 2 || corpus.includes(needle) || needles.has(needle)) continue
        needles.set(needle, `proposals[${index}].evidence[${position}]`)
      }
    })
  })
  return needles
}

/** Emit the seven owned files as a sorted Map of relative paths to UTF-8 text. */
export function emitPlugin({ bundle, recipes, lang = 'en', outDirName = '.' }) {
  assertEmittable(bundle)
  const selected = Object.create(null)
  const pluginRecipes = Object.create(null)
  for (const proposal of bundle.proposals) {
    const id = proposal.recipeId
    if (!Object.hasOwn(recipes, id) || !recipes[id]) throw new Error(`${TOOL_NAME}: unknown recipe id: ${id}`)
    if (Object.hasOwn(selected, id)) throw new Error(`${TOOL_NAME}: duplicate proposal: ${id}`)
    if (!TEMPLATES.has(recipes[id].template)) throw new Error(`${TOOL_NAME}: unknown recipe template`)
    assertParams(proposal, recipes[id], bundle.proposals.indexOf(proposal))
    selected[id] = recipes[id]
    const { evidence, ...recipe } = recipes[id]
    pluginRecipes[id] = recipe
  }
  // Make the privacy boundary explicit before invoking any distributable template.
  const stripped = stripEvidence(bundle)
  // Canonicalise distributable files; the private reports retain proposal ranking.
  stripped.proposals.sort((a, b) => a.recipeId < b.recipeId ? -1 : a.recipeId > b.recipeId ? 1 : 0)
  const input = { bundle: stripped, recipes: pluginRecipes, lang }
  const files = renderManifest(input)
  files.set('plugin/hooks/hooks.json', JSON.stringify({ modules: ['./register.ts'] }, null, 2) + '\n')
  files.set('plugin/hooks/register.ts', renderRegister(input))
  files.set('plugin/hooks/register.test.ts', renderTests(input))
  const report = { ...bundle, files: [...PATHS] }
  for (const [path, text] of renderProposals({ bundle: report, recipes: selected, lang, outDirName })) files.set(path, text)
  // Second defence after the structural one above: nothing quoted from the manual may
  // be found under plugin/ (DESIGN §5.5). The error names the file and the evidence
  // position, never the text.
  const needles = leakNeedles(bundle, recipes)
  const [leak] = leakCheck(files, needles.keys())
  if (leak) {
    const path = leak.slice(0, leak.indexOf(': '))
    const error = new Error(`E_LEAK: ${path} (${needles.get(leak.slice(path.length + 2)) ?? 'needle'})`)
    error.code = 'E_LEAK'
    throw error
  }
  return new Map(PATHS.map(path => [path, files.get(path)]))
}

/** Write a file map beneath outDir and resolve to the sorted relative paths written. */
export async function writePluginFolder(files, outDir) {
  const paths = [...files.keys()].sort()
  // Validate all destinations first so a bad map cannot partially escape its folder.
  for (const path of paths) {
    if (typeof path !== 'string' || isAbsolute(path) || win32.isAbsolute(path) ||
        /^[A-Za-z]:/.test(path) || path.includes('\\') ||
        path.split('/').some(part => part === '' || part === '.' || part === '..') ||
        typeof files.get(path) !== 'string') {
      throw new TypeError('Expected a relative file path and text')
    }
  }
  for (const path of paths) {
    const destination = resolve(outDir, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, files.get(path), 'utf8')
  }
  return paths
}

/**
 * Find every needle under plugin/, in its plain and its JSON-escaped spelling, at any
 * length. Both sides are NFKC-folded and lower-cased, so a differently cased or
 * full-width copy is found too.
 * @param {Map<string, string>} files Emitted files.
 * @param {Iterable<string>} needles Strings that must not occur.
 * @returns {string[]} `path: needle` for every hit, files in sorted order.
 */
export function leakCheck(files, needles) {
  const searches = [...needles].map(needle => {
    const folded = fold(needle)
    return [needle, folded, JSON.stringify(folded).slice(1, -1)]
  })
  const found = []
  for (const path of [...files.keys()].sort()) {
    if (!path.startsWith('plugin/')) continue
    const text = fold(files.get(path))
    for (const [needle, folded, escaped] of searches) {
      if (text.includes(folded) || text.includes(escaped)) found.push(`${path}: ${needle}`)
    }
  }
  return found
}
