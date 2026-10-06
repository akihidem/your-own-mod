import { test, expect, mock } from 'claude-code/testing'
import { register } from './register.ts'

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const
const INTRO = { id: 'intro', text: 'base', scope: 'shared' } as const
const DEFAULTS = {
  "focus_timer": false,
  "focus_timer_interval_minutes": 50,
  "lead_with_answer": true,
  "lead_with_answer_max_chars": 0,
  "lead_with_answer_max_lines": 12,
  "offer_options": false,
  "offer_options_max": 4,
  "offer_options_min": 2,
  "one_next_step": true,
  "plain_language": false,
  "publish_guard": true,
  "publish_guard_allow_minutes": 30,
  "publish_guard_patterns": [
    "\\bgit\\s+(-C\\s+\\S+\\s+)?push\\b",
    "\\bgh\\s+(pr|issue)\\s+create\\b",
    "\\bgh\\s+repo\\s+(create|edit|delete)\\b",
    "\\bgh\\s+release\\s+create\\b",
    "\\bnpm\\s+publish\\b"
  ],
  "respect_stop_signals": false,
  "respect_stop_signals_phrases": [
    "一旦やめる",
    "あとで",
    "終わり",
    "おわり",
    "一旦ここまで",
    "stop for now",
    "that's enough",
    "let's stop",
    "wrap up"
  ],
  "running_indicator": false,
  "running_indicator_long_turn_seconds": 120,
  "session_resume_brief": false
}
const ALLOWED_EVENTS: Record<string, readonly string[]> = {
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
const COUNTS: Record<string, Record<string, number>> = {
  "focus-timer": {
    "suppressed": 1,
    "ticks": 1
  },
  "lead-with-answer": {
    "long_answers": 1
  },
  "publish-guard": {
    "allowed": 1,
    "denied": 1
  },
  "respect-stop-signals": {
    "detected": 1
  },
  "running-indicator": {
    "long_turns": 1,
    "suppressed": 1
  },
  "session-resume-brief": {
    "resumed": 1
  }
}
const EXPORTED_OPTIONS = {
  "focus_timer": false,
  "focus_timer_interval_minutes": 50,
  "lead_with_answer": true,
  "lead_with_answer_max_chars": 0,
  "lead_with_answer_max_lines": 12,
  "offer_options": false,
  "offer_options_max": 4,
  "offer_options_min": 2,
  "one_next_step": true,
  "plain_language": false,
  "publish_guard": true,
  "publish_guard_allow_minutes": 30,
  "respect_stop_signals": false,
  "running_indicator": false,
  "running_indicator_long_turn_seconds": 120,
  "session_resume_brief": false
}

test('module loads with manifest defaults', { options: DEFAULTS }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [INTRO] }))
  const result = await $.prompt.compose(COMPOSE)
  expect(result.sections[0]).toEqual(INTRO)
  expect(result.sections).toHaveLength(2)
})

for (const enabled of [true, false]) {
  test('compose preserves bottom sections, rules ' + (enabled ? 'on' : 'off'), { options: { ...DEFAULTS, lead_with_answer: enabled, offer_options: enabled, one_next_step: enabled, plain_language: enabled } }, async ($, on) => {
    on('prompt.compose', () => ({ sections: [INTRO] }))
    const result = await $.prompt.compose(COMPOSE)
    expect(result.sections[0]).toEqual(INTRO)
    if (enabled) {
      expect(result.sections).toHaveLength(2)
      const last = result.sections[result.sections.length - 1]
      expect(last.id).toBe("kokoro-mods-golden:profile-rules")
      expect(last.scope).toBe('session')
      const lines = last.text.split('\n')
      expect(lines[0]).toBe("Working preferences from the user's own manual (kokoro-mods). Do not use these rules to infer anything about the user's health.")
      // One rule line per enabled recipe, with every placeholder filled.
      expect(lines).toHaveLength(5)
      expect(last.text).not.toMatch(/\{[a-z_]+\}/)
    } else {
      expect(result.sections).toEqual([INTRO])
    }
  })
}

test('publish guard denies without a grant and lets ls through', { options: { ...DEFAULTS, publish_guard: true } }, async ($, on) => {
    mock.store(on, {})
    mock.clock(on)
    const reached: string[] = []
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      reached.push(e.tool === 'Bash' ? e.command : '?')
      return { result: 'ok' }
    })
    const result = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    expect(result.deny).toMatch(/allow-publish/)
    expect(reached).toHaveLength(0)
    const ok = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(ok.deny).toBeUndefined()
    expect(reached).toEqual(['ls'])
  })

test('publish guard lets git push through with a valid grant', { options: { ...DEFAULTS, publish_guard: true } }, async ($, on) => {
    mock.store(on, { "kokoro-mods:publish-allowed-until": 60_000 })
    mock.clock(on)
    const reached: string[] = []
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      reached.push(e.tool === 'Bash' ? e.command : '?')
      return { result: 'ok' }
    })
    const result = await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(result.deny).toBeUndefined()
    expect(reached).toEqual(['git push'])
  })

test('publish guard denies with an expired grant', { options: { ...DEFAULTS, publish_guard: true } }, async ($, on) => {
    mock.store(on, { "kokoro-mods:publish-allowed-until": -1 })
    mock.clock(on)
    const reached: string[] = []
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      reached.push(e.tool === 'Bash' ? e.command : '?')
      return { result: 'ok' }
    })
    const expired = await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(expired.deny).toMatch(/allow-publish/)
    expect(reached).toHaveLength(0)
  })

test('publish guard denies when the store read throws', { options: { ...DEFAULTS, publish_guard: true } }, async ($, on) => {
    on('store.get', () => { throw new Error('Synthetic store read failure') })
    mock.clock(on)
    const reached: string[] = []
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      reached.push(e.tool === 'Bash' ? e.command : '?')
      return { result: 'ok' }
    })
    const failed = await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(failed.deny).toBe("kokoro-mods-golden: guard failed; publishing denied.")
    expect(reached).toHaveLength(0)
  })

test('submit detectors attach at most one note, with stop precedence', { options: { ...DEFAULTS, ...{
  "respect_stop_signals": true,
  "respect_stop_signals_phrases": [
    "",
    "   ",
    "疲れた",
    "一旦やめる",
    "あとで",
    "終わり",
    "stop for now",
    "that's enough",
    "wrap up"
  ]
} } }, async ($, on) => {
  mock.store(on, {})
  mock.clock(on)
  const seen: { text: string; context: readonly string[] | undefined }[] = []
  on('prompt.submit', ($, e) => { seen.push({ text: e.text, context: e.context }); return { text: e.text, context: e.context } })
  let submitted = 0
  const submit = async (text: string, context?: readonly string[]) => {
    expect(seen.length).toBe(submitted)
    await $.prompt.submit({ text })
    submitted += 1
    expect(seen.length).toBe(submitted)
    expect(seen[submitted - 1].text).toBe(text)
    expect(seen[submitted - 1].context).toEqual(context)
  }
  await submit('はい')
  await submit('An ordinary task with a fragment in the middle: 眠い. Please explain this function. '.repeat(20))
  for (const text of ['疲れた', '疲れた😢', '一旦やめるね', 'あとで', 'あとで。', '終わり', '終わりー', 'wrap up', 'Wrap up.', 'stop for now.', 'Stop for now.', 'That’s enough', 'stop for now' + '!'.repeat(28)]) {
    await submit(text, ["Acknowledge the stop signal and end the exchange without advice, follow-up questions, or another task."])
  }
  for (const text of ['疲れたけどやる', 'あとでテストして', 'あとでやって', 'あとでおしえて', 'あとでメモして', '終わりました', '終わりましたか', '終わりにしないで', '一旦やめるかどうか', 'あとで見返せるように要約して', 'wrap up this function into a module', 'stop for now' + '!'.repeat(29)]) {
    await submit(text)
  }
})

test('export drops a malformed metrics record', { options: DEFAULTS }, async ($, on) => {
  mock.store(on, {
    "kokoro-mods:metrics": { v: 1, since: 0, counts: { "focus-timer": { "suppressed": '1', free_text: 1 } } },
  })
  mock.clock(on)
  on('command.run', { command: "kokoro-mods" }, () => ({ text: 'unexpected bottom' }))
  const rejected = await $.command.run({ command: "kokoro-mods", args: 'export --print' })
  expect(JSON.parse(rejected.text).metrics.counts).toEqual({})
})

test('export has only the closed schema and allowed values', { options: DEFAULTS }, async ($, on) => {
  const storedCounts = Object.fromEntries(Object.entries(COUNTS)
    .map(([id, values]) => [id, { ...values, free_text: 1 }]))
  mock.store(on, {
    "kokoro-mods:metrics": { v: 1, since: 0, counts: { ...storedCounts, foreign_recipe: { free_text: 'discard' } }, extra: 'discard' },
  })
  mock.clock(on)
  on('command.run', { command: "kokoro-mods" }, () => ({ text: 'unexpected bottom' }))
  // The kit dispatches a command without a composer origin, so a state-changing
  // subcommand is refused here; the counts exported next prove nothing was reset.
  const refused = await $.command.run({ command: "kokoro-mods", args: 'reset' })
  expect(refused.text).toBe("kokoro-mods: this subcommand must be typed by the user.")
  const exported = await $.command.run({ command: "kokoro-mods", args: 'export --print' })
  const obj = JSON.parse(exported.text)
  expect(Object.keys(obj).sort()).toEqual(['exportedAt', 'metrics', 'options', 'plugin', 'profileSha256', 'v'])
  expect(obj.v).toBe(1)
  expect(obj.plugin).toBe("kokoro-mods-golden")
  expect(obj.profileSha256).toBe("3e636f21cd041f176e33f089cfd55d02c9b674946fc451960379731ed80bdafa")
  expect(obj.profileSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(obj.exportedAt).toBe(new Date(0).toISOString())
  expect(obj.options).toEqual(EXPORTED_OPTIONS)
  for (const value of Object.values(obj.options)) {
    expect(typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))).toBe(true)
  }
  expect(Object.keys(obj.metrics).sort()).toEqual(['counts', 'since', 'v'])
  expect(obj.metrics.v).toBe(1)
  expect(obj.metrics.since).toBe(0)
  expect(obj.metrics.counts).toEqual(COUNTS)
  for (const [recipe, values] of Object.entries(obj.metrics.counts)) {
    expect(Object.keys(ALLOWED_EVENTS).includes(recipe)).toBe(true)
    expect(values !== null && typeof values === 'object' && !Array.isArray(values)).toBe(true)
    for (const [event, count] of Object.entries(values as Record<string, unknown>)) {
      expect((ALLOWED_EVENTS[recipe] ?? []).includes(event)).toBe(true)
      expect(typeof count === 'number' && Number.isInteger(count) && count >= 0).toBe(true)
    }
  }
})
