import { STORE_KEYS, TOOL_NAME } from '../constants.mjs'
import { buildUserConfig, configKey, metricEvents } from './manifest.mjs'

const json = value => JSON.stringify(value, null, 2)
const option = (proposal, param = null) => `o.${configKey(proposal.recipeId, param)}`

function ruleExpression(recipe, proposal) {
  const text = recipe.rule.en
  const parts = []
  let end = 0
  for (const match of text.matchAll(/\{(min|max|language|max_lines|max_chars_clause)\}/g)) {
    const name = match[1] === 'max_chars_clause' ? 'max_chars' : match[1]
    if (!Object.hasOwn(recipe.params, name)) throw new TypeError('Undeclared rule parameter')
    const value = `String(${option(proposal, name)})`
    let expression = value
    if (match[1] === 'language') {
      expression = `(${value} === "ja" ? "Japanese" : ${value} === "en" ? "English" : ${value})`
    } else if (match[1] === 'max_chars_clause') {
      expression = `(${option(proposal, name)} === 0 ? "" : " and within " + ${value} + " characters")`
    }
    parts.push(JSON.stringify(text.slice(end, match.index)), expression)
    end = match.index + match[0].length
  }
  parts.push(JSON.stringify(text.slice(end)))
  return parts.join(' + ')
}

const SUPPORT = String.raw`type Timer = { cancel: () => void }
type Host = {
  store: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> }
  clock: {
    now: () => Promise<number>
    every: (ms: number, fn: () => void) => Timer
    after: (ms: number, fn: () => void) => Timer
  }
  fs: { write: (path: string, text: string) => Promise<unknown> }
  ui: { toast: (text: string) => void }
}
type Metrics = { v: 1; since: number; counts: Record<string, Record<string, number>> }

const PHRASE_SUFFIX = Object.freeze(/^(?:ね|よ|な|わ|です|ます|だ|よね|かも|[ーぁぃぅぇぉっ])*$/u)

function matchesPhrase(t: string, phrase: string): boolean {
  t = t.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").trim()
  phrase = phrase.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").trim()
  if (!phrase || !t.startsWith(phrase)) return false
  const tail = t.slice(phrase.length).replace(/[\s\p{P}\p{S}\p{Extended_Pictographic}]/gu, '')
  return tail.length <= 6 && PHRASE_SUFFIX.test(tail)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function normalizeOptions(options: unknown): Options {
  const values = { ...record(options) }
  // A missing or malformed value falls back to the manifest default, and a number is
  // clamped to the recipe's bounds, so a hand-edited setting can neither disarm a guard
  // by omitting its toggle nor start a zero-interval timer.
  for (const [key, fallback] of Object.entries(BOOLEAN_DEFAULTS)) {
    if (typeof values[key] !== 'boolean') values[key] = fallback
  }
  for (const [key, fallback] of Object.entries(NUMBER_DEFAULTS)) {
    const value = values[key]
    const bounds = NUMBER_BOUNDS[key]
    values[key] = typeof value !== 'number' || !Number.isFinite(value) ? fallback
      : bounds ? Math.min(bounds[1] ?? Infinity, Math.max(bounds[0] ?? -Infinity, value)) : value
  }
  return values as Options
}

function absolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path)
}`

const METRICS = String.raw`let chain = Promise.resolve()
let interactive = false
let cwd = ''

async function readMetrics($: Host): Promise<Metrics> {
  const now = await $.clock.now()
  const stored = record(await $.store.get(STORE_KEYS.metrics))
  const valid = stored.v === 1
  const since = valid && typeof stored.since === 'number' && Number.isFinite(stored.since) && stored.since >= 0
    ? stored.since : now
  const source = valid ? record(stored.counts) : {}
  const counts: Metrics['counts'] = {}
  // Reconstruct the closed schema: old or foreign store fields must not escape.
  for (const [recipe, events] of Object.entries(EVENTS)) {
    const previous = record(source[recipe])
    const row: Record<string, number> = {}
    for (const event of events) {
      const count = previous[event]
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) row[event] = count
    }
    if (Object.keys(row).length) counts[recipe] = row
  }
  return { v: 1, since, counts }
}

function bump($: Host, recipe: string, event: string): Promise<void> {
  chain = chain.then(async () => {
    if (!EVENTS[recipe]?.includes(event)) return
    const metrics = await readMetrics($)
    const row = metrics.counts[recipe] ?? {}
    row[event] = Math.min(Number.MAX_SAFE_INTEGER, (row[event] ?? 0) + 1)
    metrics.counts[recipe] = row
    await $.store.set(STORE_KEYS.metrics, metrics)
  }).catch(() => {})
  return chain
}

function optionSnapshot(o: Options): Record<string, boolean | number> {
  const result: Record<string, boolean | number> = {}
  for (const key of OPTION_KEYS) {
    const value = o[key]
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[key] = value
  }
  return result
}

function resetMetrics($: Host): Promise<void> {
  const reset = chain.then(async () => {
    await $.store.set(STORE_KEYS.metrics, { v: 1, since: await $.clock.now(), counts: {} })
  })
  chain = reset.catch(() => {})
  return reset
}

async function writeExport($: Host, path: string, o: Options): Promise<{ text: string }> {
  await chain
  const obj = {
    v: 1,
    plugin: PLUGIN,
    profileSha256: PROFILE_SHA256,
    exportedAt: new Date(await $.clock.now()).toISOString(),
    options: optionSnapshot(o),
    metrics: await readMetrics($),
  }
  const text = JSON.stringify(obj, null, 2)
  if (path === '--print') return { text }
  await $.fs.write(path, text)
  return { text: path }
}`

const TOAST = String.raw`let lastToastAt: number | undefined

async function toast($: Host, recipe: string, text: string): Promise<void> {
  try {
    if (!interactive) return
    const now = await $.clock.now()
    if (!interactive) return
    if (lastToastAt !== undefined && now - lastToastAt < 60_000) {
      await bump($, recipe, 'suppressed')
      return
    }
    // Reserve the cooldown before drawing, so concurrent callbacks share it.
    lastToastAt = now
    $.ui.toast(text)
  } catch {}
}`

/** Render readable, dependency-free hooks from an evidence-free bundle. */
export function renderRegister({ bundle, recipes }) {
  const fields = buildUserConfig({ bundle, recipes })
  const proposals = bundle.proposals
  const find = template => proposals.find(p => recipes[p.recipeId].template === template)
  const compose = proposals.filter(p => recipes[p.recipeId].template === 'compose-rule')
  const submit = proposals.filter(p => recipes[p.recipeId].template === 'submit-detector')
    .sort((a, b) => Number(a.recipeId !== 'respect-stop-signals') - Number(b.recipeId !== 'respect-stop-signals'))
  const guard = find('publish-guard')
  const running = find('running-indicator')
  const resume = find('resume-brief')
  const focus = find('focus-timer')
  const lead = compose.find(p => p.recipeId === 'lead-with-answer')
  const events = Object.fromEntries(proposals.map(p => [p.recipeId, metricEvents(recipes[p.recipeId])]))
  // The runtime fallback is the manifest default, i.e. the proposal's value (a derived
  // interval of 25 minutes stays 25 when the host omits the setting), not the recipe's
  // own default (re-inspection, chunk C tests, L1).
  const numberDefaults = Object.fromEntries(proposals.flatMap(p =>
    Object.entries(recipes[p.recipeId].params).filter(([, param]) => param.type === 'number')
      .map(([name]) => [configKey(p.recipeId, name), p.params[name]])))
  // A one-sided bound is clamped on that side only (re-inspection, chunk C, L2).
  const numberBounds = Object.fromEntries(proposals.flatMap(p =>
    Object.entries(recipes[p.recipeId].params)
      .filter(([, param]) => param.type === 'number' && (typeof param.min === 'number' || typeof param.max === 'number'))
      .map(([name, param]) => [configKey(p.recipeId, name), [typeof param.min === 'number' ? param.min : null, typeof param.max === 'number' ? param.max : null]])))
  const booleanDefaults = Object.fromEntries(Object.entries(fields)
    .filter(([, field]) => field.type === 'boolean').map(([key, field]) => [key, field.default]))
  const optionKeys = Object.keys(fields).filter(key => ['number', 'boolean'].includes(fields[key].type)).sort()
  const description = `${TOOL_NAME}: status | export <absolute path> | export --print | allow-publish [minutes] | focus <minutes> | reset`
  const usage = `Usage: /${TOOL_NAME} status | export <absolute path> | export --print | allow-publish [minutes] | focus <minutes> | reset`
  const parts = [
    `import type { Register } from 'claude-code'

type Options = {
${Object.entries(fields).map(([key, field]) => `  ${key}: ${field.multiple ? 'readonly string[]' : field.type}`).join('\n')}
}`,
    SUPPORT,
    `const PLUGIN = ${json(bundle.pluginName)}
const PROFILE_SHA256 = ${json(bundle.profile.sha256)}
const STORE_KEYS = ${json(STORE_KEYS)} as const
const EVENTS: Record<string, readonly string[]> = ${json(events)}
const OPTION_KEYS = ${json(optionKeys)} as const
const BOOLEAN_DEFAULTS: Record<string, boolean> = ${json(booleanDefaults)}
const NUMBER_DEFAULTS: Record<string, number> = ${json(numberDefaults)}
const NUMBER_BOUNDS: Record<string, readonly [number | null, number | null]> = ${json(numberBounds)}
const DESCRIPTION = ${json(description)}
const USAGE = ${json(usage)}`,
    METRICS,
  ]
  if (running || focus) parts.push(TOAST)
  if (running) parts.push(`let timer: Timer | undefined
let startedAt = 0
let n = 0
let fired = false

async function startRunning($: Host, seconds: number): Promise<void> {
  timer?.cancel()
  startedAt = await $.clock.now()
  n = 0
  fired = false
  timer = $.clock.after(seconds * 1000, () => {
    void toast($, ${json(running.recipeId)}, 'Still running. The current turn is taking a while.')
    fired = true
  })
}`)
  if (focus) parts.push(`let focusTimer: Timer | undefined
let completedSinceTick = false

function startFocus($: Host, minutes: number, o: Options): void {
  focusTimer?.cancel()
  focusTimer = undefined
  completedSinceTick = false
  if (!interactive || !${option(focus)}) return
  const tick = () => {
    try {
      if (!interactive || !${option(focus)} || !completedSinceTick) return
      completedSinceTick = false
      void bump($, ${json(focus.recipeId)}, 'ticks')
      void toast($, ${json(focus.recipeId)}, 'Time for a break. Choose whether to pause.')
    } catch {}
  }
  focusTimer = $.clock.every(minutes * 60_000, tick)
}`)
  // Module-level state is reset on every registration: a reload or a test runner may
  // call `register` again in the same module instance, and a cooldown or a timer of the
  // previous registration must not carry over (final inspection, chunk C).
  const resets = ['chain = Promise.resolve()', "interactive = false", "cwd = ''"]
  if (running || focus) resets.push('lastToastAt = undefined')
  if (running) resets.push('timer?.cancel()', 'timer = undefined', 'startedAt = 0', 'n = 0', 'fired = false')
  if (focus) resets.push('focusTimer?.cancel()', 'focusTimer = undefined', 'completedSinceTick = false')
  parts.push(`function resetState(): void {
${resets.map(line => `  ${line}`).join('\n')}
}`)
  parts.push(`/** Register the selected accommodations and their count-only commands. */
export const register: Register = (on, options) => {
  resetState()
  const o = normalizeOptions(options)`)
  if (compose.length) {
    const rules = compose.map(p => `    if (${option(p)}) rules.push(${ruleExpression(recipes[p.recipeId], p)})`).join('\n')
    const heading = "Working preferences from the user's own manual (kokoro-mods). Do not use these rules to infer anything about the user's health.\n"
    parts.push(`  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const rules: string[] = []
${rules}
    if (!rules.length) return r
    const text = ${JSON.stringify(heading)} + rules.map(rule => '- ' + rule).join('\\n')
    return { sections: [...r.sections, { id: ${json(bundle.pluginName + ':profile-rules')}, text, scope: 'session' as const }] }
  })`)
  }
  if (submit.length) {
    const cases = submit.map(p => {
      const recipe = recipes[p.recipeId]
      const length = p.recipeId === 'respect-stop-signals'
        ? 't.length <= 40 && '
        : p.recipeId === 'receive-only-fragments' || Object.hasOwn(recipe.params, 'max_chars')
          ? `t.length <= ${option(p, 'max_chars')} && ` : ''
      return `    if (${option(p)} && ${length}${option(p, 'phrases')}.some(phrase => matchesPhrase(t, phrase))) {
      await bump($, ${json(p.recipeId)}, 'detected')
      return next({ ...e, context: [...(e.context ?? []), ${json(recipe.note.en)}] })
    }`
    }).join('\n')
    parts.push(`  on('prompt.submit', async ($, e, next) => {
    const t = e.text.trim()
${cases}
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))`)
  }
  if (guard) parts.push(`  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash' || !${option(guard)}) return next(e)
    const patterns = ${option(guard, 'patterns')}
    // Every pattern must compile before any is tested: a pattern that fails to compile
    // would otherwise silently stop guarding the commands it names, and an empty list is
    // a misconfiguration (the toggle is the way to switch the guard off).
    let compiled
    if (Array.isArray(patterns) && patterns.length > 0 && [...patterns].every(src => typeof src === 'string')) {
      try { compiled = [...patterns].map(src => new RegExp(src, 'u')) } catch { compiled = undefined }
    }
    if (!compiled) {
      await bump($, ${json(guard.recipeId)}, 'denied')
      return { deny: PLUGIN + ': publish guard configuration is invalid (patterns must be a non-empty list of regular expressions valid in Unicode mode); every Bash command is denied until the setting is fixed in /config.' }
    }
    const hit = compiled.some(pattern => pattern.test(e.command))
    if (!hit) return next(e)
    const until = await $.store.get(STORE_KEYS.publishAllowedUntil)
    const now = await $.clock.now()
    if (typeof until === 'number' && Number.isFinite(until) && until > now) {
      await bump($, ${json(guard.recipeId)}, 'allowed')
      return next(e)
    }
    await bump($, ${json(guard.recipeId)}, 'denied')
    return { deny: PLUGIN + ': this looks like a publishing action. Ask the user for yes/no first; after approval they can run /${TOOL_NAME} allow-publish.' }
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    await bump($, ${json(guard.recipeId)}, 'denied')
    return { deny: PLUGIN + ': guard failed; publishing denied.' }
  })`)
  if (running) {
    parts.push(`  on('turn.start', async ($, e, next) => {
    try {
      if (interactive && ${option(running)} && !e.agentId) {
        await startRunning($, ${option(running, 'long_turn_seconds')})
      }
    } catch {}
    return next(e)
  })`)
    parts.push(`  on('tool.call', async ($, e, next) => {
    try {
      if (interactive && ${option(running)} && !e.agentId) {
        n += 1
        const s = Math.max(0, Math.floor(((await $.clock.now()) - startedAt) / 1000))
        $.ui.status(\`running \${s}s · \${n} tools · last: \${e.tool}\`)
      }
    } catch {}
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))`)
  }
  const completed = []
  if (running) completed.push(`        try {
          timer?.cancel()
          timer = undefined
          if (interactive && ${option(running)}) $.ui.status(undefined)
          if (${option(running)} && fired) {
            fired = false
            await bump($, ${json(running.recipeId)}, 'long_turns')
          }
        } catch {}`)
  if (lead) completed.push(`        try {
          if (${option(lead)} && e.answer.split(/\\r?\\n/).length > ${option(lead, 'max_lines')}) {
            await bump($, ${json(lead.recipeId)}, 'long_answers')
          }
        } catch {}`)
  if (resume) completed.push(`        try {
          if (${option(resume)}) {
            const key = STORE_KEYS.lastTurnPrefix + (cwd || await $.session.cwd())
            const previous = record(await $.store.get(key))
            const turns = typeof previous.turns === 'number' && Number.isSafeInteger(previous.turns) && previous.turns >= 0
              ? previous.turns : 0
            await $.store.set(key, { at: await $.clock.now(), turns: Math.min(Number.MAX_SAFE_INTEGER, turns + 1) })
          }
        } catch {}`)
  if (focus) completed.push(`        if (${option(focus)}) completedSinceTick = true`)
  if (completed.length) parts.push(`  on('turn.complete', async ($, e, next) => {
    try {
      if (!('agentId' in e && e.agentId)) {
${completed.join('\n')}
      }
    } catch {}
    return next(e)
  })`)
  const session = []
  if (resume) session.push(`      try {
        if (interactive && ${option(resume)}) {
          const previous = record(await $.store.get(STORE_KEYS.lastTurnPrefix + cwd))
          if (typeof previous.at === 'number' && Number.isFinite(previous.at) && previous.at >= 0 &&
              typeof previous.turns === 'number' && Number.isSafeInteger(previous.turns) && previous.turns >= 0) {
            const minutes = Math.max(0, Math.floor(((await $.clock.now()) - previous.at) / 60_000))
            const n = minutes >= 1440 ? Math.floor(minutes / 1440) : minutes >= 60 ? Math.floor(minutes / 60) : minutes
            const unit = minutes >= 1440 ? 'days' : minutes >= 60 ? 'hours' : 'minutes'
            $.ui.log(\`\${PLUGIN}: last time here: \${n} \${unit} ago, \${previous.turns} turns\`)
            await bump($, ${json(resume.recipeId)}, 'resumed')
          }
        }
      } catch {}`)
  if (focus) session.push(`      startFocus($, ${option(focus, 'interval_minutes')}, o)`)
  parts.push(`  on('session.start', async ($, e, next) => {
    try {
      interactive = e.isInteractive
      cwd = e.cwd
      try { await $.command.register({ name: ${json(TOOL_NAME)}, description: DESCRIPTION }) } catch {}
${session.join('\n')}
    } catch {}
    return next(e)
  })`)
  const commands = []
  if (guard) commands.push(`      if (command === 'allow-publish') {
        const minutes = arg === '' ? ${option(guard, 'allow_minutes')} : Number(arg)
        if ((arg !== '' && !/^\\d+$/.test(arg)) || !Number.isInteger(minutes) || minutes < 1 || minutes > 720) return { text: USAGE }
        await $.store.set(STORE_KEYS.publishAllowedUntil, (await $.clock.now()) + minutes * 60_000)
        return { text: PLUGIN + ': publishing allowed for ' + minutes + ' minutes.' }
      }`)
  if (focus) {
    const param = recipes[focus.recipeId].params.interval_minutes
    commands.push(`      if (command === 'focus') {
        const minutes = Number(arg)
        if (!/^\\d+$/.test(arg) || !Number.isInteger(minutes) || minutes < ${param.min ?? 5} || minutes > ${param.max ?? 180}) return { text: USAGE }
        if (!interactive || !${option(focus)}) return { text: PLUGIN + ': focus-timer needs an enabled interactive session.' }
        startFocus($, minutes, o)
        return { text: PLUGIN + ': focus timer set to ' + minutes + ' minutes.' }
      }`)
  }
  parts.push(`  on('command.run', { command: ${json(TOOL_NAME)} }, async ($, e, next) => {
    try {
      const args = e.args.trim()
      const split = args.search(/\\s/)
      const command = split < 0 ? args : args.slice(0, split)
      const arg = split < 0 ? '' : args.slice(split).trim()
      const changesState = (command === 'export' && arg !== '--print') ||
        command === 'allow-publish' || command === 'focus' || command === 'reset'
      if (changesState && (!e.origin || e.origin.kind !== 'composer')) {
        return { text: '${TOOL_NAME}: this subcommand must be typed by the user.' }
      }
      if ((command === '' || command === 'status') && arg === '') {
        await chain
        return { text: JSON.stringify({ plugin: PLUGIN, options: optionSnapshot(o), metrics: await readMetrics($) }, null, 2) }
      }
      if (command === 'export') {
        if (arg !== '--print' && !absolutePath(arg)) return { text: USAGE }
        return await writeExport($, arg, o)
      }
${commands.join('\n')}
      if (command === 'reset' && arg === '') {
        await resetMetrics($)
        return { text: PLUGIN + ': counts reset.' }
      }
      return { text: USAGE }
    } catch {
      return { text: PLUGIN + ': command failed.' }
    }
  })
}`)
  return parts.join('\n\n') + '\n'
}
