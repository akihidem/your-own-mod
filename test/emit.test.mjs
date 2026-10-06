import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { TOOL_NAME, TOOL_VERSION } from '../src/constants.mjs'
import { emitPlugin, writePluginFolder, userConfigKey, leakCheck, leakNeedles, stripEvidence } from '../src/emit.mjs'
import { renderManifest } from '../src/templates/manifest.mjs'
import { renderRegister } from '../src/templates/register.mjs'
import { renderTests } from '../src/templates/tests.mjs'

const PATHS = [
  'PROPOSALS.json', 'PROPOSALS.md',
  'plugin/.claude-plugin/marketplace.json', 'plugin/.claude-plugin/plugin.json',
  'plugin/hooks/hooks.json', 'plugin/hooks/register.test.ts', 'plugin/hooks/register.ts',
]
const QUOTES = [
  'CANARY-7q',
  '<img src=x>CANARY-html',
  '"CANARYA"',
  'UNIQUE-QUOTE-ALPHA-7781 this synthetic sentence belongs only in the private reports.',
  'Three ticks ``` and a [link](https://example.invalid).',
  '<script>CANARY-script</script> and <iframe>CANARY-frame</iframe>',
  'Four ticks ```` and six `````` inside one quote.',
]

function param(name, type, value, extra = {}) {
  return {
    type, default: value,
    title: { en: `Synthetic ${name}`, ja: `試験用 ${name}` },
    description: { en: `Configure synthetic ${name}.`, ja: `試験用の ${name} を設定します。` },
    ...extra,
  }
}

function recipe(id, template, extra = {}) {
  return {
    id, template,
    title: { en: `Distinctive synthetic ${id}`, ja: `固有の試験用 ${id}` },
    summary: { en: `Apply the synthetic ${id} accommodation.`, ja: `試験用の ${id} を適用します。` },
    sections: ['style'], triggers: [], unless: [], mechanisms: [], params: {}, metrics: [],
    evidence: [{ kind: 'author', ref: 'synthetic/reference', note: 'Synthetic catalog evidence.' }],
    ...extra,
  }
}

const recipes = Object.fromEntries([
  recipe('lead-with-answer', 'compose-rule', {
    rule: { en: 'Lead with the answer; keep it under {max_lines} lines{max_chars_clause}.' }, metrics: ['long_answers'],
    params: {
      max_lines: param('max_lines', 'number', 12, { min: 3, max: 200 }),
      max_chars: param('max_chars', 'number', 0, { min: 0, max: 20000 }),
    },
  }),
  recipe('response-language', 'compose-rule', {
    rule: { en: 'Use {language} for the answer.' },
    params: { language: param('language', 'string', 'ja', { options: ['ja', 'en'] }) },
  }),
  recipe('receive-only-fragments', 'submit-detector', {
    note: { en: 'Receive this short fragment without advice or questions.' }, metrics: ['detected'],
    params: {
      max_chars: param('max_chars', 'number', 24, { min: 4, max: 80 }),
      phrases: param('phrases', 'string', ['眠い', '疲れた', 'tired'], { multiple: true }),
    },
  }),
  recipe('publish-guard', 'publish-guard', {
    metrics: ['denied', 'allowed'],
    params: {
      allow_minutes: param('allow_minutes', 'number', 30, { min: 1, max: 720 }),
      // Every default must compile: one malformed pattern makes the guard deny everything
      // (fail closed, final inspection chunk C); that path has its own test below.
      patterns: param('patterns', 'string', ['\\bgit\\s+(-C\\s+\\S+\\s+)?push\\b', '\\bgh\\s+(pr|issue)\\s+create\\b'], { multiple: true }),
    },
  }),
  recipe('running-indicator', 'running-indicator', {
    metrics: ['long_turns'],
    params: { long_turn_seconds: param('long_turn_seconds', 'number', 120, { min: 10, max: 3600 }) },
  }),
  recipe('session-resume-brief', 'resume-brief', { metrics: ['resumed'] }),
  recipe('focus-timer', 'focus-timer', {
    metrics: ['ticks'],
    params: { interval_minutes: param('interval_minutes', 'number', 50, { min: 5, max: 180 }) },
  }),
].map(entry => [entry.id, entry]))

const recipesWithStop = {
  ...recipes,
  'respect-stop-signals': recipe('respect-stop-signals', 'submit-detector', {
    note: { en: 'Stop here without adding a next task.' }, metrics: ['detected'],
    params: { phrases: param('phrases', 'string', ['一旦やめる', 'あとで', 'stop for now', 'wrap up', '疲れた'], { multiple: true }) },
  }),
}

function bundleFor(ids = Object.keys(recipes), catalog = recipes) {
  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    profile: { file: 'synthetic.md', format: 'generic', language: 'en', version: null, sha256: '0123456789abcdef'.repeat(4) },
    pluginName: 'kokoro-mods-synthetic',
    proposals: ids.map((id, index) => ({
      recipeId: id, confidence: 'high',
      evidence: [{ line: index + 1, section: 'style', quote: QUOTES[index % QUOTES.length], matched: index === 0 ? '<img src=x>[l](https://x)' : 'CANARY-MATCH' }],
      params: {
        ...Object.fromEntries(Object.entries(catalog[id].params).map(([name, field]) => [name, structuredClone(field.default)])),
        ...(id === 'lead-with-answer' ? { max_lines: 9 } : {}),
        ...(id === 'response-language' ? { language: 'en' } : {}),
      },
      enabledByDefault: !['response-language', 'focus-timer'].includes(id),
    })),
    notMatched: ['one-next-step'], files: [],
  }
}

function emit(bundle = bundleFor(), catalog = recipes, extra = {}) {
  return emitPlugin({ bundle, recipes: catalog, ...extra })
}

function codeBlocks(markdown) {
  const blocks = []
  const outside = []
  let fence = null
  let lines = []
  for (const line of markdown.split('\n')) {
    if (fence) {
      if (line === fence) {
        blocks.push({ fence, text: lines.join('\n') })
        fence = null
        lines = []
      } else lines.push(line)
    } else {
      const match = /^(`{3,})text$/.exec(line)
      if (match) fence = match[1]
      else outside.push(line)
    }
  }
  assert.equal(fence, null, 'every fence closes')
  return { blocks, outside: outside.join('\n') }
}

function canariesFor(bundle) {
  const needles = new Set()
  for (const { evidence } of bundle.proposals) {
    for (const { quote, matched } of evidence) {
      for (const value of [quote, matched]) if (value) needles.add(value)
      // Detect partial copies from both ends of every quoted line as well.
      if (quote.length >= 8) {
        needles.add(quote.slice(0, 8))
        needles.add(quote.slice(-8))
      }
    }
  }
  return [...needles]
}

test('emits exactly the frozen layout and strict manifest fields', () => {
  const bundle = bundleFor()
  const files = emit(bundle)
  assert.equal(Object.keys(recipes).length, 7)
  assert.equal(new Set(Object.values(recipes).map(r => r.template)).size, 6)
  assert.equal(bundle.proposals.filter(p => !p.enabledByDefault).length, 2)
  assert.deepEqual([...files.keys()], PATHS)
  const manifest = JSON.parse(files.get('plugin/.claude-plugin/plugin.json'))
  assert.deepEqual(Object.keys(manifest), ['name', 'version', 'description', 'author', 'license', 'keywords', 'userConfig'])
  assert.equal(manifest.name, bundle.pluginName)
  assert.equal(manifest.version, bundle.tool.version)
  assert.equal(manifest.description, 'Mods proposed by kokoro-mods (profile 01234567)')
  for (const path of ['plugin/.claude-plugin/plugin.json', 'plugin/.claude-plugin/marketplace.json']) {
    const { description } = JSON.parse(files.get(path))
    assert.equal(description, manifest.description)
    assert.equal(description.includes(bundle.profile.file), false)
    assert.equal(description.includes(bundle.profile.format), false)
  }
  assert.deepEqual(manifest.author, { name: TOOL_NAME })
  assert.equal(manifest.license, 'MIT')
  assert.deepEqual(manifest.keywords, [TOOL_NAME, 'accessibility', 'claude-code-mod'])
  const expectedKeys = []
  for (const proposal of bundle.proposals) {
    const definition = recipes[proposal.recipeId]
    const key = userConfigKey(proposal.recipeId)
    expectedKeys.push(key)
    assert.deepEqual(manifest.userConfig[key], {
      type: 'boolean', title: definition.title.en, description: definition.summary.en, default: proposal.enabledByDefault,
    })
    for (const [name, param] of Object.entries(definition.params)) {
      const key = userConfigKey(proposal.recipeId, name)
      expectedKeys.push(key)
      const field = manifest.userConfig[key]
      assert.equal(field.type, param.type)
      assert.equal(field.title, param.title.en)
      assert.equal(field.description, param.description.en)
      assert.deepEqual(field.default, proposal.params[name])
      if (param.type === 'number') {
        assert.equal(field.min, param.min)
        assert.equal(field.max, param.max)
      }
      if (Object.hasOwn(field, 'multiple')) {
        assert.equal(field.type, 'string')
        assert.equal(field.multiple, true)
        assert.ok(Array.isArray(field.default))
        assert.equal(Object.hasOwn(field, 'options'), false)
      } else if (param.options) assert.deepEqual(field.options, param.options)
      const allowed = ['type', 'title', 'description', 'default', 'min', 'max', 'options', 'multiple']
      assert.ok(Object.keys(field).every(key => allowed.includes(key)))
    }
  }
  assert.deepEqual(Object.keys(manifest.userConfig).sort(), expectedKeys.sort())
  assert.deepEqual(JSON.parse(files.get('plugin/.claude-plugin/marketplace.json')), {
    name: bundle.pluginName, description: manifest.description,
    owner: { name: TOOL_NAME }, plugins: [{ name: bundle.pluginName, source: './' }],
  })
  assert.deepEqual(JSON.parse(files.get('plugin/hooks/hooks.json')), { modules: ['./register.ts'] })
  assert.deepEqual(JSON.parse(files.get('PROPOSALS.json')), { ...bundle, files: PATHS })
})

test('userConfig names and localized labels follow the shared contract', () => {
  assert.equal(userConfigKey('lead-with-answer'), 'lead_with_answer')
  assert.equal(userConfigKey('lead-with-answer', 'max_lines'), 'lead_with_answer_max_lines')
  const files = emit(bundleFor(), recipes, { lang: 'ja', outDirName: 'mods/example' })
  const manifest = JSON.parse(files.get('plugin/.claude-plugin/plugin.json'))
  assert.equal(manifest.userConfig.lead_with_answer.title, recipes['lead-with-answer'].title.ja)
  assert.equal(manifest.userConfig.lead_with_answer_max_lines.description, recipes['lead-with-answer'].params.max_lines.description.ja)
  assert.match(files.get('PROPOSALS.md'), /初期設定でオフ/)
  assert.ok(files.get('PROPOSALS.md').includes('/plugin marketplace add example/plugin'))
})

test('only proposed recipes are emitted and unknown ids fail', () => {
  const extra = recipe('one-next-step', 'compose-rule', { rule: { en: 'UNUSED-RECIPE-TEXT' } })
  const files = emit(bundleFor(), { ...recipes, [extra.id]: extra })
  assert.equal([...files.values()].some(text => text.includes('UNUSED-RECIPE-TEXT')), false)
  const bad = bundleFor()
  bad.proposals[0].recipeId = 'missing-recipe'
  assert.throws(() => emit(bad), /unknown recipe id/)
  const booleanRecipe = structuredClone(recipes)
  booleanRecipe['lead-with-answer'].params.flag = param('flag', 'boolean', true)
  const booleanFields = JSON.parse(emit(bundleFor(undefined, booleanRecipe), booleanRecipe).get('plugin/.claude-plugin/plugin.json')).userConfig
  assert.equal(booleanFields.lead_with_answer_flag.default, true)
  booleanRecipe['lead-with-answer'].params.flag.multiple = true
  assert.throws(() => emit(bundleFor(undefined, booleanRecipe), booleanRecipe), /parameter type/)
})

test('emitter accepts only catalog defaults for free-text parameters', () => {
  const catalog = structuredClone(recipes)
  catalog['receive-only-fragments'].params.label = param('label', 'string', 'Catalog label')
  const bundle = bundleFor(['receive-only-fragments'], catalog)
  assert.doesNotThrow(() => emit(structuredClone(bundle), catalog))
  for (const [name, value] of [
    ['label', 'PRIVATE-FREE-TEXT-7781'],
    ['label', null],
    ['phrases', ['PRIVATE-FREE-TEXT-7781']],
    ['phrases', [...bundle.proposals[0].params.phrases].reverse()],
  ]) {
    const altered = structuredClone(bundle)
    altered.proposals[0].params[name] = value
    assert.throws(() => emit(altered, catalog), {
      message: `E_PARAM_FREE_TEXT: receive-only-fragments.${name}`,
    })
  }
})

test('emitter enforces finite bounded numbers and enumerated strings', () => {
  for (const [id, definition] of Object.entries(recipes)) {
    for (const [name, field] of Object.entries(definition.params)) {
      if (field.type !== 'number') continue
      const bundle = bundleFor([id])
      for (const value of [NaN, Infinity, -Infinity, undefined, '9', field.min - 1, field.max + 1]) {
        bundle.proposals[0].params[name] = value
        assert.throws(() => emit(bundle), /Invalid recipe parameter default/)
      }
      for (const value of [field.min, field.max]) {
        bundle.proposals[0].params[name] = value
        assert.doesNotThrow(() => emit(bundle))
      }
    }
  }
  const catalog = structuredClone(recipes)
  catalog['response-language'].params.choices = param('choices', 'string', ['en'], {
    multiple: true, options: ['ja', 'en'],
  })
  const bundle = bundleFor(['response-language'], catalog)
  assert.doesNotThrow(() => emit(bundle, catalog))
  for (const [name, value] of [['language', 'private-text'], ['choices', ['en', 'private-text']]]) {
    const altered = structuredClone(bundle)
    altered.proposals[0].params[name] = value
    assert.throws(() => emit(altered, catalog), /Invalid recipe parameter default/)
  }
})

test('quotes that are catalog text are exempt at any length; other needles are reported by position', () => {
  // Catalog text in the distributable reveals only which recipes matched, so a quoted
  // line that is word for word a title or a rule is no leak (DESIGN §5.5; re-inspection,
  // chunk C, L4). The fail-closed path itself is exercised through leakCheck below and in
  // the principle-6 test: no input of emitPlugin can put non-catalog manual text into the
  // output, which is the structural guarantee.
  const bundle = bundleFor(['lead-with-answer'])
  const quote = 'UNIQUE-QUOTE-LEAK-CANARY-9901 answer first please'
  bundle.proposals[0].evidence[0].quote = quote
  const catalogText = structuredClone(recipes)
  catalogText['lead-with-answer'].title.en = quote
  assert.doesNotThrow(() => emit(bundle, catalogText))
  assert.ok(!leakNeedles(bundle, catalogText).has(quote.toLowerCase()))
  // Without that title the quote is a needle, and a copy of it in the output, in any
  // spelling, is found and named by position only.
  const needles = leakNeedles(bundle, recipes)
  assert.equal(needles.get(quote.toLowerCase()), 'proposals[0].evidence[0]')
  for (const spelling of [quote, quote.toUpperCase(), 'ＵＮＩＱＵＥ-QUOTE-LEAK-CANARY-9901 answer first please']) {
    const files = emit(bundle)
    files.set('plugin/hooks/register.ts', files.get('plugin/hooks/register.ts') + '\n// ' + spelling + '\n')
    assert.deepEqual(leakCheck(files, needles.keys()), ['plugin/hooks/register.ts: ' + quote.toLowerCase()])
  }
  bundle.proposals[0].evidence = ['', 'a', 'on', 'the', 'short quote'].map((value, i) => ({
    line: i + 1, section: 'style', quote: value, matched: value,
  }))
  assert.doesNotThrow(() => emit(bundle))
})

test('leak needles: quotes and matched words count unless the catalog, the templates or the plugin name hold them', () => {
  const bundle = bundleFor(['lead-with-answer', 'publish-guard'])
  bundle.pluginName = 'kokoro-mods-zz-unique-handle'
  const [lead, guard] = bundle.proposals
  // Preconditions on the synthetic catalog, so each exemption below is the one claimed
  // (re-inspection, chunk C tests, M1 and M2).
  const catalogText = JSON.stringify(Object.values(recipes)).normalize('NFKC').toLowerCase()
  assert.ok(catalogText.includes('lead with the answer'))
  assert.ok(catalogText.includes('synthetic'))
  assert.ok(catalogText.includes('push'))
  assert.ok(!catalogText.includes('確認'))
  assert.ok(!catalogText.includes('zz-unique-handle'))
  lead.evidence = [
    { line: 1, section: 'style', quote: 'Lead with the answer', matched: 'answer' },      // catalog rule text: exempt at any length
    { line: 2, section: 'style', quote: 'CANARY-X', matched: 'push' },                     // a needle; 'push' is a catalog pattern word
    { line: 3, section: 'style', quote: 'synthetic lead-with-answer', matched: 'x' },      // catalog title text; one-character matched is dropped
  ]
  guard.evidence = [
    { line: 4, section: 'boundaries', quote: ' 確認 ', matched: '確認' },                   // not catalog text: a needle, trimmed
    { line: 5, section: 'boundaries', quote: 'zz-unique-handle', matched: 'kokoro-mods-zz-unique-handle' }, // the plugin name: exempt
  ]
  const needles = leakNeedles(bundle, recipes)
  assert.deepEqual([...needles.keys()], ['canary-x', '確認'])
  assert.deepEqual([...needles.values()], ['proposals[0].evidence[1]', 'proposals[1].evidence[0]'])
  assert.ok(!needles.has(' 確認 '))
  // Needles are folded: full-width and upper-case spellings become one needle.
  lead.evidence = [{ line: 1, section: 'style', quote: 'ＣＡＮＡＲＹ-Ｙ', matched: 'Canary-Y' }, { line: 2, section: 'style', quote: 'あ', matched: 'い' }]
  guard.evidence = []
  assert.deepEqual([...leakNeedles(bundle, recipes).keys()], ['canary-y'])
})

test('emitter refuses a plugin name that is not a kokoro-mods slug, and a bundle whose fields are malformed', () => {
  for (const name of ['Kokoro-Mods-x', 'kokoro-mods-', 'kokoro-mods', 'other-me', 'kokoro-mods-a--b', `kokoro-mods-${'a'.repeat(41)}`, 'kokoro-mods-山田', '', 'kokoro-mods-adhd', 'kokoro-mods-my-ptsd-notes', 'kokoro-mods-me\n', 'kokoro-mods-me ', undefined, 42, null]) {
    const bundle = bundleFor()
    bundle.pluginName = name
    assert.throws(() => emit(bundle), { code: 'E_PLUGIN_NAME' }, String(name))
  }
  for (const name of ['kokoro-mods-me', 'kokoro-mods-a-b-9', `kokoro-mods-${'a'.repeat(40)}`]) {
    const bundle = bundleFor()
    bundle.pluginName = name
    assert.doesNotThrow(() => emit(bundle), name)
  }
  // Every other validated field, each with a positive neighbour (re-inspection, chunk C tests, M5).
  const cases = [
    ['profile.sha256', bundle => { bundle.profile.sha256 = 'nope' }, bundle => { bundle.profile.sha256 = 'A'.repeat(64).toLowerCase() }],
    ['tool.version', bundle => { bundle.tool.version = 'v1' }, bundle => { bundle.tool.version = '1.0.0-rc.1+build.7' }],
    ['proposals[0].confidence', bundle => { bundle.proposals[0].confidence = 'certain' }, bundle => { bundle.proposals[0].confidence = 'low' }],
    ['proposals[0].enabledByDefault', bundle => { bundle.proposals[0].enabledByDefault = 'true' }, bundle => { bundle.proposals[0].enabledByDefault = false }],
    ['proposals[0].enabledByDefault', bundle => { bundle.proposals[0].enabledByDefault = 1 }, bundle => { bundle.proposals[0].enabledByDefault = true }],
    ['proposals[0].enabledByDefault', bundle => { delete bundle.proposals[0].enabledByDefault }, bundle => { bundle.proposals[0].enabledByDefault = true }],
    ['proposals[0].params', bundle => { bundle.proposals[0].params = null }, bundle => {}],
    ['proposals[0].params: unknown key at index 2', bundle => { bundle.proposals[0].params.PRIVATE = 1 }, bundle => {}],
    ['proposals[0].params.max_lines: required parameter is missing', bundle => { delete bundle.proposals[0].params.max_lines }, bundle => {}],
    ['proposals[0].evidence[0]', bundle => { bundle.proposals[0].evidence = [null] }, bundle => {}],
  ]
  for (const [key, mutate, repair] of cases) {
    const bundle = bundleFor()
    mutate(bundle)
    assert.throws(() => emit(bundle), error => error.code === 'E_BUNDLE' && error.message.includes(key) && !error.message.includes('PRIVATE'), key)
    const fixed = bundleFor()
    repair(fixed)
    assert.doesNotThrow(() => emit(fixed), key)
  }
  // Pattern lists must be non-empty and compile in Unicode mode before they are shipped
  // (re-inspection, chunk C, M3; tests L6).
  for (const patterns of [[], ['['], ['\\bgit\\b', '\\-'], ['ok', 7]]) {
    const bundle = bundleFor(['publish-guard'])
    bundle.proposals[0].params.patterns = patterns
    assert.throws(() => emit(bundle), error => error.code === 'E_BUNDLE' && /params\.patterns/.test(error.message), JSON.stringify(patterns))
  }
})

test('plugin template boundaries reject evidence and stripping does not mutate the bundle', () => {
  const bundle = bundleFor()
  const before = structuredClone(bundle)
  const stripped = stripEvidence(bundle)
  assert.notEqual(stripped, bundle)
  assert.ok(stripped.proposals.every(p => !Object.hasOwn(p, 'evidence')))
  assert.deepEqual(stripped.proposals, bundle.proposals.map(({ evidence, ...p }) => p))
  assert.deepEqual(bundle, before)
  for (const render of [renderManifest, renderRegister, renderTests]) {
    assert.throws(() => render({ bundle, recipes }), /evidence-free/)
  }
})

test('principle-6-no-leak: evidence never reaches plugin/', () => {
  const bundle = bundleFor(Object.keys(recipesWithStop), recipesWithStop)
  const files = emit(bundle, recipesWithStop)
  assert.deepEqual(leakCheck(files, canariesFor(bundle)), [])
  const contaminated = new Map(files)
  contaminated.set('plugin/hooks/register.ts', files.get('plugin/hooks/register.ts') + '\n// CANARY-7q\n')
  assert.deepEqual(leakCheck(contaminated, ['CANARY-7q']), ['plugin/hooks/register.ts: CANARY-7q'])
  assert.deepEqual(leakCheck(new Map([['plugin/probe.ts', JSON.stringify('"CANARYA"')]]), ['"CANARYA"']), ['plugin/probe.ts: "CANARYA"'])
  assert.deepEqual(leakCheck(new Map([['plugin/probe.ts', 'x'], ['PROPOSALS.md', 'x']]), ['x']), ['plugin/probe.ts: x'])
})

test('module shape follows the loader and generated tests are conditional', () => {
  const files = emit()
  const source = files.get('plugin/hooks/register.ts')
  assert.match(source, /export const register/)
  assert.ok(source.includes('kokoro-mods-synthetic:profile-rules'))
  assert.match(source, /receive_only_fragments_phrases: readonly string\[\]/)
  const submit = source.slice(source.indexOf("on('prompt.submit'"), source.indexOf("on('tool.call'"))
  const guard = source.slice(source.indexOf("on('tool.call', { tool: 'Bash' }"), source.indexOf("on('turn.start'"))
  assert.match(submit, /\}\)\.catch\(/)
  assert.match(guard, /\}\)\.catch\(/)
  assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(/)
  assert.equal((files.get('plugin/hooks/register.test.ts').match(/\btest\(/g) ?? []).length, 9)
  const minimal = emit(bundleFor(['focus-timer']))
  assert.equal((minimal.get('plugin/hooks/register.test.ts').match(/\btest\(/g) ?? []).length, 3)
  assert.equal(minimal.get('plugin/hooks/register.ts').includes("on('prompt.compose'"), false)
  assert.equal(minimal.get('plugin/hooks/register.ts').includes("on('prompt.submit'"), false)
  for (const files of [minimal, emit(bundleFor([])), emit(bundleFor(['response-language']))]) {
    const tests = files.get('plugin/hooks/register.test.ts')
    assert.ok(tests.includes("args: 'export --print'"))
    assert.ok(tests.includes('expect(obj.metrics.counts).toEqual(COUNTS)'))
  }
})

test('state-changing commands require composer origin in the emitted gate', () => {
  const source = emit().get('plugin/hooks/register.ts')
  const gate = source.match(/^      const changesState = [\s\S]*?^      \}/m)
  assert.ok(gate)
  assert.match(gate[0], /e\.origin\.kind !== 'composer'/)
  const check = new Function('command', 'arg', 'e', gate[0] + '\nreturn null')
  for (const [command, arg] of [['export', '/tmp/counts.json'], ['allow-publish', '30'], ['focus', '50'], ['reset', '']]) {
    assert.ok(gate[0].includes(`command === '${command}'`))
    for (const origin of [{ kind: 'plugin', name: 'x' }, { kind: 'tool' }, undefined]) {
      assert.deepEqual(check(command, arg, { origin }), {
        text: 'kokoro-mods: this subcommand must be typed by the user.',
      })
    }
    assert.equal(check(command, arg, { origin: { kind: 'composer' } }), null)
  }
  for (const origin of [{ kind: 'plugin', name: 'x' }, { kind: 'composer' }, undefined]) {
    assert.equal(check('status', '', { origin }), null)
    assert.equal(check('export', '--print', { origin }), null)
  }
})

test('runtime options: malformed values fall back to manifest defaults and numbers are clamped', () => {
  const bundle = bundleFor()
  const files = emit(bundle)
  const source = files.get('plugin/hooks/register.ts')
  const numbers = source.match(/^const NUMBER_DEFAULTS: Record<string, number> = ([\s\S]*?)^\}$/m)
  const bounds = source.match(/^const NUMBER_BOUNDS: Record<string, readonly \[number \| null, number \| null\]> = ([\s\S]*?)^\}$/m)
  const booleans = source.match(/^const BOOLEAN_DEFAULTS: Record<string, boolean> = ([\s\S]*?)^\}$/m)
  const helper = source.match(/^function normalizeOptions\(options: unknown\): Options \{\n([\s\S]*?)^\}/m)
  const record = source.match(/^function record\(value: unknown\): Record<string, unknown> \{\n([\s\S]*?)^\}/m)
  assert.ok(numbers && bounds && booleans && helper && record)
  const numberDefaults = JSON.parse(numbers[1] + '}')
  const numberBounds = JSON.parse(bounds[1] + '}')
  const booleanDefaults = JSON.parse(booleans[1] + '}')
  // Runtime fallbacks are the proposal's values, which plugin.json shows as defaults
  // (the lead-with-answer proposal carries max_lines 9, not the recipe's 12).
  const expectedNumbers = Object.fromEntries(bundle.proposals.flatMap(p =>
    Object.entries(recipes[p.recipeId].params).filter(([, param]) => param.type === 'number')
      .map(([name]) => [userConfigKey(p.recipeId, name), p.params[name]])))
  assert.equal(expectedNumbers.lead_with_answer_max_lines, 9)
  assert.deepEqual(numberDefaults, expectedNumbers)
  assert.deepEqual(numberBounds, Object.fromEntries(Object.entries(recipes).flatMap(([id, recipe]) =>
    Object.entries(recipe.params).filter(([, param]) => param.type === 'number')
      .map(([name, param]) => [userConfigKey(id, name), [param.min, param.max]]))))
  // Toggles default to the manifest's enabledByDefault (chunk C: a missing toggle must not disarm a guard),
  // and both default tables equal what plugin.json shows the person (re-inspection, chunk C tests, L1).
  assert.deepEqual(booleanDefaults, Object.fromEntries(bundle.proposals.map(p => [userConfigKey(p.recipeId), p.enabledByDefault])))
  const userConfig = JSON.parse(files.get('plugin/.claude-plugin/plugin.json')).userConfig
  for (const [key, value] of Object.entries({ ...numberDefaults, ...booleanDefaults })) assert.equal(userConfig[key].default, value, key)
  const asRecord = new Function('value', record[1].replace(' as Record<string, unknown>', ''))
  const normalize = new Function('NUMBER_DEFAULTS', 'NUMBER_BOUNDS', 'BOOLEAN_DEFAULTS', 'record', 'options', helper[1].replace(' as Options', ''))
    .bind(null, numberDefaults, numberBounds, booleanDefaults, asRecord)
  assert.deepEqual(normalize({}), { ...booleanDefaults, ...expectedNumbers })
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '12', 'true', 1, 0]) {
    const options = Object.fromEntries([...Object.keys(numberDefaults), ...Object.keys(booleanDefaults)].map(key => [key, value]))
    const before = structuredClone(options)
    const normalized = normalize(options)
    for (const key of Object.keys(booleanDefaults)) assert.equal(normalized[key], booleanDefaults[key], `${key}=${value}`)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      for (const key of Object.keys(numberDefaults)) assert.equal(normalized[key], numberDefaults[key], `${key}=${value}`)
    }
    assert.deepEqual(options, before)
  }
  assert.equal(normalize({ lead_with_answer_max_lines: 11 }).lead_with_answer_max_lines, 11)
  assert.equal(normalize({ lead_with_answer_max_lines: NaN }).lead_with_answer_max_lines, 9)
  // Out-of-range numbers are clamped to the recipe bounds rather than trusted (chunk C).
  assert.equal(normalize({ lead_with_answer_max_lines: 1000 }).lead_with_answer_max_lines, 200)
  assert.equal(normalize({ lead_with_answer_max_lines: -5 }).lead_with_answer_max_lines, 3)
  assert.equal(normalize({ focus_timer_interval_minutes: 0 }).focus_timer_interval_minutes, 5)
  assert.equal(normalize({ running_indicator_long_turn_seconds: -1 }).running_indicator_long_turn_seconds, 10)
  assert.equal(normalize({ publish_guard: false }).publish_guard, false)
  assert.equal(normalize({ publish_guard: 'no' }).publish_guard, true)
  assert.match(source, /const o = normalizeOptions\(options\)/)
  // A one-sided bound clamps on that side only (re-inspection, chunk C, L2).
  const oneSided = structuredClone(recipes)
  oneSided['lead-with-answer'].params.floor = param('floor', 'number', 5, { min: 1 })
  const sidedSource = emit(bundleFor(undefined, oneSided), oneSided).get('plugin/hooks/register.ts')
  const sidedBounds = JSON.parse(sidedSource.match(/^const NUMBER_BOUNDS: Record<string, readonly \[number \| null, number \| null\]> = ([\s\S]*?)^\}$/m)[1] + '}')
  assert.deepEqual(sidedBounds.lead_with_answer_floor, [1, null])
  const sidedHelper = sidedSource.match(/^function normalizeOptions\(options: unknown\): Options \{\n([\s\S]*?)^\}/m)
  const sidedNormalize = new Function('NUMBER_DEFAULTS', 'NUMBER_BOUNDS', 'BOOLEAN_DEFAULTS', 'record', 'options', sidedHelper[1].replace(' as Options', ''))
    .bind(null, { lead_with_answer_floor: 5 }, sidedBounds, {}, asRecord)
  assert.equal(sidedNormalize({ lead_with_answer_floor: -3 }).lead_with_answer_floor, 1)
  assert.equal(sidedNormalize({ lead_with_answer_floor: 1000 }).lead_with_answer_floor, 1000)
})

test('invalid runtime pattern lists deny without reaching the bottom or throwing', async () => {
  const source = emit().get('plugin/hooks/register.ts')
  const handler = source.match(/on\('tool.call', \{ tool: 'Bash' \}, async \(\$, e, next\) => \{\n([\s\S]*?)^  \}\)\.catch/m)
  assert.ok(handler)
  const guard = new Function('$', 'e', 'next', 'o', 'bump', 'PLUGIN', 'STORE_KEYS',
    'return (async () => {\n' + handler[1] + '\n})()')
  const invalid = 'kokoro-mods-synthetic: publish guard configuration is invalid (patterns must be a non-empty list of regular expressions valid in Unicode mode); every Bash command is denied until the setting is fixed in /config.'
  const host = { store: { get: async () => undefined }, clock: { now: async () => 1000 } }
  const keys = { publishAllowedUntil: 'kokoro-mods:publish-allowed-until' }
  // A list that is not all strings, an empty list, and a list with one pattern that does
  // not compile all deny every command: a broken pattern must not silently stop guarding
  // (chunk C; re-inspection M3), whether or not a grant is active (tests L5).
  const granted = { store: { get: async () => 5000 }, clock: { now: async () => 1000 } }
  for (const patterns of [undefined, null, 'git push', {}, [], [1], ['git push', 1], Array(1), ['['], ['\\bgit\\b', '('], ['\\-']]) {
    for (const command of ['git push', 'ls']) {
      for (const $ of [host, granted]) {
        const counted = []
        const result = await guard($, { tool: 'Bash', command }, () => assert.fail('reached bottom'),
          { publish_guard: true, publish_guard_patterns: patterns }, async (_, recipe, event) => { counted.push(`${recipe}:${event}`) }, 'kokoro-mods-synthetic', keys)
        assert.deepEqual(result, { deny: invalid }, JSON.stringify({ patterns, command }))
        assert.deepEqual(counted, ['publish-guard:denied'])
      }
    }
    // With the guard off, patterns are not read at all.
    assert.deepEqual(await guard(host, { tool: 'Bash', command: 'git push' }, e => ({ reached: e.command }),
      { publish_guard: false, publish_guard_patterns: patterns }, async () => assert.fail('counted'), 'kokoro-mods-synthetic', keys), { reached: 'git push' })
  }
  // Valid patterns: a matching command is denied with the allow-publish hint, others pass.
  const next = e => ({ reached: e.command })
  const valid = ['\\bgit\\s+push\\b']
  const denied = await guard(host, { tool: 'Bash', command: 'git push origin main' }, next,
    { publish_guard: true, publish_guard_patterns: valid }, async () => {}, 'kokoro-mods-synthetic', keys)
  assert.match(denied.deny, /allow-publish/)
  const passed = await guard(host, { tool: 'Bash', command: 'ls' }, next,
    { publish_guard: true, publish_guard_patterns: valid }, async () => {}, 'kokoro-mods-synthetic', keys)
  assert.deepEqual(passed, { reached: 'ls' })
})

test('compose parameters and stop precedence remain independent of proposal order', () => {
  const catalog = {
    ...recipes,
    'offer-options': recipe('offer-options', 'compose-rule', {
      rule: { en: 'Offer between {min} and {max} options.' },
      params: {
        min: param('min', 'number', 2, { min: 2, max: 4 }),
        max: param('max', 'number', 4, { min: 2, max: 6 }),
      },
    }),
    'respect-stop-signals': recipe('respect-stop-signals', 'submit-detector', {
      note: { en: 'Stop here without adding a next task.' }, metrics: ['detected'],
      params: { phrases: param('phrases', 'string', ['眠い', 'stop for now'], { multiple: true }) },
    }),
  }
  const bundle = bundleFor(Object.keys(catalog), catalog)
  const files = emit(bundle, catalog)
  const source = files.get('plugin/hooks/register.ts')
  const proposals = bundle.proposals
  const permutations = [
    [...proposals].reverse(),
    [...proposals.slice(1), proposals[0]],
    [...proposals.filter((_, i) => i % 2), ...proposals.filter((_, i) => i % 2 === 0)],
  ]
  // The private reports preserve ranking; distributable bytes do not depend on it.
  const pluginBytes = files => [...files].filter(([path]) => path.startsWith('plugin/'))
    .map(([path, text]) => [path, Buffer.from(text)])
  for (const proposals of permutations) {
    assert.deepEqual(pluginBytes(emit({ ...bundle, proposals }, catalog)), pluginBytes(files))
  }
  for (const key of ['lead_with_answer_max_lines', 'response_language_language', 'offer_options_min', 'offer_options_max']) {
    assert.ok(source.includes('String(o.' + key + ')'))
  }
  assert.ok(source.indexOf('if (o.respect_stop_signals') < source.indexOf('if (o.receive_only_fragments'))
  assert.ok(files.get('plugin/hooks/register.test.ts').includes('Stop here without adding a next task.'))
})

test('detector helpers are top-level and match only whole utterances', () => {
  const source = emit(bundleFor(Object.keys(recipesWithStop), recipesWithStop), recipesWithStop).get('plugin/hooks/register.ts')
  assert.match(source, /^function matchesPhrase\(/m)
  assert.match(source, /^function bump\(/m)
  assert.match(source, /^async function readMetrics\(/m)
  assert.match(source, /^async function writeExport\(/m)
  assert.match(source, /^async function toast\(/m)
  assert.match(source, /^async function startRunning\(/m)
  assert.match(source, /^function startFocus\(/m)
  const register = source.slice(source.indexOf('export const register'))
  assert.doesNotMatch(register, /\bfunction (?:bump|readMetrics|writeExport|toast|startRunning|startFocus|resetMetrics)\(/)
  for (const name of ['chain', 'lastToastAt', 'timer', 'focusTimer', 'interactive', 'cwd']) {
    assert.match(source, new RegExp('^let ' + name + '\\b', 'm'))
  }
  // Every piece of module state is reset at registration (final inspection, chunk C).
  assert.match(source, /^function resetState\(\): void \{\n/m)
  assert.match(register, /=> \{\n  resetState\(\)\n  const o = normalizeOptions\(options\)/)
  const reset = source.match(/^function resetState\(\): void \{\n([\s\S]*?)^\}/m)[1]
  // Every module-level `let` is reset, and a timer is cancelled before its variable is
  // cleared (re-inspection, chunk C tests, M4).
  const lets = [...source.matchAll(/^let (\w+)/gmu)].map(match => match[1])
  assert.deepEqual(lets.sort(), ['chain', 'completedSinceTick', 'cwd', 'fired', 'focusTimer', 'interactive', 'lastToastAt', 'n', 'startedAt', 'timer'])
  for (const name of lets) assert.match(reset, new RegExp('^  ' + name + ' = ', 'm'), name)
  assert.doesNotMatch(reset, /^  (\w+) = \1$/m)
  for (const name of ['timer', 'focusTimer']) {
    assert.ok(reset.indexOf(`${name}?.cancel()`) >= 0 && reset.indexOf(`${name}?.cancel()`) < reset.indexOf(`${name} = undefined`), name)
  }
  assert.doesNotMatch(source, /^const \w+ = new (?:Map|Set)\(/m)
  assert.match(register, /t\.length <= o\.receive_only_fragments_max_chars/)
  assert.match(register, /t\.length <= 40/)
  // Execute the emitted matcher body without requiring a TypeScript compiler.
  const suffix = source.match(/^const PHRASE_SUFFIX = Object\.freeze\(.+\)$/m)
  const helper = source.match(/^function matchesPhrase\(t: string, phrase: string\): boolean \{\n([\s\S]*?)^\}/m)
  assert.ok(suffix)
  assert.ok(helper)
  const matchesPhrase = new Function('t', 'phrase', suffix[0] + '\n' + helper[1])
  for (const [text, phrase] of [
    ['眠い', '眠い'],
    ['眠い…', '眠い'],
    ['一旦やめるね', '一旦やめる'],
    ['stop for now.', 'stop for now'],
    ['疲れた \nね・よ・な・わ・で・す！？', '疲れた'],
    ['眠い😴', '眠い'],
    ['疲れた😢', '疲れた'],
    ['眠いーっ', '眠い'],
    ['眠いぁぃぅぇぉっ', '眠い'],
    ['眠いよねかも', '眠い'],
    ['Stop for now.', 'stop for now'],
    ['That’s enough', "that's enough"],
    ["that's enough", '  That‘s enough  '],
    ['TIRED', 'tired'],
    ['ｔｉｒｅｄ', '  TIRED  '],
    ['tired' + ' !'.repeat(10), 'tired'],
  ]) assert.equal(matchesPhrase(text, phrase), true, JSON.stringify({ text, phrase }))
  for (const [text, phrase] of [
    ['', ''],
    ['はい', ''],
    ['はい', '   '],
    ['ね', '　'],
    ['これは眠い', '眠い'],
    ['tiredness', 'tired'],
    ['wrap up this function into a module', 'wrap up'],
    ['あとで見返せるように要約して', 'あとで'],
    ['眠いねよなわですか', '眠い'],
    ['眠いカタカナー', '眠い'],
    ['眠いぁぃぅぇぉっー', '眠い'],
    ['眠いｗ', '眠い'],
    ['眠い（笑）', '眠い'],
    ['tired lol', 'tired'],
    ['あとでテストして', 'あとで'],
    ['あとでやって', 'あとで'],
    ['あとでおしえて', 'あとで'],
    ['あとでメモして', 'あとで'],
    ['終わりました', '終わり'],
    ['終わりましたか', '終わり'],
    ['終わりにしないで', '終わり'],
    ['一旦やめるかどうか', '一旦やめる'],
    ['疲れたけどやる', '疲れた'],
    ['疲れたのでレビュー', '疲れた'],
  ]) assert.equal(matchesPhrase(text, phrase), false, JSON.stringify({ text, phrase }))
})

test('rule placeholders use proposal parameters, language names and optional character limits', () => {
  const catalog = structuredClone(recipes)
  catalog['response-language'].params.language.options.push('fr')
  const bundle = bundleFor(['lead-with-answer', 'response-language'], catalog)
  bundle.proposals[1].params.language = 'ja'
  const renderRules = () => {
    const files = emit(bundle, catalog)
    const fields = JSON.parse(files.get('plugin/.claude-plugin/plugin.json')).userConfig
    const o = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default]))
    const source = files.get('plugin/hooks/register.ts')
    return [...source.matchAll(/rules\.push\((.*)\)$/gm)]
      .map(([, expression]) => new Function('o', '"use strict"; return (' + expression + ')')(o))
  }
  assert.deepEqual(renderRules(), [
    'Lead with the answer; keep it under 9 lines.',
    'Use Japanese for the answer.',
  ])
  bundle.proposals[0].params.max_chars = 200
  assert.equal(renderRules()[0], 'Lead with the answer; keep it under 9 lines and within 200 characters.')
  bundle.proposals[1].params.language = 'en'
  assert.equal(renderRules()[1], 'Use English for the answer.')
  bundle.proposals[1].params.language = 'fr'
  assert.equal(renderRules()[1], 'Use fr for the answer.')
})

test('reports fence every quotation, lengthen fences, and render active markup inert', () => {
  const bundle = bundleFor()
  const markdown = emit(bundle).get('PROPOSALS.md')
  const { blocks, outside } = codeBlocks(markdown)
  for (const proposal of bundle.proposals) {
    for (const evidence of proposal.evidence) {
      const block = blocks.find(block => block.text === evidence.quote)
      assert.ok(block, `missing quoted line ${evidence.line}`)
      const longest = Math.max(0, ...(evidence.quote.match(/`+/g) ?? []).map(run => run.length))
      assert.ok(block.fence.length > longest)
      if (longest === 3) assert.equal(block.fence.length, 4)
      assert.ok(outside.includes(`line ${evidence.line} (§${evidence.section})`))
      assert.equal(outside.includes(evidence.matched), false)
    }
  }
  assert.doesNotMatch(outside, /<[a-z!\/]/i)
  assert.doesNotMatch(outside, /https?:\/\/|www\./i)
  assert.doesNotMatch(outside, /^\s{0,3}\[[^\]\n]+\]:/m)
  assert.doesNotMatch(outside, /src=x|\[l\]/)
  assert.doesNotMatch(outside, /\]\(https?:|!\[/i)
  assert.match(outside, /Counts are proxies/)
  assert.match(outside, /publish-guard protects Bash only/)
  assert.match(outside, /session-resume-brief stores only a time and a count/)
})

test('reports use the output basename and keep fenced content verbatim', () => {
  const expected = emit(bundleFor(), recipes, { outDirName: 'example' }).get('PROPOSALS.md')
  for (const outDirName of ['mods/example', '../mods/example/', '/private/mods/example', 'C:\\private\\mods\\example', 'mods\\example\\']) {
    assert.equal(emit(bundleFor(), recipes, { outDirName }).get('PROPOSALS.md'), expected)
  }
  const catalog = structuredClone(recipes)
  catalog['lead-with-answer'].evidence[0].ref = '<b>reference</b> https://catalog.invalid www.catalog.invalid [ref]: url'
  const markdown = emit(bundleFor(), catalog, { outDirName: 'mods/<example>&' }).get('PROPOSALS.md')
  const { blocks, outside } = codeBlocks(markdown)
  assert.ok(blocks[0].text.includes('/plugin marketplace add "<example>&/plugin"'))
  assert.doesNotMatch(blocks[0].text, /&(?:amp|lt|gt);/)
  assert.doesNotMatch(outside, /<[a-z!\/]|https?:\/\/|www\./i)
  assert.doesNotMatch(outside, /^\s{0,3}\[[^\]\n]+\]:/m)
  assert.ok(outside.includes('&lt;b&gt;'))
})

test('A8: repeated emission is byte-identical and leaves its inputs unchanged', () => {
  const bundle = bundleFor()
  const before = structuredClone(bundle)
  const first = emit(bundle)
  const second = emit(bundle)
  assert.deepEqual([...first], [...second])
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { readFileSync } from 'node:fs'
    const { moduleUrl, bundle, recipes } = JSON.parse(readFileSync(0, 'utf8'))
    const { emitPlugin } = await import(moduleUrl)
    process.stdout.write(JSON.stringify([...emitPlugin({ bundle, recipes })]))
  `], {
    input: JSON.stringify({ moduleUrl: new URL('../src/emit.mjs', import.meta.url).href, bundle, recipes }),
    env: { ...process.env, TZ: 'Pacific/Kiritimati', LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8', timeout: 30_000,
  })
  assert.ifError(child.error)
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(Buffer.from(child.stdout), Buffer.from(JSON.stringify([...first])))
  assert.ok([...first.values()].every(text => typeof text === 'string' && text.length > 0))
  assert.deepEqual(bundle, before)
})

test('writePluginFolder creates the files and returns sorted relative paths', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kokoro-mods-emit-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const files = emit()
  assert.deepEqual(await writePluginFolder(new Map([...files].reverse()), dir), PATHS)
  await Promise.all([...files].map(async ([path, text]) => assert.equal(await readFile(join(dir, path), 'utf8'), text)))
  await assert.rejects(writePluginFolder(new Map([['../escape', 'no']]), dir), /relative file path/)
})

test('claude validates and runs the full generated plugin', {
  skip: process.env.KOKORO_MODS_SKIP_CLAUDE === '1' ? 'KOKORO_MODS_SKIP_CLAUDE=1' : false,
}, async t => {
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 30_000 })
  if (version.error?.code === 'ENOENT') assert.fail('claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip')
  assert.ifError(version.error)
  assert.equal(version.status, 0, version.stderr)
  assert.match(version.stdout, /\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)
  const dir = await mkdtemp(join(tmpdir(), 'kokoro-mods-claude-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const [name, ids, expectedTests] of [['full', Object.keys(recipesWithStop), 10], ['focus-timer', ['focus-timer'], 3]]) {
    const outDir = join(dir, name)
    await writePluginFolder(emit(bundleFor(ids, recipesWithStop), recipesWithStop), outDir)
    const plugin = join(outDir, 'plugin')
    for (const args of [['plugin', 'validate', '--strict', plugin], ['plugin', 'test', plugin]]) {
      const result = spawnSync('claude', args, { encoding: 'utf8', timeout: 60_000 })
      if (result.error?.code === 'ENOENT') assert.fail('claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip')
      assert.ifError(result.error)
      assert.equal(result.status, 0, `${name}: ${args.slice(0, -1).join(' ')} failed\n${result.stdout}\n${result.stderr}`)
      if (args[1] === 'test') {
        const stdout = result.stdout.replace(/\x1b\[[0-9;]*m/g, '')
        const summary = stdout.match(/\b(\d+)\s+(?:tests?\s+)?pass(?:ed)?\b/i)
          ?? stdout.match(/^\s*#?\s*pass(?:ed)?\s+(\d+)\s*$/mi)
          ?? stdout.match(/\b(\d+)\s+tests?\b/i)
        assert.ok(summary, `${name}: missing test count in stdout\n${stdout}`)
        assert.equal(Number(summary[1]), expectedTests, stdout)
      }
    }
  }
})
