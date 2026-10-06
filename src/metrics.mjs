import { userConfigKey } from './emit.mjs'
import { isPluginName } from './match.mjs'
import { metricEvents } from './templates/manifest.mjs'

/** Version of the closed metrics export schema. */
export const EXPORT_VERSION = 1

function invalid(path, expected) {
  const error = new Error(`${path}: ${expected}`)
  error.code = 'E_EXPORT_SHAPE'
  throw error
}

// Only keys from an allowlist are ever named in a message. An unknown key is input text
// (it could be anything a hand-edited file holds), so it is reported by position only
// (final inspection, chunk D, M1).
function objectAt(value, path, allowed, required = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid(path, 'expected an object')
  }
  Reflect.ownKeys(value).forEach((key, index) => {
    if (typeof key !== 'string' || !allowed.has(key)) invalid(path, `unknown key at index ${index}`)
    // Accessors are not JSON data; do not execute them during validation.
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) {
      invalid(`${path}.${key}`, 'expected a data property')
    }
  })
  for (const key of required) {
    if (!Object.hasOwn(value, key)) invalid(`${path}.${key}`, 'required key is missing')
  }
}

function isoDate(value) {
  if (typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/u.exec(value)
  if (!m) return false
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    (m[7] === 'Z' || (Number(m[8]) <= 23 && Number(m[9]) <= 59)) &&
    Number.isFinite(Date.parse(value))
}

/**
 * Validate every field of an export without including any value in an error.
 * @param {unknown} obj Parsed JSON.
 * @param {{recipeIds: Iterable<string>, eventNames: Iterable<string>, optionKeys: Iterable<string>, optionTypes?: Map<string, 'boolean'|'number'>, recipeEvents?: Map<string, Iterable<string>>}} sets
 *   Allowed keys; `exportSets` builds them from the catalog. Without `optionTypes` an
 *   option may be either scalar type; without `recipeEvents` every recipe may count any
 *   catalog event.
 * @returns {void}
 * @throws {Error} With code E_EXPORT_SHAPE and the offending key path (allowed names only).
 */
export function assertMetricsExport(obj, { recipeIds = [], eventNames = [], optionKeys = [], optionTypes = new Map(), recipeEvents = new Map() } = {}) {
  const top = ['v', 'plugin', 'profileSha256', 'exportedAt', 'options', 'metrics']
  objectAt(obj, '$', new Set(top), top)
  if (obj.v !== EXPORT_VERSION) invalid('$.v', 'unsupported version')
  // The report prints this field, so free text here is refused, never echoed (chunk D,
  // M2); a name carrying a forbidden term is refused like a --name would be.
  if (!isPluginName(obj.plugin)) invalid('$.plugin', 'expected a kokoro-mods plugin name')
  if (typeof obj.profileSha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(obj.profileSha256)) {
    invalid('$.profileSha256', 'expected a SHA-256 hex digest')
  }
  if (!isoDate(obj.exportedAt)) invalid('$.exportedAt', 'expected an ISO 8601 timestamp')

  objectAt(obj.options, '$.options', new Set(optionKeys))
  for (const [key, value] of Object.entries(obj.options)) {
    // A toggle is a boolean and a numeric parameter a finite number; the type comes from
    // the catalog, so a number in a boolean key is a defect (chunk D, L5).
    const type = optionTypes.get(key)
    const ok = type === 'boolean' ? typeof value === 'boolean'
      : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
    if (!ok) invalid(`$.options.${key}`, type === 'boolean' ? 'expected a boolean' : type === 'number' ? 'expected a finite number' : 'expected a boolean or finite number')
  }

  const metricKeys = ['v', 'since', 'counts']
  objectAt(obj.metrics, '$.metrics', new Set(metricKeys), metricKeys)
  if (obj.metrics.v !== EXPORT_VERSION) invalid('$.metrics.v', 'unsupported version')
  if (!Number.isSafeInteger(obj.metrics.since) || obj.metrics.since < 0) {
    invalid('$.metrics.since', 'expected a non-negative integer')
  }
  objectAt(obj.metrics.counts, '$.metrics.counts', new Set(recipeIds))
  const anyEvent = new Set(eventNames)
  for (const [id, counts] of Object.entries(obj.metrics.counts)) {
    const path = `$.metrics.counts.${id}`
    // A recipe may count only the events the generated module can raise for it.
    objectAt(counts, path, recipeEvents.has(id) ? new Set(recipeEvents.get(id)) : anyEvent)
    for (const [event, count] of Object.entries(counts)) {
      if (!Number.isSafeInteger(count) || count < 0) {
        invalid(`${path}.${event}`, 'expected a non-negative safe integer')
      }
    }
  }
}

/**
 * Build the export allowlist: recipe toggles and boolean/numeric parameters only.
 * @param {object[]} recipes Catalog entries.
 * @returns {Set<string>} Allowed userConfig keys in sorted order.
 */
export function buildOptionKeys(recipes) {
  return new Set(buildOptionTypes(recipes).keys())
}

/**
 * The JSON type of every exportable userConfig key (a recipe toggle is a boolean).
 * @param {object[]} recipes Catalog entries.
 * @returns {Map<string, 'boolean'|'number'>} Keys in sorted order.
 */
export function buildOptionTypes(recipes) {
  const types = []
  for (const recipe of recipes) {
    types.push([userConfigKey(recipe.id), 'boolean'])
    for (const [name, param] of Object.entries(recipe.params)) {
      if (param.type === 'boolean' || param.type === 'number') {
        types.push([userConfigKey(recipe.id, name), param.type])
      }
    }
  }
  return new Map(types.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * The events each recipe may count: its catalog `metrics` plus `suppressed` for the two
 * templates that raise toasts (the same rule the generated module embeds).
 * @param {object[]} recipes Catalog entries.
 * @returns {Map<string, string[]>} Recipe id to sorted event names.
 */
export function buildRecipeEvents(recipes) {
  return new Map(recipes.map(recipe => [recipe.id, metricEvents(recipe)]))
}

/**
 * Every allowlist `assertMetricsExport` takes, built from one catalog so the CLI and the
 * tests validate with identical sets.
 * @param {object[]} recipes Catalog entries.
 * @param {{eventNames?: Iterable<string>}} [options] The catalog's frozen event list, when it should be used verbatim.
 * @returns {{recipeIds: string[], eventNames: string[], optionKeys: Set<string>, optionTypes: Map<string, 'boolean'|'number'>, recipeEvents: Map<string, string[]>}}
 */
export function exportSets(recipes, { eventNames } = {}) {
  const recipeEvents = buildRecipeEvents(recipes)
  return {
    recipeIds: recipes.map(recipe => recipe.id),
    eventNames: eventNames ? [...eventNames] : [...new Set([...recipeEvents.values()].flat())].sort(),
    optionKeys: buildOptionKeys(recipes),
    optionTypes: buildOptionTypes(recipes),
    recipeEvents,
  }
}
