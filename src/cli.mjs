import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rename, rm, rmdir, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { DEFAULT_MAX_ENABLED, EXIT, SECTION_KEYS } from './constants.mjs'
import { parseProfile } from './profile.mjs'
import { checkProfile } from './check.mjs'
import { EVENT_NAMES, RECIPES, RECIPE_IDS } from './catalog/index.mjs'
import { buildBundle, isPluginName, matchRecipes, slugFor, slugSource } from './match.mjs'
import { diffProposals, formatDiff } from './diff.mjs'
import { emitPlugin, writePluginFolder } from './emit.mjs'
import { exportSets } from './metrics.mjs'
import { assertComparable, formatReport, readExport, readSettingsToggles } from './report.mjs'

const USAGE = `Usage:
  kokoro-mods check <profile.md> [--json]
  kokoro-mods propose <profile.md> [--out DIR] [--name SLUG]
    [--max-enabled N | --all] [--lang ja|en] [--force] [--json]
  kokoro-mods diff <A/PROPOSALS.json> <B/PROPOSALS.json>
  kokoro-mods report <export.json> [<before.json>] [--settings PATH]
  kokoro-mods recipes [--lang ja|en]
  kokoro-mods --help
All commands accept --debug. Exit codes: 0 success, 1 failure, 2 usage,
3 profile rejected, 4 diff changed, 5 output conflict.`

const OUTPUT_FILES = [
  'PROPOSALS.json',
  'PROPOSALS.md',
  'plugin/.claude-plugin/marketplace.json',
  'plugin/.claude-plugin/plugin.json',
  'plugin/hooks/hooks.json',
  'plugin/hooks/register.test.ts',
  'plugin/hooks/register.ts',
]
const COMMANDS = {
  check: { min: 1, max: 1, flags: { json: false } },
  propose: { min: 1, max: 1, flags: { out: true, name: true, 'max-enabled': true, all: false, lang: true, force: false, json: false } },
  diff: { min: 2, max: 2, flags: {} },
  report: { min: 1, max: 2, flags: { settings: true } },
  recipes: { min: 0, max: 0, flags: { lang: true } },
}

class Failure extends Error {
  constructor(code, message, exit = EXIT.FAILURE) {
    super(message)
    this.code = code
    this.exit = exit
  }
}

function usage(message) {
  throw new Failure('E_USAGE', message, EXIT.USAGE)
}

function argumentsFor(argv) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) usage('argv: expected arguments')
  const [command, ...args] = argv
  if (!Object.hasOwn(COMMANDS, command)) usage('command: missing or unknown command')
  const spec = COMMANDS[command]
  const allowed = { ...spec.flags, debug: false }
  const flags = Object.create(null)
  const positional = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--') { positional.push(...args.slice(i + 1)); break }
    if (!arg.startsWith('-')) { positional.push(arg); continue }
    const equals = arg.indexOf('=')
    const key = arg.slice(2, equals < 0 ? undefined : equals)
    if (!arg.startsWith('--') || !Object.hasOwn(allowed, key)) usage('option: unknown option')
    if (Object.hasOwn(flags, key)) usage('option: repeated option')
    if (allowed[key]) {
      const value = equals < 0 ? args[++i] : arg.slice(equals + 1)
      if (!value || value.startsWith('--')) usage('option: missing value')
      flags[key] = value
    } else {
      if (equals >= 0) usage('option: flag does not take a value')
      flags[key] = true
    }
  }
  if (positional.length < spec.min || positional.length > spec.max) usage('arguments: wrong number of paths')
  if (flags.lang !== undefined && !['ja', 'en'].includes(flags.lang)) usage('lang: expected ja or en')
  if (flags.all && flags['max-enabled'] !== undefined) usage('max-enabled: cannot be combined with all')
  if (flags['max-enabled'] !== undefined &&
      (!/^\d+$/u.test(flags['max-enabled']) || !Number.isSafeInteger(Number(flags['max-enabled'])))) {
    usage('max-enabled: expected a non-negative integer')
  }
  // A --name that normalises to nothing or holds a forbidden term is refused here, not
  // silently replaced: the person chose a name to keep the manual's words out of the
  // plugin (final inspection, chunk D, M3).
  if (flags.name !== undefined && slugSource(null, { name: flags.name }) === 'rejected') {
    usage('name: rejected after normalisation')
  }
  return { command, flags, positional }
}

function print(stream, text) {
  stream.write(`${text}${text.endsWith('\n') ? '' : '\n'}`)
}

function inputPath(value, cwd, env) {
  if (value === '~' || value.startsWith('~/')) {
    if (!env.HOME) usage('path: HOME is required to expand a tilde')
    return resolve(env.HOME, value === '~' ? '.' : value.slice(2))
  }
  return resolve(cwd, value)
}

async function bytesFrom(path, key) {
  try {
    return await readFile(path)
  } catch {
    throw new Failure('E_READ', `${key}: unable to read file`)
  }
}

const CONFIDENCES = new Set(['high', 'medium', 'low'])
const KNOWN_RECIPE_IDS = new Set(RECIPE_IDS)
const KNOWN_SECTIONS = new Set(SECTION_KEYS)
const PARAM_NAMES = new Map(RECIPES.map(recipe => [recipe.id, new Set(Object.keys(recipe.params))]))

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A PROPOSALS.json may have been edited by hand or written by another tool, and `diff`
// prints recipe ids from it; so every field the diff or the re-run reads is checked
// against the catalog before use, and a message names the key, never the value (final
// inspection, chunk D, M5).
function assertBundle(value) {
  const shape = (ok, key, expected) => {
    if (!ok) throw new Failure('E_PROPOSALS_SHAPE', `${key}: ${expected}`)
  }
  shape(record(value) && Array.isArray(value.proposals), 'proposals', 'expected a bundle with a proposals array')
  const seen = new Set()
  value.proposals.forEach((proposal, index) => {
    const key = `proposals[${index}]`
    shape(record(proposal), key, 'expected an object')
    shape(typeof proposal.recipeId === 'string' && KNOWN_RECIPE_IDS.has(proposal.recipeId), `${key}.recipeId`, 'expected a catalog recipe id')
    shape(!seen.has(proposal.recipeId), `${key}.recipeId`, 'duplicate recipe id')
    seen.add(proposal.recipeId)
    shape(CONFIDENCES.has(proposal.confidence), `${key}.confidence`, 'expected high, medium or low')
    shape(typeof proposal.enabledByDefault === 'boolean', `${key}.enabledByDefault`, 'expected a boolean')
    shape(record(proposal.params), `${key}.params`, 'expected an object')
    // Parameter names are checked against the recipe; an unknown one is named by
    // position only, because its name is input (re-inspection, chunk D/E, F2).
    Object.keys(proposal.params).forEach((name, position) => {
      shape(PARAM_NAMES.get(proposal.recipeId).has(name), `${key}.params`, `unknown key at index ${position}`)
    })
    shape(Array.isArray(proposal.evidence) && proposal.evidence.length >= 1 && proposal.evidence.length <= 3, `${key}.evidence`, 'expected one to three entries')
    proposal.evidence.forEach((entry, position) => {
      const path = `${key}.evidence[${position}]`
      shape(record(entry), path, 'expected an object')
      shape(Number.isSafeInteger(entry.line) && entry.line >= 1, `${path}.line`, 'expected a positive integer')
      shape(typeof entry.section === 'string' && KNOWN_SECTIONS.has(entry.section), `${path}.section`, 'expected a section key')
      shape(typeof entry.quote === 'string' && entry.quote.length > 0, `${path}.quote`, 'expected a non-empty string')
      shape(typeof entry.matched === 'string', `${path}.matched`, 'expected a string')
    })
  })
  if (Object.hasOwn(value, 'pluginName')) {
    shape(typeof value.pluginName === 'string', 'pluginName', 'expected a string')
    shape(isPluginName(value.pluginName), 'pluginName', 'expected a kokoro-mods plugin name')
  }
  return value
}

async function bundleFrom(path) {
  const bytes = await bytesFrom(path, 'proposals')
  let value
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''))
  } catch {
    throw new Failure('E_PROPOSALS_JSON', 'proposals: invalid JSON')
  }
  return assertBundle(value)
}

function findingsText(findings) {
  return ['LINE  LEVEL  RULE  message', ...findings.map(f =>
    `${f.line ?? '-'}  ${f.level}  ${f.rule}  ${f.message}`)].join('\n')
}

async function maybeStat(path) {
  try { return await lstat(path) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function directories(path, created) {
  let current = parse(path).root
  for (const part of relative(current, path).split(sep).filter(Boolean)) {
    current = join(current, part)
    let stat = await maybeStat(current)
    if (!stat && created) {
      await mkdir(current)
      created.push(current)
      stat = await lstat(current)
    }
    if (!stat) return
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Failure('E_OUT_PATH', 'out: expected directories without symbolic links')
    }
  }
}

function ownedPaths(paths) {
  if (!Array.isArray(paths)) throw new Failure('E_OUT_FILES', 'files: expected relative file paths')
  const seen = new Set()
  paths.forEach((path, index) => {
    if (typeof path !== 'string' || isAbsolute(path) || /^[a-z]:/iu.test(path) ||
        path.includes('\\') || path.includes('\0') ||
        path.split('/').some(part => !part || part === '.' || part === '..') || seen.has(path)) {
      throw new Failure('E_OUT_FILES', `files[${index}]: expected a unique relative file path`)
    }
    seen.add(path)
  })
  return seen
}

async function outputFile(out, path) {
  await directories(dirname(join(out, path)))
  const stat = await maybeStat(join(out, path))
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
    throw new Failure('E_OUT_PATH', 'files: expected regular files without symbolic links')
  }
  return stat
}

async function inspectOutput(out, pluginName, force, newPaths) {
  await directories(out)
  const manifest = await outputFile(out, 'PROPOSALS.json')
  const before = manifest ? await bundleFrom(join(out, 'PROPOSALS.json')) : null
  if (before && typeof before.pluginName !== 'string') {
    throw new Failure('E_PROPOSALS_SHAPE', 'pluginName: expected a string')
  }
  if (before && before.pluginName !== pluginName && !force) {
    throw new Failure('E_OUT_CONFLICT', 'pluginName: output belongs to another plugin; use --force to replace it', EXIT.OUT_CONFLICT)
  }
  const old = ownedPaths(before ? before.files : [])
  const paths = [...new Set([...old, ...ownedPaths(newPaths)])].sort()
  const pathSet = new Set(paths)
  for (const path of paths) {
    const parts = path.split('/')
    if (parts.some((_, index) => index > 0 && pathSet.has(parts.slice(0, index).join('/')))) {
      throw new Failure('E_OUT_FILES', 'files: a file path also names a parent directory')
    }
  }
  for (const path of paths) {
    const stat = await outputFile(out, path)
    if (stat && !old.has(path) && !force) {
      throw new Failure('E_OUT_CONFLICT', 'files: output would replace an unowned file; use --force to replace it', EXIT.OUT_CONFLICT)
    }
  }
  return { before, paths }
}

async function replaceOutput(out, files, paths) {
  const created = []
  const installed = []
  const backedUp = []
  let stage
  let complete = false
  let keepRecovery = false
  try {
    await directories(out, created)
    // DESIGN §5.5 uses a sibling on the same filesystem for atomic file renames.
    stage = await mkdtemp(join(dirname(out), `.kokoro-mods-tmp-${process.pid}-`))
    const next = join(stage, 'next')
    const written = await writePluginFolder(files, next)
    if (JSON.stringify(written) !== JSON.stringify([...files.keys()].sort())) {
      throw new Failure('E_OUTPUT_SHAPE', 'files: writer returned a different file list')
    }
    for (const path of paths) {
      if (!await outputFile(out, path)) continue
      const backup = join(stage, 'previous', path)
      await mkdir(dirname(backup), { recursive: true })
      await rename(join(out, path), backup)
      backedUp.push(path)
    }
    // Install the ownership record last; stale owned files stay in the backup.
    const order = [...files.keys()].filter(path => path !== 'PROPOSALS.json').sort()
    order.push('PROPOSALS.json')
    for (const path of order) {
      await directories(dirname(join(out, path)), created)
      if (await outputFile(out, path)) {
        throw new Failure('E_OUT_CONFLICT', 'files: output changed during replacement', EXIT.OUT_CONFLICT)
      }
      await rename(join(next, path), join(out, path))
      installed.push(path)
    }
    complete = true
  } catch (error) {
    try {
      for (const path of installed.reverse()) await unlink(join(out, path))
      for (const path of backedUp.reverse()) {
        await directories(dirname(join(out, path)), created)
        await rename(join(stage, 'previous', path), join(out, path))
      }
    } catch {
      // Do not destroy the only remaining copy if rollback itself fails.
      keepRecovery = true
      throw new Failure('E_OUT_RECOVERY', 'out: rollback failed; recovery files remain in the temporary sibling directory')
    }
    throw error
  } finally {
    if (stage && !keepRecovery) await rm(stage, { recursive: true, force: true })
    if (!complete) {
      for (const path of created.reverse()) {
        try { await rmdir(path) } catch { /* Only remove directories that are still empty. */ }
      }
    }
  }
}

function proposalSummary(bundle, out, lang) {
  const ja = lang === 'ja'
  const lines = bundle.proposals.map(p =>
    `${p.enabledByDefault ? 'on ' : 'off'}  ${p.recipeId}  ${p.confidence}  ${ja ? '引用' : 'quotes'}=${p.evidence.length}`)
  if (!lines.length) lines.push(ja ? '一致する提案はありません。' : 'No matching proposals.')
  lines.push('', ja ? 'PROPOSALS.md を読み、Claude Code 内でインストールしてください：' : 'Review PROPOSALS.md, then install inside Claude Code:',
    `/plugin marketplace add ${JSON.stringify(join(out, 'plugin'))}`,
    `/plugin install ${bundle.pluginName}`)
  return lines.join('\n')
}

async function propose(profilePath, bytes, profile, flags, io) {
  const findings = checkProfile(profile)
  if (findings.some(f => f.level === 'FAIL')) {
    print(io.stdout, flags.json ? JSON.stringify(findings, null, 2) : findingsText(findings))
    return EXIT.CHECK_FAILED
  }
  if (findings.length) print(io.stderr, findingsText(findings))
  const slug = slugFor(profile, { name: flags.name })
  const lang = flags.lang ?? profile.language
  const out = inputPath(flags.out ?? `./kokoro-mods-out/${slug}`, io.cwd, io.env)
  const progress = flags.json ? io.stderr : io.stdout
  const maxEnabled = flags.all ? Infinity : Number(flags['max-enabled'] ?? DEFAULT_MAX_ENABLED)
  const proposals = matchRecipes(profile, RECIPES, { maxEnabled })
  const bundle = buildBundle(profile, proposals, {
    file: basename(profilePath),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pluginName: `kokoro-mods-${slug}`,
    files: OUTPUT_FILES,
    recipes: RECIPES,
  })
  // Relative install instructions keep the private report independent of --out.
  // The emitter takes the catalog as a map keyed by id (DESIGN §5.5 / emit.mjs), not the
  // array the matcher takes. Integrator's correction after round 1: every propose run
  // failed with "unknown recipe id" because the array was passed.
  const files = emitPlugin({ bundle, recipes: Object.fromEntries(RECIPES.map(recipe => [recipe.id, recipe])), lang, outDirName: '.' })
  if (JSON.stringify([...files.keys()].sort()) !== JSON.stringify(OUTPUT_FILES)) {
    throw new Failure('E_OUTPUT_SHAPE', 'files: emitter returned an unexpected file list')
  }
  const { before, paths } = await inspectOutput(out, bundle.pluginName, flags.force, [...files.keys()])
  if (before) print(progress, formatDiff(diffProposals(before, bundle), { lang }))
  await replaceOutput(out, files, paths)
  print(progress, proposalSummary(bundle, out, lang))
  // The naming hint belongs to a completed run; an error line must come first on a failed one.
  if (slugSource(profile, { name: flags.name }) === 'fallback') {
    print(io.stderr, 'hint: pass --name SLUG to choose a stable plugin name.')
  }
  if (flags.json) print(io.stdout, JSON.stringify(bundle, null, 2))
  return EXIT.OK
}

function recipesText(lang) {
  const lines = [lang === 'ja' ? 'ID\t名前\tテンプレート\t高確信の節\tパラメーター' : 'ID\tTITLE\tTEMPLATE\tHIGH-CONFIDENCE SECTIONS\tPARAMS']
  for (const recipe of RECIPES) {
    const params = Object.entries(recipe.params).map(([name, p]) => {
      const bounds = p.min !== undefined || p.max !== undefined ? ` [${p.min ?? ''}..${p.max ?? ''}]` : ''
      const options = p.options ? ` options=${JSON.stringify(p.options)}` : ''
      return `${name}:${p.type}${p.multiple ? '[]' : ''}=${JSON.stringify(p.default)}${bounds}${options}`
    }).join('; ')
    lines.push([recipe.id, recipe.title[lang], recipe.template, recipe.sections.join(', '), params || '—'].join('\t'))
  }
  return lines.join('\n')
}

function publicFailure(error) {
  if (error instanceof Failure) return error
  const safeCodes = new Set(['E_EXPORT_SHAPE', 'E_EXPORT_READ', 'E_EXPORT_JSON', 'E_SETTINGS_READ', 'E_SETTINGS_JSON', 'E_SETTINGS_SHAPE', 'E_PATTERN'])
  if (safeCodes.has(error?.code)) return new Failure(error.code, error.message)
  if (error?.code === 'E_LEAK') return new Failure('E_LEAK', 'plugin: private evidence failed the leak check')
  if (error?.code === 'E_PLUGIN_NAME') return new Failure('E_PLUGIN_NAME', 'pluginName: expected a kokoro-mods plugin name')
  if (error?.code === 'E_EXPORT_MISMATCH') return new Failure('E_EXPORT_MISMATCH', error.message)
  if (error?.code === 'E_PARAM_FREE_TEXT') return new Failure('E_PARAM_FREE_TEXT', 'params: free-text overrides are not permitted')
  return new Failure('E_UNEXPECTED', 'operation: unable to complete the command')
}

/**
 * Run a command with injected streams/environment; resolve an EXIT code on failure.
 * JSON goes to stdout; warnings and progress for JSON mode go to stderr.
 * @param {string[]} argv Arguments excluding node and the executable.
 * @param {{stdout?: object, stderr?: object, env?: object, cwd?: string}} io Execution context.
 * @returns {Promise<number>} Never rejects for command, input, or filesystem errors.
 */
export async function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env, cwd = process.cwd() } = {}) {
  const debug = Array.isArray(argv) && argv.includes('--debug')
  try {
    // Help is a successful answer, not a usage error (final inspection, chunk D, L6).
    if (Array.isArray(argv) && argv.includes('--help')) { print(stdout, USAGE); return EXIT.OK }
    const { command, flags, positional } = argumentsFor(argv)
    const path = value => inputPath(value, cwd, env)
    if (command === 'recipes') { print(stdout, recipesText(flags.lang ?? 'en')); return EXIT.OK }
    if (command === 'check' || command === 'propose') {
      const profilePath = path(positional[0])
      const bytes = await bytesFrom(profilePath, 'profile')
      const profile = parseProfile(bytes.toString('utf8'))
      if (command === 'propose') return await propose(profilePath, bytes, profile, flags, { stdout, stderr, env, cwd })
      const findings = checkProfile(profile)
      print(stdout, flags.json ? JSON.stringify(findings, null, 2) : findingsText(findings))
      return findings.some(f => f.level === 'FAIL') ? EXIT.CHECK_FAILED : EXIT.OK
    }
    if (command === 'diff') {
      const before = await bundleFrom(path(positional[0]))
      const after = await bundleFrom(path(positional[1]))
      const diff = diffProposals(before, after)
      print(stdout, formatDiff(diff, { lang: 'en' }))
      return diff.hasChanges ? EXIT.DIFF_CHANGED : EXIT.OK
    }
    const sets = exportSets(RECIPES, { eventNames: EVENT_NAMES })
    const after = readExport(path(positional[0]), sets)
    const before = positional[1] ? readExport(path(positional[1]), sets, 'before') : undefined
    if (before && assertComparable(before, after).profileChanged) {
      print(stderr, 'warning: the two exports were made from different versions of the manual (profileSha256 differs).')
    }
    const toggles = flags.settings ? readSettingsToggles(path(flags.settings), after.plugin) : undefined
    print(stdout, formatReport({ after, before, toggles }, { lang: 'en' }))
    return EXIT.OK
  } catch (error) {
    const failure = publicFailure(error)
    try {
      print(stderr, `error: ${failure.code}: ${failure.message}`)
      if (failure.exit === EXIT.USAGE) print(stderr, USAGE)
      // The sanitized error's stack cannot reproduce a parser or emitter needle.
      if (debug) print(stderr, failure.stack)
    } catch { /* A closed output stream must not turn an exit code into a rejection. */ }
    return failure.exit
  }
}
