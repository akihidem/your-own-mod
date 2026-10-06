import { readFileSync } from 'node:fs'
import { RECIPES } from './catalog/index.mjs'
import { userConfigKey } from './emit.mjs'
import { assertMetricsExport } from './metrics.mjs'

function problem(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// `code` names the error family; `label` names the argument in the message, so a
// report with two exports says which one failed (final inspection, chunk D, L8).
function readJson(path, code, label = code) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    problem(`E_${code.toUpperCase()}_READ`, `${label}: unable to read file`)
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch {
    // JSON.parse diagnostics may quote the private file; replace them completely.
    problem(`E_${code.toUpperCase()}_JSON`, `${label}: invalid JSON`)
  }
}

/**
 * Read and validate an export; errors identify keys, never file contents.
 * @param {string} path Export path.
 * @param {object} sets Allowlists accepted by assertMetricsExport.
 * @param {string} [label='export'] The argument name used in messages ('before' for the second export).
 * @returns {object} Validated export.
 */
export function readExport(path, sets, label = 'export') {
  const value = readJson(path, 'export', label)
  try {
    assertMetricsExport(value, sets)
  } catch (error) {
    // A shape error names the argument too, so a report with two exports says which
    // one failed (re-inspection, chunk D/E, F5); the message still holds key paths only.
    if (error?.code !== 'E_EXPORT_SHAPE') throw error
    problem('E_EXPORT_SHAPE', `${label}: ${error.message}`)
  }
  return value
}

/**
 * Two exports are comparable only when the same plugin wrote them; counts of different
 * mods must never be shown as one mod's change (final inspection, chunk D, M6). A changed
 * profile hash is reported, not refused: the counts of one plugin stay comparable across
 * edits of the manual, and the caller prints the warning.
 * @param {object} before Validated earlier export.
 * @param {object} after Validated later export.
 * @returns {{profileChanged: boolean}} Whether the manual's hash differs between the two.
 * @throws {Error} With code E_EXPORT_MISMATCH when the plugin names differ.
 */
export function assertComparable(before, after) {
  if (before.plugin !== after.plugin) problem('E_EXPORT_MISMATCH', 'plugin: the two exports belong to different plugins')
  // The digest is accepted in either case, so it is compared case-insensitively.
  return { profileChanged: before.profileSha256.toLowerCase() !== after.profileSha256.toLowerCase() }
}

/**
 * Compare the union of recipe/event keys, treating absent counts as zero.
 * @param {object} before Validated earlier export.
 * @param {object} after Validated later export.
 * @returns {Object<string, Object<string, {before: number, after: number, delta: number}>>}
 */
export function compareExports(before, after) {
  const a = before.metrics.counts
  const b = after.metrics.counts
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map(id => {
    const oldCounts = Object.hasOwn(a, id) ? a[id] : {}
    const newCounts = Object.hasOwn(b, id) ? b[id] : {}
    const events = [...new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)])].sort()
    return [id, Object.fromEntries(events.map(event => {
      const oldCount = Object.hasOwn(oldCounts, event) ? oldCounts[event] : 0
      const newCount = Object.hasOwn(newCounts, event) ? newCounts[event] : 0
      return [event, { before: oldCount, after: newCount, delta: newCount - oldCount }]
    }))]
  }))
}

/**
 * Read explicit plugin options without changing settings or inferring defaults.
 * Pattern diagnostics name the option and index, never the pattern.
 * @param {string} settingsPath Settings JSON path.
 * @param {string} pluginName Plugin identity in the export.
 * @returns {Object<string, unknown>} Options, or an empty object when absent.
 */
export function readSettingsToggles(settingsPath, pluginName) {
  const settings = readJson(settingsPath, 'settings')
  const requireObject = (value, path) => {
    if (!record(value)) problem('E_SETTINGS_SHAPE', `${path}: expected an object`)
  }
  requireObject(settings, 'settings')
  if (!Object.hasOwn(settings, 'pluginConfigs')) return {}
  requireObject(settings.pluginConfigs, 'pluginConfigs')
  if (!Object.hasOwn(settings.pluginConfigs, pluginName)) return {}
  const config = settings.pluginConfigs[pluginName]
  const path = 'pluginConfigs[plugin].options'
  requireObject(config, 'pluginConfigs[plugin]')
  if (!Object.hasOwn(config, 'options')) return {}
  requireObject(config.options, path)

  for (const recipe of RECIPES) {
    if (!Object.hasOwn(recipe.params, 'patterns')) continue
    const key = userConfigKey(recipe.id, 'patterns')
    if (!Object.hasOwn(config.options, key)) continue
    const patterns = config.options[key]
    if (!Array.isArray(patterns)) problem('E_PATTERN', `${path}.${key}: expected an array of patterns`)
    patterns.forEach((pattern, index) => {
      if (typeof pattern !== 'string') {
        problem('E_PATTERN', `${path}.${key}[${index}]: expected a pattern string`)
      }
      try {
        // The generated module compiles with the same flag, so validity means the same thing.
        new RegExp(pattern, 'u')
      } catch {
        problem('E_PATTERN', `${path}.${key}[${index}]: invalid regular expression`)
      }
    })
  }
  return { ...config.options }
}

/**
 * Format event counts, optional deltas, and explicitly enabled settings toggles.
 * @param {{after: object, before?: object, toggles?: object}} summary Validated exports and optional settings.
 * @param {{lang?: 'ja'|'en'}} options Display language.
 * @returns {string} A report with no manual, prompt, or answer excerpts.
 */
export function formatReport(summary, { lang = 'en' } = {}) {
  const ja = lang === 'ja'
  const { after, before, toggles } = summary
  const counts = compareExports(before ?? { metrics: { counts: {} } }, after)
  const lines = [
    `${ja ? 'プラグイン' : 'Plugin'}: ${JSON.stringify(after.plugin)}`,
    `${ja ? '集計開始 (epoch ms)' : 'Since (epoch ms)'}: ${after.metrics.since}`,
  ]
  if (before) lines.push(`${ja ? '比較元の集計開始 (epoch ms)' : 'Before since (epoch ms)'}: ${before.metrics.since}`)
  lines.push(before
    ? (ja ? 'レシピ  イベント  前  後  差' : 'RECIPE  EVENT  BEFORE  AFTER  DELTA')
    : (ja ? 'レシピ  イベント  回数' : 'RECIPE  EVENT  COUNT'))
  let rows = 0
  for (const [id, events] of Object.entries(counts)) {
    for (const [event, value] of Object.entries(events)) {
      lines.push(before
        ? `${id}  ${event}  ${value.before}  ${value.after}  ${value.delta > 0 ? '+' : ''}${value.delta}`
        : `${id}  ${event}  ${value.after}`)
      rows += 1
    }
  }
  if (!rows) lines.push(ja ? '記録された回数はありません。' : 'No recorded counts.')
  if (toggles !== undefined) {
    const keys = RECIPES.map(recipe => userConfigKey(recipe.id))
      .filter(key => Object.hasOwn(toggles, key) && toggles[key] === true).sort()
    lines.push(`${ja ? '設定で明示的にオン' : 'Explicitly on in settings'}: ${keys.join(', ') || (ja ? 'なし' : 'none')}`)
  }
  lines.push(ja
    ? '回数は動作の記録です。負担が減った証明ではありません。リセット後の差は負になることがあります。'
    : 'Counts record actions, not relief. A reset can make a delta negative.')
  return lines.join('\n')
}
