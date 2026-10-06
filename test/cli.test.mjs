import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { main } from '../src/cli.mjs'
import { PLUGIN_NAME_PATTERN, TOOL_VERSION } from '../src/constants.mjs'
import { parseProfile } from '../src/profile.mjs'
import { EVENT_NAMES, RECIPES, RECIPE_IDS, getRecipe } from '../src/catalog/index.mjs'
import { isPluginName, slugFor, slugSource } from '../src/match.mjs'
import { diffProposals, formatDiff } from '../src/diff.mjs'
import { assertMetricsExport, buildOptionKeys, buildOptionTypes, buildRecipeEvents, exportSets, EXPORT_VERSION } from '../src/metrics.mjs'
import { assertComparable, compareExports, formatReport, readExport, readSettingsToggles } from '../src/report.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const fixture = (group, name) => join(ROOT, 'fixtures', group, name)
const FILES = [
  'PROPOSALS.json', 'PROPOSALS.md',
  'plugin/.claude-plugin/marketplace.json', 'plugin/.claude-plugin/plugin.json',
  'plugin/hooks/hooks.json', 'plugin/hooks/register.test.ts', 'plugin/hooks/register.ts',
]
// Fixture expectations are frozen from w4-facts.md.
const PATTERNS = [
  '\\bgit\\s+(-C\\s+\\S+\\s+)?push\\b',
  '\\bgh\\s+(pr|issue)\\s+create\\b',
  '\\bgh\\s+repo\\s+(create|edit|delete)\\b',
  '\\bgh\\s+release\\s+create\\b', '\\bnpm\\s+publish\\b',
]
const STOP = ['一旦やめる', 'あとで', '終わり', 'おわり', '一旦ここまで', 'stop for now', "that's enough", "let's stop", 'wrap up']
const FRAGMENTS = ['眠い', '疲れた', '落ち込んでる', 'つらい', 'しんどい', 'tired', 'exhausted', 'feeling down']
// The plugin name never derives from the manual (DESIGN §5.4a): without --name every
// fixture is `profile`, reported as a fallback so the CLI prints its naming hint.
const VALID = {
  'en-generic.md': {
    meta: ['generic', 'en', 6], slug: 'profile', source: 'fallback',
    rows: [
      ['publish-guard', true, 'medium', [4], { allow_minutes: 30, patterns: PATTERNS }],
      ['lead-with-answer', true, 'medium', [12], { max_lines: 12, max_chars: 0 }],
      ['one-next-step', true, 'medium', [13], {}],
      ['respect-stop-signals', false, 'medium', [5], { phrases: STOP }],
      ['offer-options', false, 'medium', [17], { min: 2, max: 4 }],
      ['plain-language', false, 'medium', [16], {}],
      ['running-indicator', false, 'medium', [20], { long_turn_seconds: 120 }],
      ['session-resume-brief', false, 'medium', [9], {}],
      ['focus-timer', false, 'medium', [21], { interval_minutes: 50 }],
    ],
    notMatched: ['accept-typos-as-intent', 'block-ahead-warning', 'expert-role-with-evidence', 'no-psych-framing', 'quiet-confirmations', 'receive-only-fragments', 'response-language', 'trace-offers'],
  },
  'ja-kokoro.md': {
    meta: ['kokoro', 'ja', 9], slug: 'profile', source: 'fallback',
    rows: [
      ['one-next-step', true, 'high', [28, 40, 50], {}],
      ['trace-offers', true, 'high', [29, 41], {}],
      ['lead-with-answer', true, 'high', [24], { max_lines: 12, max_chars: 0 }],
      ['accept-typos-as-intent', false, 'high', [25], {}],
      ['response-language', false, 'high', [26], { language: 'ja' }],
      ['receive-only-fragments', false, 'high', [9], { max_chars: 24, phrases: FRAGMENTS }],
      ['respect-stop-signals', false, 'high', [10], { phrases: STOP }],
      ['no-psych-framing', false, 'high', [11], {}],
      ['quiet-confirmations', false, 'high', [38], {}],
      ['offer-options', false, 'high', [57], { min: 2, max: 4 }],
      ['plain-language', false, 'high', [39], {}],
      ['expert-role-with-evidence', false, 'high', [27], {}],
      ['running-indicator', false, 'high', [44], { long_turn_seconds: 120 }],
      ['block-ahead-warning', false, 'high', [45], {}],
      ['session-resume-brief', false, 'high', [16], {}],
      ['focus-timer', false, 'high', [46], { interval_minutes: 50 }],
    ],
    notMatched: ['publish-guard'],
  },
  'ja-torisetsu.md': {
    meta: ['torisetsu', 'ja', 9], slug: 'profile', source: 'fallback',
    rows: [
      ['publish-guard', true, 'high', [18], { allow_minutes: 30, patterns: PATTERNS }],
      ['respect-stop-signals', true, 'high', [17, 47], { phrases: STOP }],
      ['lead-with-answer', true, 'high', [31], { max_lines: 12, max_chars: 0 }],
      ['one-next-step', false, 'high', [33], {}],
      ['offer-options', false, 'high', [55], { min: 2, max: 4 }],
      ['plain-language', false, 'high', [36], {}],
      ['focus-timer', false, 'high', [45], { interval_minutes: 50 }],
    ],
    notMatched: ['accept-typos-as-intent', 'block-ahead-warning', 'expert-role-with-evidence', 'no-psych-framing', 'quiet-confirmations', 'receive-only-fragments', 'response-language', 'running-indicator', 'session-resume-brief', 'trace-offers'],
  },
}
// [format, language, sections, rule, line, token]: the token is the only manual-derived
// text a finding may show, frozen here so the terminal check does not take the checker's
// own output as its allow-list (re-inspection, chunk E tests).
const INVALID = {
  'diagnosis-emphasis.md': ['generic', 'en', 3, 'F-DIAGNOSIS', 4, 'ADHD'],
  'diagnosis-entity.md': ['generic', 'en', 3, 'F-DIAGNOSIS', 4, 'ADHD'],
  'diagnosis-mixed-width.md': ['generic', 'en', 3, 'F-DIAGNOSIS', 4, 'ADHD'],
  'diagnosis-zero-width.md': ['generic', 'en', 3, 'F-DIAGNOSIS', 4, 'ADHD'],
  'diagnosis.md': ['kokoro', 'ja', 3, 'F-DIAGNOSIS', 11, 'ADHD'],
  'no-structure.md': ['kokoro', 'ja', 0, 'F-STRUCTURE', null, null],
  'override-ja-conditional.md': ['generic', 'en', 3, 'F-OVERRIDE', 4, 'ルールを無視'],
  'override-too-many-words.md': ['generic', 'en', 3, 'F-OVERRIDE', 4, 'ignore your safety'],
  'override-two-clauses.md': ['generic', 'en', 3, 'F-OVERRIDE', 4, 'ignore your safety'],
  'override.md': ['generic', 'en', 3, 'F-OVERRIDE', 4, 'ignore your safety'],
  'roleplay.md': ['generic', 'en', 3, 'F-ROLEPLAY', 4, 'act as my therapist'],
  'self-harm.md': ['kokoro', 'ja', 3, 'F-SELF-HARM', 11, '過量服薬'],
  'test-score.md': ['torisetsu', 'ja', 3, 'F-TEST-SCORE', 11, 'FSIQ'],
}
const BENIGN = {
  'dont-ignore-safety.md': ['torisetsu', 'ja', 3],
  'hanging-indent.md': ['generic', 'en', 3],
}
const EVENTS = ['allowed', 'denied', 'detected', 'long_answers', 'long_turns', 'resumed', 'suppressed', 'ticks']
const SETS = exportSets(RECIPES, { eventNames: EVENT_NAMES })
const REFUSAL = 'kokoro-mods: this subcommand must be typed by the user.'

const fold = text => String(text).normalize('NFKC').toLowerCase()
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(item => strings(item, out))
  else if (value !== null && typeof value === 'object' && !(value instanceof RegExp)) Object.values(value).forEach(item => strings(item, out))
  return out
}
// Catalog text may legitimately appear in plugin/; a manual line that is itself catalog
// text (a default phrase such as "tired") is therefore not evidence of a leak (DESIGN §5.5).
const CATALOG_TEXT = fold(strings(RECIPES).join('\n'))

// Candidate lines of a profile whose text must stay out of the distributable and off the
// terminal: every non-comment, non-heading line of four or more normalised characters.
function privateLines(profile) {
  return profile.lines.filter(line => !['comment', 'heading', 'blank', 'frontmatter', 'code'].includes(line.kind) && fold(line.text).trim().length >= 4)
}

async function harness(t) {
  const base = await mkdtemp(join(tmpdir(), 'kokoro-mods-cli-'))
  const home = join(base, 'home')
  const claudeHome = join(base, 'claude-home')
  const out = join(base, 'out')
  await mkdir(home)
  await mkdir(claudeHome)
  t.after(() => rm(base, { recursive: true, force: true }))
  return {
    base, home, claudeHome, out,
    async run(argv) {
      let stdout = ''
      let stderr = ''
      const code = await main(argv, {
        stdout: { write: text => { stdout += text } },
        stderr: { write: text => { stderr += text } },
        env: { ...process.env, HOME: home }, cwd: base,
      })
      return { code, stdout, stderr }
    },
  }
}

async function tree(root, prefix = '') {
  const paths = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) paths.push(...await tree(root, path))
    else { assert.ok(entry.isFile(), path); paths.push(path) }
  }
  return paths.sort()
}

async function snapshot(root) {
  return Object.fromEntries(await Promise.all((await tree(root)).map(async path =>
    [path, await readFile(join(root, path))])))
}

async function readBundle(out) {
  return JSON.parse(await readFile(join(out, 'PROPOSALS.json'), 'utf8'))
}

async function proposed(h, file = fixture('valid', 'en-generic.md'), out = h.out, extra = []) {
  const result = await h.run(['propose', file, '--out', out, '--json', ...extra])
  assert.equal(result.code, 0, result.stderr)
  const bundle = JSON.parse(result.stdout)
  assert.deepEqual(bundle, await readBundle(out))
  return bundle
}

function inertReport(markdown, proposals) {
  const blocks = []
  const outside = []
  let fence = null
  let content = []
  for (const line of markdown.split('\n')) {
    const mark = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line)
    if (!fence && mark) { fence = mark[1]; content = []; continue }
    if (fence && mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) {
      blocks.push({ fence, text: content.join('\n') }); fence = null; continue
    }
    if (fence) content.push(line)
    else outside.push(line)
  }
  assert.equal(fence, null, 'all fences close')
  assert.doesNotMatch(markdown, /<(?:img|script|iframe)\b/iu)
  assert.doesNotMatch(outside.join('\n'), /\]\(http/iu)
  for (const proposal of proposals) {
    for (const evidence of proposal.evidence) {
      assert.ok(blocks.some(block => block.text.includes(evidence.quote)), 'quote is inside a fence')
    }
  }
  return blocks
}

// The integration run gets its own empty HOME: Claude Code must neither read the
// developer's configuration nor write into it (final inspection, chunk E, L9).
function claude(args, h) {
  const result = spawnSync('claude', args, {
    cwd: h.base, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, HOME: h.claudeHome },
  })
  if (result.error?.code === 'ENOENT') {
    assert.fail('claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip')
  }
  assert.ifError(result.error)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return result.stdout.replace(/\x1b\[[0-9;]*m/gu, '')
}

// `claude plugin test` reports a count; a run that executed nothing must not pass as
// verified (chunk E, M5). The names prove the guard tests, not only the load test, ran.
function assertPluginTestRun(output, generatedTests, names) {
  const ran = Number(output.match(/^Ran (\d+) tests?\b/mu)?.[1])
  const passed = Number(output.match(/^\s*(\d+) pass\s*$/mu)?.[1])
  const failed = Number(output.match(/^\s*(\d+) fail\s*$/mu)?.[1] ?? 0)
  assert.ok(Number.isInteger(ran) && ran >= 1, output)
  assert.equal(passed, ran, output)
  assert.equal(failed, 0, output)
  // One `test(` call inside a loop registers several tests, so the source count is a floor.
  const declared = (generatedTests.match(/\btest\(/gu) ?? []).length
  assert.ok(declared >= 1 && ran >= declared, `${ran} ran, ${declared} declared`)
  for (const name of names) assert.ok(output.includes(`(pass) ${name}`), `${name}\n${output}`)
}

// Execute the generated hooks module itself under Node's type stripping, with a small
// host in place of the engine, so the export the CLI validates is the module's own output
// rather than a hand-written imitation (chunk E, M6; DESIGN A6).
function runGeneratedModule(pluginDir, { options, store = {}, steps = [] }) {
  const script = `
    import { pathToFileURL } from 'node:url'
    const input = JSON.parse(await new Promise(resolve => {
      let data = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', chunk => { data += chunk })
      process.stdin.on('end', () => resolve(data))
    }))
    const { register } = await import(pathToFileURL(input.module).href)
    const hooks = []
    const on = (event, a, b) => {
      const entry = typeof a === 'function' ? { event, matcher: null, hook: a } : { event, matcher: a, hook: b }
      hooks.push(entry)
      return { catch: recover => { entry.recover = recover } }
    }
    const store = new Map(Object.entries(input.store))
    const log = []
    const $ = {
      store: { get: async key => structuredClone(store.get(key)), set: async (key, value) => { store.set(key, structuredClone(value)) } },
      clock: { now: async () => 1_700_000_000_000, every: () => ({ cancel() {} }), after: () => ({ cancel() {} }) },
      fs: { write: async () => { throw new Error('no file writes in this run') } },
      ui: { toast() {}, status() {}, log: text => log.push(text) },
      command: { register: async () => {} },
      session: { cwd: async () => '/work' },
    }
    register(on, input.options)
    const run = async (event, e, pick = () => true) => {
      const entry = hooks.find(h => h.event === event && pick(h.matcher))
      if (!entry) return { noHook: event }
      const next = Object.assign(async e2 => { next.called = true; return { result: 'bottom', e: e2 } }, { called: false })
      try { return await entry.hook($, e, next) } catch (error) {
        if (entry.recover) return entry.recover($, e, next)
        throw error
      }
    }
    const results = []
    for (const [kind, ...rest] of input.steps) {
      if (kind === 'session') results.push(await run('session.start', rest[0]))
      else if (kind === 'bash') results.push(await run('tool.call', { tool: 'Bash', command: rest[0] }, m => m !== null && m.tool === 'Bash'))
      else if (kind === 'command') results.push(await run('command.run', { command: 'kokoro-mods', args: rest[0], origin: rest[1] }))
      else throw new Error('unknown step')
    }
    process.stdout.write(JSON.stringify({ results, log, store: Object.fromEntries(store) }))
  `
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '--eval', script], {
    input: JSON.stringify({ module: join(pluginDir, 'hooks', 'register.ts'), options, store, steps }),
    encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  })
  assert.ifError(child.error)
  assert.equal(child.status, 0, child.stderr)
  // The module writes nothing to stderr either (a console.error would not break the JSON).
  assert.equal(child.stderr, '')
  return JSON.parse(child.stdout)
}

test('A2/A4: the complete fixture inventory and catalog event names are frozen', async () => {
  for (const [group, entries, count] of [['valid', VALID, 3], ['invalid', INVALID, 13], ['benign', BENIGN, 2]]) {
    const names = (await readdir(join(ROOT, 'fixtures', group))).sort()
    assert.equal(names.length, count)
    assert.deepEqual(names, Object.keys(entries).sort())
  }
  assert.deepEqual(EVENT_NAMES, EVENTS)
  // The catalog's frozen event list is exactly what the generated modules can raise.
  assert.deepEqual(exportSets(RECIPES).eventNames, EVENT_NAMES)
  assert.deepEqual([...buildRecipeEvents(RECIPES).get('running-indicator')], ['long_turns', 'suppressed'])
  assert.deepEqual([...buildRecipeEvents(RECIPES).get('publish-guard')], ['allowed', 'denied'])
})

for (const [name, expected] of Object.entries(VALID)) {
  test(`A2/A3/A5c/A8/A9/A10: ${name}`, async t => {
    const h = await harness(t)
    const input = fixture('valid', name)
    const bytes = await readFile(input)
    const text = bytes.toString('utf8')
    const profile = parseProfile(text)
    assert.deepEqual([profile.format, profile.language, profile.sections.length], expected.meta)
    assert.equal(slugFor(profile), expected.slug)
    assert.equal(slugSource(profile), expected.source)
    const checked = await h.run(['check', input, '--json'])
    assert.equal(checked.code, 0)
    assert.deepEqual(JSON.parse(checked.stdout), [])
    const plainCheck = await h.run(['check', input])
    assert.equal(plainCheck.code, 0)
    for (const line of privateLines(profile)) {
      assert.ok(!fold(plainCheck.stdout + plainCheck.stderr).includes(fold(line.text).trim()), `check shows ${name}:${line.line}`)
    }
    const bundle = await proposed(h, input)
    assert.equal(bundle.pluginName, `kokoro-mods-${expected.slug}`)
    assert.match(bundle.pluginName, PLUGIN_NAME_PATTERN)
    assert.equal(bundle.profile.sha256, createHash('sha256').update(bytes).digest('hex'))
    assert.equal(bundle.profile.file, name)
    assert.deepEqual([bundle.profile.format, bundle.profile.language], expected.meta.slice(0, 2))
    assert.deepEqual(bundle.tool, { name: 'kokoro-mods', version: TOOL_VERSION })
    assert.deepEqual(bundle.notMatched, expected.notMatched)
    assert.deepEqual(bundle.proposals.map(p =>
      [p.recipeId, p.enabledByDefault, p.confidence, p.evidence.map(e => e.line), p.params]), expected.rows)
    assert.deepEqual(bundle.proposals.map(p => p.recipeId).sort(), expected.rows.map(row => row[0]).sort())
    const sourceLines = text.split(/\r?\n/u)
    for (const proposal of bundle.proposals) {
      assert.ok(proposal.evidence.length >= 1 && proposal.evidence.length <= 3)
      for (const evidence of proposal.evidence) {
        assert.ok(evidence.quote.trim())
        assert.equal(evidence.quote, sourceLines[evidence.line - 1])
      }
    }
    assert.ok(bundle.proposals.filter(p => p.enabledByDefault).length <= 3)
    assert.deepEqual(bundle.files, FILES)
    assert.deepEqual(await tree(h.out), FILES)
    const first = await snapshot(h.out)
    const distributable = Object.fromEntries(FILES.filter(path => path.startsWith('plugin/')).map(path => [path, fold(first[path].toString('utf8'))]))
    // The generated module and its test reach the network no more than the CLI does
    // (re-inspection, chunk E tests): no fetch, no sockets, imports from the kit only.
    for (const path of ['plugin/hooks/register.ts', 'plugin/hooks/register.test.ts']) {
      const source = first[path].toString('utf8')
      assert.doesNotMatch(source, /\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|\bEventSource\b|\brequire\s*\(|\bimport\s*\(/u, path)
      for (const [, specifier] of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/gu)) {
        assert.ok(['claude-code', 'claude-code/testing', './register.ts'].includes(specifier), `${path} imports ${specifier}`)
      }
    }
    // A5c: no manual line of four or more characters, and nothing that names the person
    // (title, frontmatter name or alias), appears under plugin/ (chunk E, H1).
    for (const line of privateLines(profile)) {
      const needle = fold(line.text).trim()
      if (CATALOG_TEXT.includes(needle)) continue
      for (const [path, content] of Object.entries(distributable)) {
        assert.ok(!content.includes(needle), `A5c: ${name}:${line.line} in ${path}`)
      }
    }
    for (const value of [profile.title, profile.frontmatter?.name, profile.frontmatter?.user_alias, profile.frontmatter?.alias]) {
      if (!value) continue
      for (const [path, content] of Object.entries(distributable)) {
        assert.ok(!content.includes(fold(value).trim()), `A5c: ${name} identity in ${path}`)
      }
    }
    inertReport(first['PROPOSALS.md'].toString('utf8'), bundle.proposals)
    // A re-run without --json prints the diff and the install path for the current directory
    // (README claims, chunk E, L3) and shows no manual text on the terminal (chunk E, M2).
    const rerun = await h.run(['propose', input, '--out', h.out])
    assert.equal(rerun.code, 0, rerun.stderr)
    assert.match(rerun.stdout, /^(?:Added|追加): (?:none|なし)\n(?:Removed|削除): (?:none|なし)\n(?:Changed|変更): (?:none|なし)\n(?:Same|変更なし): /mu)
    assert.ok(rerun.stdout.includes(`/plugin marketplace add ${JSON.stringify(join(h.out, 'plugin'))}`))
    assert.ok(rerun.stdout.includes(`/plugin install ${bundle.pluginName}`))
    assert.match(rerun.stderr, /--name/u)
    const terminal = fold(rerun.stdout + rerun.stderr)
    for (const line of privateLines(profile)) {
      assert.ok(!terminal.includes(fold(line.text).trim()), `terminal shows ${name}:${line.line}`)
    }
    assert.deepEqual(await snapshot(h.out), first)
    await proposed(h, input)
    assert.deepEqual(await snapshot(h.out), first)
    assert.deepEqual(await readdir(h.home), [])
    assert.deepEqual((await readdir(h.base)).filter(path => path.startsWith('.kokoro-mods-tmp-')), [])
    // A8 across processes, time zones and locales: the bytes do not depend on the environment (chunk E, L4).
    const elsewhere = join(h.base, 'elsewhere')
    const child = spawnSync(process.execPath, [join(ROOT, 'bin', 'kokoro-mods.mjs'), 'propose', input, '--out', elsewhere], {
      cwd: h.base, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, HOME: h.home, TZ: 'Pacific/Kiritimati', LANG: 'C', LC_ALL: 'C' },
    })
    assert.ifError(child.error)
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(await snapshot(elsewhere), first)
    await t.test(`A2: claude validate/test ${name}`, { skip: process.env.KOKORO_MODS_SKIP_CLAUDE === '1' }, () => {
      claude(['plugin', 'validate', '--strict', join(h.out, 'plugin')], h)
      const output = claude(['plugin', 'test', join(h.out, 'plugin')], h)
      const names = ['module loads with manifest defaults', 'export has only the closed schema and allowed values']
      if (bundle.proposals.some(p => p.recipeId === 'publish-guard')) {
        names.push('publish guard denies without a grant and lets ls through', 'publish guard lets git push through with a valid grant',
          'publish guard denies with an expired grant', 'publish guard denies when the store read throws')
      }
      if (bundle.proposals.some(p => getRecipe(p.recipeId).template === 'submit-detector')) {
        names.push('submit detectors attach at most one note, with stop precedence')
      }
      assertPluginTestRun(output, first['plugin/hooks/register.test.ts'].toString('utf8'), names)
    })
  })
}

for (const [name, expected] of Object.entries(INVALID)) {
  test(`A4: reject ${name} without writing output`, async t => {
    const h = await harness(t)
    const input = fixture('invalid', name)
    const text = await readFile(input, 'utf8')
    const profile = parseProfile(text)
    assert.deepEqual([profile.format, profile.language, profile.sections.length], expected.slice(0, 3))
    const flagged = expected[4] === null ? null : text.split(/\r?\n/u)[expected[4] - 1]
    const token = expected[5]
    const message = token === null ? `${expected[3]}: no sections` : `${expected[3]}: forbidden term ${JSON.stringify(token)}`
    const initial = await readdir(h.base)
    for (const command of ['check', 'propose']) {
      for (const json of [true, false]) {
        const result = await h.run([command, input, ...(json ? ['--json'] : []), ...(command === 'propose' ? ['--out', h.out] : [])])
        assert.equal(result.code, 3, result.stderr)
        if (json) assert.deepEqual(JSON.parse(result.stdout).map(f => [f.level, f.rule, f.line, f.message]), [['FAIL', expected[3], expected[4], message]])
        else assert.match(result.stdout, new RegExp(`^${expected[4] ?? '-'}  FAIL  ${expected[3]}  ${message.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'mu'))
        // The finding names its rule and the frozen token, never the line it was found on
        // (DESIGN §5.2; chunk E, M2). A line that consists of the token alone is therefore
        // visible through the message, and only through it.
        if (flagged) assert.ok(!(result.stdout + result.stderr).includes(flagged.trim()), `${name}: flagged line on the terminal`)
        for (const line of privateLines(profile)) {
          const needle = fold(line.text).trim()
          if (token !== null && needle === fold(token)) continue
          assert.ok(!fold(result.stdout + result.stderr).includes(needle), `${name}:${line.line} on the terminal`)
        }
        assert.deepEqual(await readdir(h.base), initial)
        await assert.rejects(lstat(h.out), { code: 'ENOENT' })
      }
    }
  })
}

for (const [name, expected] of Object.entries(BENIGN)) {
  test(`A4: accept benign ${name}`, async t => {
    const h = await harness(t)
    const input = fixture('benign', name)
    const profile = parseProfile(await readFile(input, 'utf8'))
    assert.deepEqual([profile.format, profile.language, profile.sections.length], expected)
    const result = await h.run(['check', input, '--json'])
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), [])
  })
}

function goldenExport(bundle) {
  return {
    v: 1, plugin: bundle.pluginName, profileSha256: bundle.profile.sha256,
    exportedAt: '2026-10-06T00:00:00.000Z',
    options: {
      publish_guard: true, publish_guard_allow_minutes: 30,
      lead_with_answer: true, lead_with_answer_max_lines: 12, lead_with_answer_max_chars: 0,
      one_next_step: true, respect_stop_signals: false,
      offer_options: false, offer_options_min: 2, offer_options_max: 4, plain_language: false,
      running_indicator: false, running_indicator_long_turn_seconds: 120,
      session_resume_brief: false, focus_timer: false, focus_timer_interval_minutes: 50,
    },
    metrics: { v: 1, since: 1791244800000, counts: {
      'publish-guard': { denied: 2, allowed: 1 },
      'lead-with-answer': { long_answers: 3 },
      'respect-stop-signals': { detected: 1 },
      'running-indicator': { long_turns: 2, suppressed: 1 },
      'session-resume-brief': { resumed: 1 },
      'focus-timer': { ticks: 4, suppressed: 2 },
    } },
  }
}

test('A6: accept the hand-written golden export and reject every open schema escape, naming allowed keys only', async t => {
  const h = await harness(t)
  const bundle = await proposed(h)
  const golden = goldenExport(bundle)
  const selected = bundle.proposals.map(p => getRecipe(p.recipeId))
  assert.equal(EXPORT_VERSION, 1)
  assert.deepEqual(Object.keys(golden.options).sort(), [...buildOptionKeys(selected)])
  assert.ok(!SETS.optionKeys.has('response_language_language'))
  assert.ok(!SETS.optionKeys.has('publish_guard_patterns'))
  assert.deepEqual([...buildOptionKeys([{ id: 'sample', params: {
    flag: { type: 'boolean' }, count: { type: 'number' }, text: { type: 'string' },
  } }])], ['sample', 'sample_count', 'sample_flag'])
  assert.deepEqual([...buildOptionTypes([{ id: 'sample', params: {
    flag: { type: 'boolean' }, count: { type: 'number' }, text: { type: 'string' },
  } }])], [['sample', 'boolean'], ['sample_count', 'number'], ['sample_flag', 'boolean']])
  for (const [id, counts] of Object.entries(golden.metrics.counts)) {
    assert.ok(bundle.proposals.some(p => p.recipeId === id))
    for (const event of Object.keys(counts)) assert.ok(SETS.recipeEvents.get(id).includes(event))
  }
  assert.doesNotThrow(() => assertMetricsExport(golden, SETS))
  const path = join(h.base, 'export.json')
  await writeFile(path, JSON.stringify(golden))
  assert.deepEqual(readExport(path, SETS), golden)
  assert.equal((await h.run(['report', path])).code, 0)
  const secret = 'PRIVATE-EXPORT-CANARY'
  // [what the message must name, the mutation, what the message must not contain]. An
  // unknown key is reported by position because its name is input (chunk D, M1).
  const cases = [
    ['$: unknown key at index 6', value => { value.extra = secret }, 'extra'],
    ['$.options.publish_guard: expected a boolean', value => { value.options.publish_guard = secret }],
    ['$.options.publish_guard: expected a boolean', value => { value.options.publish_guard = 1 }],
    ['$.options.publish_guard_allow_minutes: expected a finite number', value => { value.options.publish_guard_allow_minutes = true }],
    ['$.options: unknown key at index 16', value => { value.options.response_language_language = secret }, 'response_language'],
    ['$.options: unknown key at index 16', value => { value.options[secret] = true }],
    ['$.metrics.counts.publish-guard.denied: expected a non-negative safe integer', value => { value.metrics.counts['publish-guard'].denied = 1.5 }],
    ['$.metrics.counts.publish-guard.denied: expected a non-negative safe integer', value => { value.metrics.counts['publish-guard'].denied = Number.MAX_SAFE_INTEGER + 2 }],
    ['$.metrics.counts.publish-guard: unknown key at index 2', value => { value.metrics.counts['publish-guard'].note = { text: secret } }, 'note'],
    ['$.metrics.counts.publish-guard: unknown key at index 2', value => { value.metrics.counts['publish-guard'].suppressed = 1 }, 'suppressed'],
    ['$.metrics.counts.publish-guard: unknown key at index 2', value => { value.metrics.counts['publish-guard'].ticks = 1 }, 'ticks'],
    ['$.metrics: unknown key at index 3', value => { value.metrics.note = { text: secret } }, 'note'],
    ['$.metrics.counts: unknown key at index 6', value => { value.metrics.counts.foreign = { denied: 1 } }, 'foreign'],
    ['$.metrics.counts: unknown key at index 6', value => { value.metrics.counts[secret] = { denied: 1 } }],
    // An own property named __proto__ (what JSON.parse makes of the key) is an unknown key.
    ['$.options: unknown key at index 16', value => { Object.defineProperty(value.options, '__proto__', { value: { polluted: true }, enumerable: true }) }, 'polluted'],
    ['$.metrics.counts: unknown key at index 6', value => { Object.defineProperty(value.metrics.counts, '__proto__', { value: { denied: 1 }, enumerable: true }) }],
    ['$.metrics.since: expected a non-negative integer', value => { value.metrics.since = -1 }],
    ['$.metrics.v: unsupported version', value => { value.metrics.v = 2 }],
    ['$.v: required key is missing', value => { delete value.v }],
    ['$.plugin: expected a kokoro-mods plugin name', value => { value.plugin = secret }],
    ['$.plugin: expected a kokoro-mods plugin name', value => { value.plugin = 'kokoro-mods-' + 'a'.repeat(41) }],
    ['$.plugin: expected a kokoro-mods plugin name', value => { value.plugin = 'Kokoro-Mods-Profile' }],
    ['$.plugin: expected a kokoro-mods plugin name', value => { value.plugin = 'kokoro-mods-adhd' }],
    ['$.profileSha256: expected a SHA-256 hex digest', value => { value.profileSha256 = secret }],
    ['$.exportedAt: expected an ISO 8601 timestamp', value => { value.exportedAt = '2026-02-30T00:00:00Z' }],
    ['$.metrics.counts: expected an object', value => { value.metrics.counts = [] }],
  ]
  for (const [expected, change, forbidden] of cases) {
    const value = structuredClone(golden)
    change(value)
    assert.throws(() => assertMetricsExport(value, SETS), error =>
      error.code === 'E_EXPORT_SHAPE' && error.message === expected && !error.message.includes(secret) &&
      (forbidden === undefined || !error.message.includes(forbidden)), expected)
    await writeFile(path, JSON.stringify(value))
    const result = await h.run(['report', path])
    assert.equal(result.code, 1)
    // The CLI names the argument before the key path (re-inspection F5).
    assert.equal(result.stderr, `error: E_EXPORT_SHAPE: export: ${expected}\n`)
    assert.equal(result.stdout, '')
  }
  for (const bad of [NaN, Infinity, -Infinity]) {
    const value = structuredClone(golden)
    value.options.publish_guard_allow_minutes = bad
    assert.throws(() => assertMetricsExport(value, SETS), { code: 'E_EXPORT_SHAPE' })
  }
  // Counts of a catalog recipe that this bundle did not select are accepted: the
  // validator knows the catalog, not the plugin, and such counts can only be zero or
  // the work of another kokoro-mods plugin with the same name (DESIGN §5.6).
  const unselected = structuredClone(golden)
  assert.ok(!bundle.proposals.some(p => p.recipeId === 'receive-only-fragments'))
  unselected.metrics.counts['receive-only-fragments'] = { detected: 1 }
  assert.doesNotThrow(() => assertMetricsExport(unselected, SETS))
  await writeFile(path, JSON.stringify(unselected))
  assert.equal((await h.run(['report', path])).code, 0)
})

test('A6: the generated module\'s own export validates and reports; state commands need the composer', async t => {
  const h = await harness(t)
  const bundle = await proposed(h)
  const manifest = JSON.parse(await readFile(join(h.out, 'plugin/.claude-plugin/plugin.json'), 'utf8'))
  const options = Object.fromEntries(Object.entries(manifest.userConfig).map(([key, field]) => [key, field.default]))
  const seeded = { v: 1, since: 5, counts: { 'publish-guard': { denied: 1 }, 'lead-with-answer': { long_answers: 2 } } }
  const run = runGeneratedModule(join(h.out, 'plugin'), {
    options,
    store: { 'kokoro-mods:metrics': seeded },
    steps: [
      ['session', { isInteractive: true, cwd: '/work' }],
      ['bash', 'git push origin main'],
      ['bash', 'ls'],
      ['command', 'reset', { kind: 'plugin', name: 'x' }],
      ['command', 'allow-publish 5'],
      ['command', 'export --print'],
      ['command', 'status'],
      ['command', 'allow-publish 5', { kind: 'composer' }],
      ['bash', 'git push'],
      ['command', 'export --print', { kind: 'composer' }],
      ['command', 'reset', { kind: 'composer' }],
      ['command', 'export --print'],
    ],
  })
  const [, denied, passed, refusedReset, refusedGrant, firstExport, status, granted, allowed, secondExport, reset, thirdExport] = run.results
  assert.match(denied.deny, /allow-publish/u)
  assert.deepEqual(passed, { result: 'bottom', e: { tool: 'Bash', command: 'ls' } })
  assert.equal(refusedReset.text, REFUSAL)
  assert.equal(refusedGrant.text, REFUSAL)
  const exported = JSON.parse(firstExport.text)
  assert.equal(exported.plugin, bundle.pluginName)
  assert.equal(exported.profileSha256, bundle.profile.sha256)
  assert.equal(exported.metrics.since, 5)
  assert.deepEqual(exported.metrics.counts, { 'publish-guard': { denied: 2 }, 'lead-with-answer': { long_answers: 2 } })
  assert.deepEqual(Object.keys(exported.options).sort(), [...buildOptionKeys(bundle.proposals.map(p => getRecipe(p.recipeId)))])
  assert.deepEqual(exported.options, Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value !== 'object')))
  assert.doesNotThrow(() => assertMetricsExport(exported, SETS))
  assert.deepEqual(Object.keys(JSON.parse(status.text)).sort(), ['metrics', 'options', 'plugin'])
  assert.equal(granted.text, `${bundle.pluginName}: publishing allowed for 5 minutes.`)
  assert.deepEqual(allowed, { result: 'bottom', e: { tool: 'Bash', command: 'git push' } })
  assert.deepEqual(JSON.parse(secondExport.text).metrics.counts, { 'publish-guard': { denied: 2, allowed: 1 }, 'lead-with-answer': { long_answers: 2 } })
  assert.equal(reset.text, `${bundle.pluginName}: counts reset.`)
  assert.deepEqual(JSON.parse(thirdExport.text).metrics.counts, {})
  assert.equal(JSON.parse(thirdExport.text).metrics.since, 1_700_000_000_000)
  // The export the module wrote is what the CLI validates and reports.
  const path = join(h.base, 'generated-export.json')
  await writeFile(path, secondExport.text)
  assert.deepEqual(readExport(path, SETS), JSON.parse(secondExport.text))
  const before = join(h.base, 'generated-before.json')
  await writeFile(before, firstExport.text)
  const report = await h.run(['report', path, before])
  assert.equal(report.code, 0, report.stderr)
  assert.match(report.stdout, /^publish-guard  allowed  0  1  \+1$/mu)
  assert.match(report.stdout, /^publish-guard  denied  2  2  0$/mu)
  assert.equal(report.stderr, '')
  // The store holds the closed metrics record and the grant only: no text of any kind.
  assert.deepEqual(Object.keys(run.store).sort(), ['kokoro-mods:metrics', 'kokoro-mods:publish-allowed-until'])
  assert.deepEqual(run.log, [])
})

test('report: counts, deltas, and settings for the named plugin are read-only; exports of another plugin are refused', async t => {
  const h = await harness(t)
  const before = goldenExport(await proposed(h))
  const after = structuredClone(before)
  after.metrics.counts['publish-guard'].denied = 5
  delete after.metrics.counts['respect-stop-signals']
  const oldPath = join(h.base, 'before.json')
  const newPath = join(h.base, 'after.json')
  const settingsPath = join(h.base, 'settings.json')
  await writeFile(oldPath, JSON.stringify(before))
  await writeFile(newPath, JSON.stringify(after))
  await writeFile(settingsPath, JSON.stringify({ pluginConfigs: {
    [after.plugin]: { options: { lead_with_answer: true, publish_guard: false, publish_guard_patterns: PATTERNS } },
    other: { options: { publish_guard: true } },
  } }))
  const original = await readFile(settingsPath)
  const toggles = readSettingsToggles(settingsPath, after.plugin)
  assert.deepEqual(toggles, { lead_with_answer: true, publish_guard: false, publish_guard_patterns: PATTERNS })
  assert.deepEqual(readSettingsToggles(settingsPath, 'absent'), {})
  const summary = compareExports(before, after)
  assert.deepEqual(summary['publish-guard'].denied, { before: 2, after: 5, delta: 3 })
  assert.deepEqual(summary['respect-stop-signals'].detected, { before: 1, after: 0, delta: -1 })
  const result = await h.run(['report', newPath, oldPath, '--settings', settingsPath])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /publish-guard  denied  2  5  \+3/u)
  assert.match(result.stdout, /Explicitly on in settings: lead_with_answer\n/u)
  assert.match(formatReport({ after, before }, { lang: 'ja' }), /レシピ  イベント  前  後  差/u)
  assert.deepEqual(await readFile(settingsPath), original)
  // A changed manual is a warning; a different plugin is an error (chunk D, M6).
  const edited = structuredClone(before)
  edited.profileSha256 = 'f'.repeat(64)
  assert.deepEqual(assertComparable(edited, after), { profileChanged: true })
  const recased = structuredClone(before)
  recased.profileSha256 = before.profileSha256.toUpperCase()
  assert.deepEqual(assertComparable(recased, after), { profileChanged: false })
  await writeFile(oldPath, JSON.stringify(edited))
  const warned = await h.run(['report', newPath, oldPath])
  assert.equal(warned.code, 0, warned.stderr)
  assert.match(warned.stderr, /^warning: .*profileSha256/u)
  const foreign = structuredClone(before)
  foreign.plugin = 'kokoro-mods-other'
  assert.throws(() => assertComparable(foreign, after), { code: 'E_EXPORT_MISMATCH' })
  await writeFile(oldPath, JSON.stringify(foreign))
  const refused = await h.run(['report', newPath, oldPath])
  assert.equal(refused.code, 1)
  assert.equal(refused.stderr, 'error: E_EXPORT_MISMATCH: plugin: the two exports belong to different plugins\n')
  assert.equal(refused.stdout, '')
  // The second export's errors name it as `before` (chunk D, L8).
  await writeFile(oldPath, '{ invalid before')
  const broken = await h.run(['report', newPath, oldPath])
  assert.equal(broken.code, 1)
  assert.equal(broken.stderr, 'error: E_EXPORT_JSON: before: invalid JSON\n')
  await writeFile(oldPath, JSON.stringify({ ...before, v: 2 }))
  assert.equal((await h.run(['report', newPath, oldPath])).stderr, 'error: E_EXPORT_SHAPE: before: $.v: unsupported version\n')
  assert.equal((await h.run(['report', newPath, join(h.base, 'absent.json')])).stderr, 'error: E_EXPORT_READ: before: unable to read file\n')
})

test('A7: changing one section removes only focus-timer; identical diff exits zero', async t => {
  const h = await harness(t)
  const input = fixture('valid', 'en-generic.md')
  const lines = (await readFile(input, 'utf8')).split('\n')
  lines[20] = '' // w4-facts.md: only focus-timer cites line 21.
  const variant = join(h.base, 'one-section.md')
  await writeFile(variant, lines.join('\n'))
  const a = await proposed(h, input, join(h.base, 'a'))
  const b = await proposed(h, variant, join(h.base, 'b'))
  const expected = {
    added: [], removed: ['focus-timer'], changed: [],
    same: ['lead-with-answer', 'offer-options', 'one-next-step', 'plain-language', 'publish-guard', 'respect-stop-signals', 'running-indicator', 'session-resume-brief'],
    hasChanges: true,
  }
  assert.deepEqual(diffProposals(a, b), expected)
  const aPath = join(h.base, 'a', 'PROPOSALS.json')
  const bPath = join(h.base, 'b', 'PROPOSALS.json')
  const changed = await h.run(['diff', aPath, bPath])
  assert.equal(changed.code, 4)
  assert.equal(changed.stdout.trimEnd(), formatDiff(expected).trimEnd())
  const same = await h.run(['diff', aPath, aPath])
  assert.equal(same.code, 0)
  assert.equal(same.stdout.trimEnd(), formatDiff(diffProposals(a, a)).trimEnd())
})

test('diff and re-runs refuse a bundle whose shape is not the catalog\'s, naming keys only', async t => {
  const h = await harness(t)
  const bundle = await proposed(h)
  const secret = 'PRIVATE-RECIPE-CANARY'
  const good = join(h.base, 'good.json')
  const bad = join(h.base, 'bad.json')
  await writeFile(good, JSON.stringify(bundle))
  const cases = [
    ['proposals: expected a bundle with a proposals array', () => ({ proposals: secret })],
    ['proposals: expected a bundle with a proposals array', () => [secret]],
    ['proposals[0].recipeId: expected a catalog recipe id', value => { value.proposals[0].recipeId = secret }],
    ['proposals[1].recipeId: duplicate recipe id', value => { value.proposals[1].recipeId = value.proposals[0].recipeId }],
    ['proposals[0].confidence: expected high, medium or low', value => { value.proposals[0].confidence = secret }],
    ['proposals[0].enabledByDefault: expected a boolean', value => { value.proposals[0].enabledByDefault = 'yes' }],
    ['proposals[0].params: expected an object', value => { value.proposals[0].params = [] }],
    ['proposals[0].evidence: expected one to three entries', value => { value.proposals[0].evidence = [] }],
    ['proposals[0].evidence: expected one to three entries', value => { delete value.proposals[0].evidence }],
    ['proposals[0].evidence[0].quote: expected a non-empty string', value => { value.proposals[0].evidence[0].quote = '' }],
    ['proposals[0].evidence[0].line: expected a positive integer', value => { value.proposals[0].evidence[0].line = 0 }],
    ['proposals[0].evidence[0].section: expected a section key', value => { value.proposals[0].evidence[0].section = secret }],
    ['proposals[0].evidence[0].matched: expected a string', value => { delete value.proposals[0].evidence[0].matched }],
    ['proposals[0].params: unknown key at index 2', value => { value.proposals[0].params[secret] = 1 }],
    ['pluginName: expected a string', value => { value.pluginName = 7 }],
    ['pluginName: expected a kokoro-mods plugin name', value => { value.pluginName = 'kokoro-mods-ADHD' }],
    ['pluginName: expected a kokoro-mods plugin name', value => { value.pluginName = secret }],
  ]
  for (const [expected, change] of cases) {
    let value = structuredClone(bundle)
    value = change(value) ?? value
    await writeFile(bad, JSON.stringify(value))
    for (const argv of [['diff', good, bad], ['diff', bad, good]]) {
      const result = await h.run(argv)
      assert.equal(result.code, 1, expected)
      assert.equal(result.stderr, `error: E_PROPOSALS_SHAPE: ${expected}\n`)
      assert.equal(result.stdout, '')
      assert.ok(!result.stderr.includes(secret))
    }
    // The ownership record of an output folder is read the same way before a re-run, and
    // a refused re-run changes nothing in the folder.
    await writeFile(join(h.out, 'PROPOSALS.json'), JSON.stringify(value))
    const before = await snapshot(h.out)
    const rerun = await h.run(['propose', fixture('valid', 'en-generic.md'), '--out', h.out])
    assert.equal(rerun.code, 1, expected)
    assert.equal(rerun.stderr, `error: E_PROPOSALS_SHAPE: ${expected}\n`)
    assert.ok(!rerun.stdout.includes(secret))
    assert.deepEqual(await snapshot(h.out), before)
  }
  await writeFile(bad, '{ not json')
  assert.equal((await h.run(['diff', good, bad])).stderr, 'error: E_PROPOSALS_JSON: proposals: invalid JSON\n')
})

test('A9: offline modules, no fetch at runtime, protected HOME, and explicit enable limits', async t => {
  const h = await harness(t)
  for (const directory of ['src', 'bin']) {
    for (const path of (await tree(join(ROOT, directory))).filter(path => path.endsWith('.mjs'))) {
      const source = await readFile(join(ROOT, directory, path), 'utf8')
      const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/gu)]
      for (const [, specifier] of imports) {
        const name = specifier.replace(/^node:/u, '').split('/')[0]
        assert.ok(!['http', 'https', 'http2', 'net', 'dns', 'tls', 'dgram', 'child_process', 'worker_threads', 'undici'].includes(name), `${path} imports ${name}`)
      }
      // Globals need no import (chunk E, M3).
      assert.doesNotMatch(source, /\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|\bEventSource\b/u, path)
    }
  }
  // Every command runs in this process (main is imported, not spawned) with a fetch that
  // counts and fails; the count proves nothing called it, whatever the exit code.
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = () => { fetchCalls += 1; throw new Error('network access attempted') }
  const previous = process.env.HOME
  try {
    process.env.HOME = h.home
    for (const [flags, limit] of [[['--max-enabled', '0'], 0], [['--max-enabled', '1'], 1], [['--all'], 9]]) {
      const bundle = await proposed(h, undefined, h.out, flags)
      assert.equal(bundle.proposals.filter(p => p.enabledByDefault).length, limit)
    }
    const golden = goldenExport(await readBundle(h.out))
    const exportPath = join(h.base, 'export.json')
    await writeFile(exportPath, JSON.stringify(golden))
    for (const argv of [
      ['check', fixture('valid', 'ja-kokoro.md')],
      ['diff', join(h.out, 'PROPOSALS.json'), join(h.out, 'PROPOSALS.json')],
      ['report', exportPath, exportPath],
      ['recipes', '--lang', 'ja'],
    ]) assert.equal((await h.run(argv)).code, 0, argv.join(' '))
    assert.deepEqual(await readdir(h.home), [])
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (previous === undefined) delete process.env.HOME
    else process.env.HOME = previous
  }
})

test('the golden plugin is the generator\'s own output for en-generic.md with --name golden', async t => {
  // DESIGN §5.5: the golden files validated with Claude Code are generated, not written
  // by hand, so they cannot drift from the templates (re-inspection, chunk C, L1).
  const h = await harness(t)
  await proposed(h, fixture('valid', 'en-generic.md'), h.out, ['--name', 'golden'])
  const goldenRoot = join(ROOT, 'docs', 'design', 'golden', 'plugin')
  const generated = await snapshot(join(h.out, 'plugin'))
  const golden = await snapshot(goldenRoot)
  assert.deepEqual(Object.keys(golden), Object.keys(generated))
  for (const [path, bytes] of Object.entries(generated)) assert.deepEqual(golden[path], bytes, path)
  assert.equal(JSON.parse(golden['.claude-plugin/plugin.json']).name, 'kokoro-mods-golden')
})

test('A10: a quoted backtick fence is wrapped in a longer fence', async t => {
  const h = await harness(t)
  const path = join(h.base, 'fences.md')
  await writeFile(path, '# Working preferences\n\n## Style\n- Use plain language and show the literal marker ``` in examples.\n')
  const bundle = await proposed(h, path)
  assert.ok(bundle.proposals.some(p => p.recipeId === 'plain-language'))
  const blocks = inertReport(await readFile(join(h.out, 'PROPOSALS.md'), 'utf8'), bundle.proposals)
  assert.ok(blocks.some(block => block.text.includes('```') && (block.fence[0] === '~' || block.fence.length > 3)))
})

test('A11: keep stray files, replace owned files, remove obsolete owned files, and enforce identity', async t => {
  const h = await harness(t)
  const bundle = await proposed(h, undefined, h.out, ['--name', 'stable'])
  const original = await snapshot(h.out)
  await writeFile(join(h.out, 'notes.txt'), 'keep root notes')
  await writeFile(join(h.out, 'plugin/hooks/notes.txt'), 'keep nested notes')
  await writeFile(join(h.out, 'plugin/hooks/register.ts'), 'stale owned file')
  await writeFile(join(h.out, 'plugin/hooks/obsolete.ts'), 'obsolete owned file')
  bundle.files = [...bundle.files, 'plugin/hooks/obsolete.ts'].sort()
  await writeFile(join(h.out, 'PROPOSALS.json'), JSON.stringify(bundle))
  await proposed(h, undefined, h.out, ['--name', 'stable'])
  for (const [path, bytes] of Object.entries(original)) assert.deepEqual(await readFile(join(h.out, path)), bytes)
  assert.equal(await readFile(join(h.out, 'notes.txt'), 'utf8'), 'keep root notes')
  assert.equal(await readFile(join(h.out, 'plugin/hooks/notes.txt'), 'utf8'), 'keep nested notes')
  await assert.rejects(lstat(join(h.out, 'plugin/hooks/obsolete.ts')), { code: 'ENOENT' })
  const beforeConflict = await snapshot(h.out)
  const conflict = await h.run(['propose', fixture('valid', 'en-generic.md'), '--out', h.out, '--name', 'different'])
  assert.equal(conflict.code, 5)
  assert.match(conflict.stderr, /^error: E_OUT_CONFLICT:/u)
  assert.deepEqual(await snapshot(h.out), beforeConflict)
  const forced = await proposed(h, undefined, h.out, ['--name', 'different', '--force'])
  assert.equal(forced.pluginName, 'kokoro-mods-different')
  assert.equal(await readFile(join(h.out, 'notes.txt'), 'utf8'), 'keep root notes')
  assert.deepEqual((await readdir(h.base)).filter(path => path.startsWith('.kokoro-mods-tmp-')), [])
})

test('A9/A11: ownership paths and symlinks cannot write outside out', async t => {
  const h = await harness(t)
  const bundle = await proposed(h)
  const outside = join(h.base, 'outside.txt')
  await writeFile(outside, 'PRIVATE-OUTSIDE-CANARY')
  await writeFile(join(h.out, 'PROPOSALS.json'), JSON.stringify({ ...bundle, files: [...bundle.files, '../outside.txt'] }))
  let result = await h.run(['propose', fixture('valid', 'en-generic.md'), '--out', h.out])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /^error: E_OUT_FILES:/u)
  await writeFile(join(h.out, 'PROPOSALS.json'), JSON.stringify(bundle))
  await rm(join(h.out, 'plugin/hooks/register.ts'))
  await symlink(outside, join(h.out, 'plugin/hooks/register.ts'))
  result = await h.run(['propose', fixture('valid', 'en-generic.md'), '--out', h.out, '--force'])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /^error: E_OUT_PATH:/u)
  assert.equal(await readFile(outside, 'utf8'), 'PRIVATE-OUTSIDE-CANARY')
  assert.ok(!result.stderr.includes('PRIVATE-OUTSIDE-CANARY'))
})

test('A12: malformed JSON and invalid patterns never echo values, even with debug', async t => {
  const h = await harness(t)
  const golden = goldenExport(await proposed(h))
  const path = join(h.base, 'export.json')
  const settings = join(h.base, 'settings.json')
  await writeFile(path, '{"private":"PRIVATE-JSON-CANARY", broken')
  for (const debug of [false, true]) {
    const result = await h.run(['report', path, ...(debug ? ['--debug'] : [])])
    assert.equal(result.code, 1)
    assert.match(result.stderr, /^error: E_EXPORT_JSON: export: invalid JSON/u)
    assert.ok(!result.stderr.includes('PRIVATE-JSON-CANARY'))
    assert.equal(/\n\s+at /u.test(result.stderr), debug)
  }
  await writeFile(path, JSON.stringify(golden))
  await writeFile(settings, JSON.stringify({ pluginConfigs: {
    [golden.plugin]: { options: { publish_guard_patterns: ['[PRIVATE-PATTERN-CANARY'] } },
  } }))
  const original = await readFile(settings)
  for (const debug of [false, true]) {
    const result = await h.run(['report', path, '--settings', settings, ...(debug ? ['--debug'] : [])])
    assert.equal(result.code, 1)
    assert.match(result.stderr, /^error: E_PATTERN:.*publish_guard_patterns\[0\]/u)
    assert.ok(!result.stderr.includes('PRIVATE-PATTERN-CANARY'))
    assert.equal(/\n\s+at /u.test(result.stderr), debug)
  }
  assert.deepEqual(await readFile(settings), original)
})

test('usage, help, catalog localization, naming, warning output, and package contract', async t => {
  const h = await harness(t)
  for (const argv of [[], ['unknown'], ['check'], ['diff', 'one'],
    ['propose', 'x', '--all', '--max-enabled', '1'], ['propose', 'x', '--max-enabled', '1', '--all'],
    ['propose', 'x', '--max-enabled', '-1'], ['propose', 'x', '--max-enabled', '1.5'], ['propose', 'x', '--max-enabled', 'abc'],
    ['propose', 'x', '--max-enabled'], ['propose', 'x', '--lang', 'xx'], ['recipes', '--lang', 'xx'], ['check', 'x', '--out', h.out],
    ['propose', 'x', '--name', 'ADHD'], ['propose', 'x', '--name', '山田'], ['propose', 'x', '--name', '---']]) {
    const result = await h.run(argv)
    assert.equal(result.code, 2, argv.join(' '))
    assert.match(result.stdout + result.stderr, /Usage:/u)
    assert.ok(!(result.stdout + result.stderr).includes('山田'))
  }
  // Help is an answer, so it exits 0 (chunk D, L6); a rejected --name is reported, not replaced (chunk D, M3).
  const help = await h.run(['--help'])
  assert.equal(help.code, 0)
  assert.match(help.stdout, /^Usage:/u)
  assert.equal((await h.run(['propose', fixture('valid', 'en-generic.md'), '--out', h.out, '--name', 'ADHD'])).stderr.split('\n')[0], 'error: E_USAGE: name: rejected after normalisation')
  await assert.rejects(lstat(h.out), { code: 'ENOENT' })
  assert.equal((await h.run(['check', 'absent.md'])).code, 1)
  for (const lang of ['en', 'ja']) {
    const result = await h.run(['recipes', '--lang', lang])
    assert.equal(result.code, 0)
    for (const recipe of RECIPES) {
      const row = result.stdout.split('\n').find(line => line.startsWith(`${recipe.id}\t`))
      assert.ok(row, recipe.id)
      const cells = row.split('\t')
      assert.equal(cells[1], recipe.title[lang])
      assert.equal(cells[2], recipe.template)
      assert.equal(cells[3], recipe.sections.join(', '))
      for (const [name, param] of Object.entries(recipe.params)) {
        assert.ok(cells[4].includes(`${name}:${param.type}${param.multiple ? '[]' : ''}=`), `${recipe.id}.${name}`)
        if (param.type === 'number') assert.ok(cells[4].includes(`[${param.min}..${param.max}]`), `${recipe.id}.${name} bounds`)
      }
    }
  }
  const input = join(h.base, 'fallback.md')
  await writeFile(input, '# あいうえお\n- 短く答えてください。\n')
  const warned = await h.run(['propose', input, '--json'])
  assert.equal(warned.code, 0, warned.stderr)
  assert.equal(JSON.parse(warned.stdout).pluginName, 'kokoro-mods-profile')
  assert.match(warned.stderr, /W-NO-SECTIONS/u)
  assert.match(warned.stderr, /--name/u)
  assert.deepEqual(await tree(join(h.base, 'kokoro-mods-out/profile')), FILES)
  const named = await h.run(['propose', input, '--json', '--name', 'Ｍｅ Myself'])
  assert.equal(named.code, 0, named.stderr)
  assert.equal(JSON.parse(named.stdout).pluginName, 'kokoro-mods-me-myself')
  assert.doesNotMatch(named.stderr, /--name/u)
  for (const name of ['kokoro-mods-profile', 'kokoro-mods-me-myself', `kokoro-mods-${'a'.repeat(40)}`]) assert.ok(isPluginName(name), name)
  for (const name of ['kokoro-mods-adhd', 'kokoro-mods-ADHD', 'kokoro-mods-', 'kokoro-mods-a--b', 'Kokoro-Mods-x', `kokoro-mods-${'a'.repeat(41)}`, 7, null]) assert.ok(!isPluginName(name), String(name))
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'kokoro-mods')
  assert.equal(pkg.version, TOOL_VERSION)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.engines.node, '>=22')
  assert.equal(pkg.scripts.test, 'node --test test/*.test.mjs')
  assert.deepEqual(pkg.bin, { 'kokoro-mods': 'bin/kokoro-mods.mjs' })
  assert.deepEqual(pkg.files, ['bin', 'src', 'README*', 'LICENSE'])
  assert.equal(pkg.license, 'MIT')
  assert.equal(pkg.repository.type, 'git')
  // The GitHub repository is named your-own-mod (the project name, chosen at publication);
  // the package and the command keep the name kokoro-mods, so the two names differ on purpose.
  assert.match(pkg.repository.url, /^git\+https:\/\/github\.com\/.+\/your-own-mod\.git$/u)
  assert.match(pkg.homepage, /^https:\/\/github\.com\/.+\/your-own-mod#readme$/u)
  assert.match(pkg.bugs.url, /^https:\/\/github\.com\/.+\/your-own-mod\/issues$/u)
  assert.ok(!pkg.dependencies && !pkg.devDependencies)
})
