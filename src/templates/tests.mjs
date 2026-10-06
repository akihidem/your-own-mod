import { STORE_KEYS, TOOL_NAME } from '../constants.mjs'
import { buildUserConfig, configKey, metricEvents } from './manifest.mjs'

const json = value => JSON.stringify(value, null, 2)

/** Render engine tests using only catalog text and an evidence-free bundle. */
export function renderTests({ bundle, recipes }) {
  const fields = buildUserConfig({ bundle, recipes })
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default]))
  const compose = bundle.proposals.filter(p => recipes[p.recipeId].template === 'compose-rule')
  const detectors = bundle.proposals.filter(p => recipes[p.recipeId].template === 'submit-detector')
  const guard = bundle.proposals.find(p => recipes[p.recipeId].template === 'publish-guard')
  const receive = detectors.find(p => p.recipeId === 'receive-only-fragments')
  const stop = detectors.find(p => p.recipeId === 'respect-stop-signals')
  const events = Object.fromEntries(bundle.proposals.map(p => [p.recipeId, metricEvents(recipes[p.recipeId])]))
  const counts = Object.fromEntries(Object.entries(events).filter(([, names]) => names.length)
    .map(([id, names]) => [id, Object.fromEntries(names.map(name => [name, 1]))]))
  const exportedOptions = Object.fromEntries(Object.entries(fields)
    .filter(([, field]) => ['number', 'boolean'].includes(field.type))
    .map(([key, field]) => [key, field.default]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  const exportChecks = `  const storedCounts = Object.fromEntries(Object.entries(COUNTS)
    .map(([id, values]) => [id, { ...values, free_text: 1 }]))
  mock.store(on, {
    ${json(STORE_KEYS.metrics)}: { v: 1, since: 0, counts: { ...storedCounts, foreign_recipe: { free_text: 'discard' } }, extra: 'discard' },
  })
  mock.clock(on)
  on('command.run', { command: ${json(TOOL_NAME)} }, () => ({ text: 'unexpected bottom' }))
  // The kit dispatches a command without a composer origin, so a state-changing
  // subcommand is refused here; the counts exported next prove nothing was reset.
  const refused = await $.command.run({ command: ${json(TOOL_NAME)}, args: 'reset' })
  expect(refused.text).toBe(${json(TOOL_NAME + ': this subcommand must be typed by the user.')})
  const exported = await $.command.run({ command: ${json(TOOL_NAME)}, args: 'export --print' })
  const obj = JSON.parse(exported.text)
  expect(Object.keys(obj).sort()).toEqual(['exportedAt', 'metrics', 'options', 'plugin', 'profileSha256', 'v'])
  expect(obj.v).toBe(1)
  expect(obj.plugin).toBe(${json(bundle.pluginName)})
  expect(obj.profileSha256).toBe(${json(bundle.profile.sha256)})
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
  }`
  // Every bundle runs exportChecks; small bundles share the mandatory load case.
  // Always a separate test: the kit refuses a bottom registered after the first `$`
  // call, so the export checks cannot follow the load test's compose dispatch
  // (integrator's correction after round 3; also the inspector's request T-2).
  const separateExport = true
  const parts = [
    `import { test, expect, mock } from 'claude-code/testing'
import { register } from './register.ts'

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const
const INTRO = { id: 'intro', text: 'base', scope: 'shared' } as const
const DEFAULTS = ${json(defaults)}
const ALLOWED_EVENTS: Record<string, readonly string[]> = ${json(events)}
const COUNTS: Record<string, Record<string, number>> = ${json(counts)}
const EXPORTED_OPTIONS = ${json(exportedOptions)}`,
    `test('module loads with manifest defaults', { options: DEFAULTS }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [INTRO] }))
  const result = await $.prompt.compose(COMPOSE)
  expect(result.sections[0]).toEqual(INTRO)
  expect(result.sections).toHaveLength(${compose.some(p => p.enabledByDefault) ? 2 : 1})
${separateExport ? '' : exportChecks + '\n'}})`,
  ]
  if (compose.length) {
    // Each activation has fixed options; two cases exercise on and off separately.
    const toggles = compose.map(p => `${configKey(p.recipeId)}: enabled`).join(', ')
    parts.push(`for (const enabled of [true, false]) {
  test('compose preserves bottom sections, rules ' + (enabled ? 'on' : 'off'), { options: { ...DEFAULTS, ${toggles} } }, async ($, on) => {
    on('prompt.compose', () => ({ sections: [INTRO] }))
    const result = await $.prompt.compose(COMPOSE)
    expect(result.sections[0]).toEqual(INTRO)
    if (enabled) {
      expect(result.sections).toHaveLength(2)
      const last = result.sections[result.sections.length - 1]
      expect(last.id).toBe(${json(bundle.pluginName + ':profile-rules')})
      expect(last.scope).toBe('session')
      const lines = last.text.split('\\n')
      expect(lines[0]).toBe("Working preferences from the user's own manual (kokoro-mods). Do not use these rules to infer anything about the user's health.")
      // One rule line per enabled recipe, with every placeholder filled.
      expect(lines).toHaveLength(${1 + compose.length})
      expect(last.text).not.toMatch(/\\{[a-z_]+\\}/)
    } else {
      expect(result.sections).toEqual([INTRO])
    }
  })
}`)
  }
  if (guard) {
    // Integrator's correction after round 3: the testing kit refuses two bottoms for
    // one event (mock.store already answers store.get) and offers no `$.store.set`,
    // so each grant state is its own test seeded through mock.store, and the
    // throwing-store case registers its own bottom and no mock.store.
    const guardOptions = `{ options: { ...DEFAULTS, ${configKey(guard.recipeId)}: true } }`
    const recorder = `    const reached: string[] = []
    on('tool.call', { tool: 'Bash' }, ($, e) => {
      reached.push(e.tool === 'Bash' ? e.command : '?')
      return { result: 'ok' }
    })`
    parts.push(`test('publish guard denies without a grant and lets ls through', ${guardOptions}, async ($, on) => {
    mock.store(on, {})
    mock.clock(on)
${recorder}
    const result = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    expect(result.deny).toMatch(/allow-publish/)
    expect(reached).toHaveLength(0)
    const ok = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(ok.deny).toBeUndefined()
    expect(reached).toEqual(['ls'])
  })`)
    parts.push(`test('publish guard lets git push through with a valid grant', ${guardOptions}, async ($, on) => {
    mock.store(on, { ${json(STORE_KEYS.publishAllowedUntil)}: 60_000 })
    mock.clock(on)
${recorder}
    const result = await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(result.deny).toBeUndefined()
    expect(reached).toEqual(['git push'])
  })`)
    parts.push(`test('publish guard denies with an expired grant', ${guardOptions}, async ($, on) => {
    mock.store(on, { ${json(STORE_KEYS.publishAllowedUntil)}: -1 })
    mock.clock(on)
${recorder}
    const expired = await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(expired.deny).toMatch(/allow-publish/)
    expect(reached).toHaveLength(0)
  })`)
    parts.push(`test('publish guard denies when the store read throws', ${guardOptions}, async ($, on) => {
    on('store.get', () => { throw new Error('Synthetic store read failure') })
    mock.clock(on)
${recorder}
    const failed = await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(failed.deny).toBe(${json(bundle.pluginName + ': guard failed; publishing denied.')})
    expect(reached).toHaveLength(0)
  })`)
  }
  if (detectors.length) {
    const overrides = Object.fromEntries(detectors.map(p => [configKey(p.recipeId), true]))
    const checks = []
    if (receive) {
      overrides[configKey(receive.recipeId, 'max_chars')] = 24
      overrides[configKey(receive.recipeId, 'phrases')] = ['', '   ', '眠い', '疲れた', 'tired']
      checks.push(`  for (const text of ['眠い', '眠い…', '眠い😴', '眠いねよなわです', '眠いーっ', 'tired!', 'TIRED', '眠い' + '!'.repeat(22)]) {
    await submit(text, [${json(recipes[receive.recipeId].note.en)}])
  }
  await submit('疲れた😢', [${json(recipes[(stop ?? receive).recipeId].note.en)}])
  for (const text of ['眠いねよなわですか', '眠いカタカナー', '眠い理由を説明して', 'tired please help', '眠い' + '!'.repeat(23)]) {
    await submit(text)
  }`)
    }
    // A negative case is listed only under the detector whose phrase it starts with, so
    // every negative proves a guard and not the absence of a trigger (final inspection,
    // chunk C): the receive-only negatives sit with the receive-only phrases, the stop
    // negatives with the stop phrases, and the shared block holds only text that starts
    // with no phrase at all.
    if (receive) {
      checks.push(`  for (const text of ['眠いｗ', '眠い（笑）', 'tired lol', '疲れたけどやる', '疲れたのでレビュー']) {
    await submit(text)
  }`)
    }
    checks.push(`  await submit('はい')
  await submit('An ordinary task with a fragment in the middle: 眠い. Please explain this function. '.repeat(20))`)
    if (stop) {
      overrides[configKey(stop.recipeId, 'phrases')] = ['', '   ', '疲れた', '一旦やめる', 'あとで', '終わり', 'stop for now', "that's enough", 'wrap up']
      // Every phrase whose negatives are listed below also has a positive, so a negative
      // proves the whole-utterance guard and not a phrase that never fires (re-inspection, chunk C, M2).
      checks.push(`  for (const text of ['疲れた', '疲れた😢', '一旦やめるね', 'あとで', 'あとで。', '終わり', '終わりー', 'wrap up', 'Wrap up.', 'stop for now.', 'Stop for now.', 'That’s enough', 'stop for now' + '!'.repeat(28)]) {
    await submit(text, [${json(recipes[stop.recipeId].note.en)}])
  }
  for (const text of ['疲れたけどやる', 'あとでテストして', 'あとでやって', 'あとでおしえて', 'あとでメモして', '終わりました', '終わりましたか', '終わりにしないで', '一旦やめるかどうか', 'あとで見返せるように要約して', 'wrap up this function into a module', 'stop for now' + '!'.repeat(29)]) {
    await submit(text)
  }`)
    }
    parts.push(`test('submit detectors attach at most one note, with stop precedence', { options: { ...DEFAULTS, ...${json(overrides)} } }, async ($, on) => {
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
${checks.join('\n')}
})`)
  }
  {
    // A malformed stored record is dropped by the closed export schema; seeded through
    // mock.store because the test `$` has no store methods (integrator's correction).
    const row = Object.entries(events).find(([, names]) => names.length > 0)
    if (row) {
      const [recipe, names] = row
      parts.push(`test('export drops a malformed metrics record', { options: DEFAULTS }, async ($, on) => {
  mock.store(on, {
    ${json(STORE_KEYS.metrics)}: { v: 1, since: 0, counts: { ${json(recipe)}: { ${json(names[0])}: '1', free_text: 1 } } },
  })
  mock.clock(on)
  on('command.run', { command: ${json(TOOL_NAME)} }, () => ({ text: 'unexpected bottom' }))
  const rejected = await $.command.run({ command: ${json(TOOL_NAME)}, args: 'export --print' })
  expect(JSON.parse(rejected.text).metrics.counts).toEqual({})
})`)
    }
  }
  if (separateExport) parts.push(`test('export has only the closed schema and allowed values', { options: DEFAULTS }, async ($, on) => {
${exportChecks}
})`)
  return parts.join('\n\n') + '\n'
}
