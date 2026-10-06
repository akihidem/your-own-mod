import type { Register } from 'claude-code'

type Options = {
  focus_timer: boolean
  focus_timer_interval_minutes: number
  lead_with_answer: boolean
  lead_with_answer_max_chars: number
  lead_with_answer_max_lines: number
  offer_options: boolean
  offer_options_max: number
  offer_options_min: number
  one_next_step: boolean
  plain_language: boolean
  publish_guard: boolean
  publish_guard_allow_minutes: number
  publish_guard_patterns: readonly string[]
  respect_stop_signals: boolean
  respect_stop_signals_phrases: readonly string[]
  running_indicator: boolean
  running_indicator_long_turn_seconds: number
  session_resume_brief: boolean
}

type Timer = { cancel: () => void }
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
}

const PLUGIN = "kokoro-mods-golden"
const PROFILE_SHA256 = "3e636f21cd041f176e33f089cfd55d02c9b674946fc451960379731ed80bdafa"
const STORE_KEYS = {
  "metrics": "kokoro-mods:metrics",
  "publishAllowedUntil": "kokoro-mods:publish-allowed-until",
  "lastTurnPrefix": "kokoro-mods:last:"
} as const
const EVENTS: Record<string, readonly string[]> = {
  "focus-timer": [
    "suppressed",
    "ticks"
  ],
  "lead-with-answer": [
    "long_answers"
  ],
  "offer-options": [],
  "one-next-step": [],
  "plain-language": [],
  "publish-guard": [
    "allowed",
    "denied"
  ],
  "respect-stop-signals": [
    "detected"
  ],
  "running-indicator": [
    "long_turns",
    "suppressed"
  ],
  "session-resume-brief": [
    "resumed"
  ]
}
const OPTION_KEYS = [
  "focus_timer",
  "focus_timer_interval_minutes",
  "lead_with_answer",
  "lead_with_answer_max_chars",
  "lead_with_answer_max_lines",
  "offer_options",
  "offer_options_max",
  "offer_options_min",
  "one_next_step",
  "plain_language",
  "publish_guard",
  "publish_guard_allow_minutes",
  "respect_stop_signals",
  "running_indicator",
  "running_indicator_long_turn_seconds",
  "session_resume_brief"
] as const
const BOOLEAN_DEFAULTS: Record<string, boolean> = {
  "focus_timer": false,
  "lead_with_answer": true,
  "offer_options": false,
  "one_next_step": true,
  "plain_language": false,
  "publish_guard": true,
  "respect_stop_signals": false,
  "running_indicator": false,
  "session_resume_brief": false
}
const NUMBER_DEFAULTS: Record<string, number> = {
  "focus_timer_interval_minutes": 50,
  "lead_with_answer_max_lines": 12,
  "lead_with_answer_max_chars": 0,
  "offer_options_min": 2,
  "offer_options_max": 4,
  "publish_guard_allow_minutes": 30,
  "running_indicator_long_turn_seconds": 120
}
const NUMBER_BOUNDS: Record<string, readonly [number | null, number | null]> = {
  "focus_timer_interval_minutes": [
    5,
    180
  ],
  "lead_with_answer_max_lines": [
    3,
    200
  ],
  "lead_with_answer_max_chars": [
    0,
    20000
  ],
  "offer_options_min": [
    2,
    4
  ],
  "offer_options_max": [
    2,
    6
  ],
  "publish_guard_allow_minutes": [
    1,
    720
  ],
  "running_indicator_long_turn_seconds": [
    10,
    3600
  ]
}
const DESCRIPTION = "kokoro-mods: status | export <absolute path> | export --print | allow-publish [minutes] | focus <minutes> | reset"
const USAGE = "Usage: /kokoro-mods status | export <absolute path> | export --print | allow-publish [minutes] | focus <minutes> | reset"

let chain = Promise.resolve()
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
}

let lastToastAt: number | undefined

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
}

let timer: Timer | undefined
let startedAt = 0
let n = 0
let fired = false

async function startRunning($: Host, seconds: number): Promise<void> {
  timer?.cancel()
  startedAt = await $.clock.now()
  n = 0
  fired = false
  timer = $.clock.after(seconds * 1000, () => {
    void toast($, "running-indicator", 'Still running. The current turn is taking a while.')
    fired = true
  })
}

let focusTimer: Timer | undefined
let completedSinceTick = false

function startFocus($: Host, minutes: number, o: Options): void {
  focusTimer?.cancel()
  focusTimer = undefined
  completedSinceTick = false
  if (!interactive || !o.focus_timer) return
  const tick = () => {
    try {
      if (!interactive || !o.focus_timer || !completedSinceTick) return
      completedSinceTick = false
      void bump($, "focus-timer", 'ticks')
      void toast($, "focus-timer", 'Time for a break. Choose whether to pause.')
    } catch {}
  }
  focusTimer = $.clock.every(minutes * 60_000, tick)
}

function resetState(): void {
  chain = Promise.resolve()
  interactive = false
  cwd = ''
  lastToastAt = undefined
  timer?.cancel()
  timer = undefined
  startedAt = 0
  n = 0
  fired = false
  focusTimer?.cancel()
  focusTimer = undefined
  completedSinceTick = false
}

/** Register the selected accommodations and their count-only commands. */
export const register: Register = (on, options) => {
  resetState()
  const o = normalizeOptions(options)

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const rules: string[] = []
    if (o.lead_with_answer) rules.push("Lead with the answer. Keep explanations within " + String(o.lead_with_answer_max_lines) + " lines" + (o.lead_with_answer_max_chars === 0 ? "" : " and within " + String(o.lead_with_answer_max_chars) + " characters") + ", unless the user asks for more detail or for complete code.")
    if (o.offer_options) rules.push("Offer " + String(o.offer_options_min) + " to " + String(o.offer_options_max) + " distinct options with concise trade-offs. Compare them before recommending a choice.")
    if (o.one_next_step) rules.push("Break large tasks into small, concrete actions. End with exactly one next action the user can take, unless the user signals a stop or sends a short state fragment.")
    if (o.plain_language) rules.push("Use plain language and explain necessary technical terms when they first appear.")
    if (!rules.length) return r
    const text = "Working preferences from the user's own manual (kokoro-mods). Do not use these rules to infer anything about the user's health.\n" + rules.map(rule => '- ' + rule).join('\n')
    return { sections: [...r.sections, { id: "kokoro-mods-golden:profile-rules", text, scope: 'session' as const }] }
  })

  on('prompt.submit', async ($, e, next) => {
    const t = e.text.trim()
    if (o.respect_stop_signals && t.length <= 40 && o.respect_stop_signals_phrases.some(phrase => matchesPhrase(t, phrase))) {
      await bump($, "respect-stop-signals", 'detected')
      return next({ ...e, context: [...(e.context ?? []), "Acknowledge the stop signal and end the exchange without advice, follow-up questions, or another task."] })
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash' || !o.publish_guard) return next(e)
    const patterns = o.publish_guard_patterns
    // Every pattern must compile before any is tested: a pattern that fails to compile
    // would otherwise silently stop guarding the commands it names, and an empty list is
    // a misconfiguration (the toggle is the way to switch the guard off).
    let compiled
    if (Array.isArray(patterns) && patterns.length > 0 && [...patterns].every(src => typeof src === 'string')) {
      try { compiled = [...patterns].map(src => new RegExp(src, 'u')) } catch { compiled = undefined }
    }
    if (!compiled) {
      await bump($, "publish-guard", 'denied')
      return { deny: PLUGIN + ': publish guard configuration is invalid (patterns must be a non-empty list of regular expressions valid in Unicode mode); every Bash command is denied until the setting is fixed in /config.' }
    }
    const hit = compiled.some(pattern => pattern.test(e.command))
    if (!hit) return next(e)
    const until = await $.store.get(STORE_KEYS.publishAllowedUntil)
    const now = await $.clock.now()
    if (typeof until === 'number' && Number.isFinite(until) && until > now) {
      await bump($, "publish-guard", 'allowed')
      return next(e)
    }
    await bump($, "publish-guard", 'denied')
    return { deny: PLUGIN + ': this looks like a publishing action. Ask the user for yes/no first; after approval they can run /kokoro-mods allow-publish.' }
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    await bump($, "publish-guard", 'denied')
    return { deny: PLUGIN + ': guard failed; publishing denied.' }
  })

  on('turn.start', async ($, e, next) => {
    try {
      if (interactive && o.running_indicator && !e.agentId) {
        await startRunning($, o.running_indicator_long_turn_seconds)
      }
    } catch {}
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    try {
      if (interactive && o.running_indicator && !e.agentId) {
        n += 1
        const s = Math.max(0, Math.floor(((await $.clock.now()) - startedAt) / 1000))
        $.ui.status(`running ${s}s · ${n} tools · last: ${e.tool}`)
      }
    } catch {}
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('turn.complete', async ($, e, next) => {
    try {
      if (!('agentId' in e && e.agentId)) {
        try {
          timer?.cancel()
          timer = undefined
          if (interactive && o.running_indicator) $.ui.status(undefined)
          if (o.running_indicator && fired) {
            fired = false
            await bump($, "running-indicator", 'long_turns')
          }
        } catch {}
        try {
          if (o.lead_with_answer && e.answer.split(/\r?\n/).length > o.lead_with_answer_max_lines) {
            await bump($, "lead-with-answer", 'long_answers')
          }
        } catch {}
        try {
          if (o.session_resume_brief) {
            const key = STORE_KEYS.lastTurnPrefix + (cwd || await $.session.cwd())
            const previous = record(await $.store.get(key))
            const turns = typeof previous.turns === 'number' && Number.isSafeInteger(previous.turns) && previous.turns >= 0
              ? previous.turns : 0
            await $.store.set(key, { at: await $.clock.now(), turns: Math.min(Number.MAX_SAFE_INTEGER, turns + 1) })
          }
        } catch {}
        if (o.focus_timer) completedSinceTick = true
      }
    } catch {}
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    try {
      interactive = e.isInteractive
      cwd = e.cwd
      try { await $.command.register({ name: "kokoro-mods", description: DESCRIPTION }) } catch {}
      try {
        if (interactive && o.session_resume_brief) {
          const previous = record(await $.store.get(STORE_KEYS.lastTurnPrefix + cwd))
          if (typeof previous.at === 'number' && Number.isFinite(previous.at) && previous.at >= 0 &&
              typeof previous.turns === 'number' && Number.isSafeInteger(previous.turns) && previous.turns >= 0) {
            const minutes = Math.max(0, Math.floor(((await $.clock.now()) - previous.at) / 60_000))
            const n = minutes >= 1440 ? Math.floor(minutes / 1440) : minutes >= 60 ? Math.floor(minutes / 60) : minutes
            const unit = minutes >= 1440 ? 'days' : minutes >= 60 ? 'hours' : 'minutes'
            $.ui.log(`${PLUGIN}: last time here: ${n} ${unit} ago, ${previous.turns} turns`)
            await bump($, "session-resume-brief", 'resumed')
          }
        }
      } catch {}
      startFocus($, o.focus_timer_interval_minutes, o)
    } catch {}
    return next(e)
  })

  on('command.run', { command: "kokoro-mods" }, async ($, e, next) => {
    try {
      const args = e.args.trim()
      const split = args.search(/\s/)
      const command = split < 0 ? args : args.slice(0, split)
      const arg = split < 0 ? '' : args.slice(split).trim()
      const changesState = (command === 'export' && arg !== '--print') ||
        command === 'allow-publish' || command === 'focus' || command === 'reset'
      if (changesState && (!e.origin || e.origin.kind !== 'composer')) {
        return { text: 'kokoro-mods: this subcommand must be typed by the user.' }
      }
      if ((command === '' || command === 'status') && arg === '') {
        await chain
        return { text: JSON.stringify({ plugin: PLUGIN, options: optionSnapshot(o), metrics: await readMetrics($) }, null, 2) }
      }
      if (command === 'export') {
        if (arg !== '--print' && !absolutePath(arg)) return { text: USAGE }
        return await writeExport($, arg, o)
      }
      if (command === 'allow-publish') {
        const minutes = arg === '' ? o.publish_guard_allow_minutes : Number(arg)
        if ((arg !== '' && !/^\d+$/.test(arg)) || !Number.isInteger(minutes) || minutes < 1 || minutes > 720) return { text: USAGE }
        await $.store.set(STORE_KEYS.publishAllowedUntil, (await $.clock.now()) + minutes * 60_000)
        return { text: PLUGIN + ': publishing allowed for ' + minutes + ' minutes.' }
      }
      if (command === 'focus') {
        const minutes = Number(arg)
        if (!/^\d+$/.test(arg) || !Number.isInteger(minutes) || minutes < 5 || minutes > 180) return { text: USAGE }
        if (!interactive || !o.focus_timer) return { text: PLUGIN + ': focus-timer needs an enabled interactive session.' }
        startFocus($, minutes, o)
        return { text: PLUGIN + ': focus timer set to ' + minutes + ' minutes.' }
      }
      if (command === 'reset' && arg === '') {
        await resetMetrics($)
        return { text: PLUGIN + ': counts reset.' }
      }
      return { text: USAGE }
    } catch {
      return { text: PLUGIN + ': command failed.' }
    }
  })
}
