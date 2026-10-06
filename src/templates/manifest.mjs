import { isDeepStrictEqual } from 'node:util'
import { TOOL_NAME } from '../constants.mjs'

/** Return the shared manifest identifier for a recipe toggle or parameter. */
export function configKey(recipeId, param = null) {
  const key = recipeId.replaceAll('-', '_')
  return param === null ? key : `${key}_${param}`
}

/** Include cooldown suppression in the two recipes that can raise toasts. */
export function metricEvents(recipe) {
  const events = new Set(recipe.metrics)
  if (['running-indicator', 'focus-timer'].includes(recipe.template)) events.add('suppressed')
  return [...events].sort()
}

/** Build userConfig from an evidence-free bundle, using only declared fields. */
export function buildUserConfig({ bundle, recipes, lang = 'en' }) {
  if (bundle.proposals.some(proposal => Object.hasOwn(proposal, 'evidence'))) {
    throw new TypeError('Plugin templates require an evidence-free bundle')
  }
  const fields = Object.create(null)
  const localized = text => text[lang] ?? text.en
  const add = (key, field) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || Object.hasOwn(fields, key)) {
      throw new TypeError('Invalid or duplicate userConfig key')
    }
    fields[key] = field
  }
  for (const proposal of bundle.proposals) {
    const recipe = recipes[proposal.recipeId]
    add(configKey(proposal.recipeId), {
      type: 'boolean',
      title: localized(recipe.title),
      description: localized(recipe.summary),
      default: proposal.enabledByDefault,
    })
    for (const name of Object.keys(recipe.params).sort()) {
      const param = recipe.params[name]
      const value = proposal.params[name]
      const multiple = param.multiple === true
      if (!['boolean', 'number', 'string'].includes(param.type) ||
          (multiple && param.type !== 'string')) {
        throw new TypeError('Invalid recipe parameter type')
      }
      const hasOptions = param.options !== undefined
      if (param.type === 'string' && !hasOptions && !isDeepStrictEqual(value, param.default)) {
        throw new Error(`E_PARAM_FREE_TEXT: ${proposal.recipeId}.${name}`)
      }
      const valid = multiple
        ? Array.isArray(value) && [...value].every(item => typeof item === 'string')
        : typeof value === param.type && (param.type !== 'number' || Number.isFinite(value))
      if (!valid || (param.type === 'number' &&
          ((param.min !== undefined && value < param.min) ||
           (param.max !== undefined && value > param.max))) ||
          (param.type === 'string' && hasOptions &&
           (!Array.isArray(param.options) || ![...param.options].every(item => typeof item === 'string') ||
            (multiple ? value.some(item => !param.options.includes(item)) : !param.options.includes(value))))) {
        throw new TypeError('Invalid recipe parameter default')
      }
      const field = {
        type: param.type,
        title: localized(param.title),
        description: localized(param.description),
        default: multiple ? [...value] : value,
      }
      if (param.type === 'number') {
        if (typeof param.min === 'number') field.min = param.min
        if (typeof param.max === 'number') field.max = param.max
      }
      if (param.type === 'string' && !multiple && param.options) field.options = [...param.options]
      if (multiple) field.multiple = true
      add(configKey(proposal.recipeId, name), field)
    }
  }
  return fields
}

/** Render the two strict manifests; proposal evidence is rejected at this boundary. */
export function renderManifest({ bundle, recipes, lang = 'en' }) {
  const userConfig = buildUserConfig({ bundle, recipes, lang })
  const name = bundle.pluginName
  const description = `Mods proposed by ${TOOL_NAME} (profile ${bundle.profile.sha256.slice(0, 8)})`
  const manifest = {
    name,
    version: bundle.tool.version,
    description,
    author: { name: TOOL_NAME },
    license: 'MIT',
    keywords: [TOOL_NAME, 'accessibility', 'claude-code-mod'],
    userConfig,
  }
  const marketplace = {
    name,
    description,
    owner: { name: TOOL_NAME },
    plugins: [{ name, source: './' }],
  }
  return new Map([
    ['plugin/.claude-plugin/plugin.json', JSON.stringify(manifest, null, 2) + '\n'],
    ['plugin/.claude-plugin/marketplace.json', JSON.stringify(marketplace, null, 2) + '\n'],
  ])
}
