import test from 'node:test'
import assert from 'node:assert/strict'
import { diffProposals, formatDiff } from '../src/diff.mjs'
import { DEFAULT_MAX_ENABLED, TOOL_NAME, TOOL_VERSION } from '../src/constants.mjs'
import { matchRecipes, buildBundle } from '../src/match.mjs'

function proposal(recipeId, overrides = {}) {
  return {
    recipeId, params: {}, confidence: 'high', enabledByDefault: true,
    evidence: [{ line: 1, section: 'style', quote: 'Answer first.', matched: 'Answer first' }],
    ...overrides,
  }
}

function bundle(proposals) {
  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    profile: { file: 'manual.md', format: 'kokoro', language: 'en', version: null, sha256: 'a'.repeat(64) },
    pluginName: 'kokoro-mods-example', proposals, notMatched: [], files: [],
  }
}

test('diff identifies added, removed, changed, and same ids in sorted order', () => {
  const before = bundle([
    proposal('z-removed'), proposal('z-changed'), proposal('z-same'),
    proposal('a-removed'), proposal('a-changed'), proposal('a-same'),
  ])
  const after = bundle([
    proposal('z-added'), proposal('a-same'),
    proposal('z-changed', { confidence: 'low' }),
    proposal('a-added'), proposal('z-same'),
    proposal('a-changed', {
      params: { max_lines: 4 }, enabledByDefault: false, confidence: 'medium',
      evidence: [{ line: 7, section: 'care', quote: 'Keep it short.', matched: 'short' }],
    }),
  ])
  const beforeSnapshot = structuredClone(before)
  const afterSnapshot = structuredClone(after)
  assert.deepEqual(diffProposals(before, after), {
    added: ['a-added', 'z-added'], removed: ['a-removed', 'z-removed'],
    changed: [
      { recipeId: 'a-changed', fields: ['params', 'evidence', 'enabledByDefault', 'confidence'] },
      { recipeId: 'z-changed', fields: ['confidence'] },
    ],
    same: ['a-same', 'z-same'], hasChanges: true,
  })
  assert.deepEqual(before, beforeSnapshot)
  assert.deepEqual(after, afterSnapshot)
})

test('identical bundles and empty proposals have no changes', () => {
  const input = bundle([proposal('lead-with-answer')])
  const expected = { added: [], removed: [], changed: [], same: ['lead-with-answer'], hasChanges: false }
  assert.deepEqual(diffProposals(input, input), expected)
  assert.deepEqual(diffProposals(input, structuredClone(input)), expected)
  assert.deepEqual(diffProposals({ proposals: [] }, { proposals: [] }), { ...expected, same: [] })
})

test('params compare deeply without treating object key order as a change', () => {
  const before = { proposals: [proposal('options', { params: { first: 1, nested: { list: ['a', 'b'], flag: true } } })] }
  const same = { proposals: [proposal('options', { params: { nested: { flag: true, list: ['a', 'b'] }, first: 1 } })] }
  assert.equal(diffProposals(before, same).hasChanges, false)
  same.proposals[0].params.nested.list.reverse()
  assert.deepEqual(diffProposals(before, same).changed, [{ recipeId: 'options', fields: ['params'] }])
})

test('evidence compares the quote sequence, ignoring line, section, and matched text', () => {
  const evidence = [
    { line: 1, section: 'style', quote: 'Answer first.', matched: 'Answer' },
    { line: 2, section: 'care', quote: 'Keep it short.', matched: 'short' },
  ]
  const before = { proposals: [proposal('lead-with-answer', { evidence })] }
  const after = { proposals: [proposal('lead-with-answer', { evidence: evidence.map(hit => ({ ...hit, line: hit.line + 20, section: 'unknown', matched: 'different' })) })] }
  assert.equal(diffProposals(before, after).hasChanges, false)
  after.proposals[0].evidence.reverse()
  assert.deepEqual(diffProposals(before, after).changed, [{ recipeId: 'lead-with-answer', fields: ['evidence'] }])
  after.proposals[0].evidence.pop()
  assert.deepEqual(diffProposals(before, after).changed, [{ recipeId: 'lead-with-answer', fields: ['evidence'] }])
})

test('bundle metadata and proposal ordering are not proposal changes', () => {
  const before = bundle([proposal('lead-with-answer'), proposal('plain-language')])
  const after = structuredClone(before)
  after.proposals.reverse()
  after.profile.sha256 = 'b'.repeat(64)
  after.profile.file = 'renamed.md'
  after.files = ['PROPOSALS.json']
  after.pluginName = 'kokoro-mods-renamed'
  assert.deepEqual(diffProposals(before, after), {
    added: [], removed: [], changed: [], same: ['lead-with-answer', 'plain-language'], hasChanges: false,
  })
})

test('a one-section revision reports exactly its added, removed, and changed recipes', () => {
  const before = bundle([
    proposal('publish-guard', { evidence: [{ line: 2, section: 'boundaries', quote: 'Ask before you push.', matched: 'before you push' }] }),
    proposal('lead-with-answer', { params: { max_lines: 12, max_chars: 100 } }),
    proposal('accept-typos-as-intent'),
  ])
  const after = bundle([
    structuredClone(before.proposals[0]),
    proposal('lead-with-answer', { params: { max_lines: 12, max_chars: 200 }, evidence: [{ line: 5, section: 'style', quote: 'Answer first in 200 chars.', matched: 'Answer first' }] }),
    proposal('plain-language', { evidence: [{ line: 6, section: 'style', quote: 'Use plain language.', matched: 'plain language' }] }),
  ])
  assert.deepEqual(diffProposals(before, after), {
    added: ['plain-language'], removed: ['accept-typos-as-intent'],
    changed: [{ recipeId: 'lead-with-answer', fields: ['params', 'evidence'] }],
    same: ['publish-guard'], hasChanges: true,
  })
})

test('duplicate recipe ids throw for either input, even when the values are identical', () => {
  const duplicates = bundle([proposal('lead-with-answer'), proposal('lead-with-answer')])
  const empty = bundle([])
  assert.throws(() => diffProposals(duplicates, empty), /Duplicate recipeId in before: lead-with-answer/u)
  assert.throws(() => diffProposals(empty, duplicates), /Duplicate recipeId in after: lead-with-answer/u)
})

test('formatDiff renders none and なし on every empty line', () => {
  const diff = diffProposals(bundle([]), bundle([]))
  assert.deepEqual(formatDiff(diff).split('\n'), ['Added: none', 'Removed: none', 'Changed: none', 'Same: none'])
  assert.deepEqual(formatDiff(diff, { lang: 'ja' }).split('\n'), ['追加: なし', '削除: なし', '変更: なし', '変更なし: なし'])
})

test('formatDiff labels every changed field and reserves the toggle note for toggle-only changes', () => {
  const diff = diffProposals(bundle([proposal('lead-with-answer')]), bundle([proposal('lead-with-answer', {
    params: { max_lines: 4 }, confidence: 'low', enabledByDefault: false,
    evidence: [{ line: 1, section: 'style', quote: 'Be brief.', matched: 'brief' }],
  })]))
  assert.deepEqual(formatDiff(diff).split('\n'), [
    'Added: none', 'Removed: none',
    'Changed: lead-with-answer [params, evidence, enabledByDefault, confidence]', 'Same: none',
  ])
  assert.deepEqual(formatDiff(diff, { lang: 'ja' }).split('\n'), [
    '追加: なし', '削除: なし', '変更: lead-with-answer [設定, 引用, 初期の有効状態, 確かさ]', '変更なし: なし',
  ])
})

test('matching one revised section yields exact changes including a ranking-driven toggle', () => {
  function manual(style) {
    const entries = [
      { section: 'boundaries', text: 'Ask before you push.' },
      ...style.map(text => ({ section: 'style', text })),
      { section: 'care', text: 'Just acknowledge short fragments.' },
    ]
    return {
      format: 'kokoro', language: 'en', frontmatter: null, title: 'Manual',
      sections: [
        { num: null, key: 'boundaries', heading: 'boundaries', startLine: 1, endLine: 1 },
        { num: null, key: 'style', heading: 'style', startLine: 2, endLine: style.length + 1 },
        { num: null, key: 'care', heading: 'care', startLine: style.length + 2, endLine: style.length + 2 },
      ],
      lines: entries.map((entry, index) => ({ ...entry, line: index + 1, raw: `- ${entry.text}`, quote: `- ${entry.text}`, kind: 'bullet', depth: 0, inExample: false })),
    }
  }
  const beforeProfile = manual(['Answer first within 100 chars.', 'Read my typos as intended.', 'Reply in Japanese.'])
  const afterProfile = manual(['Answer first within 200 chars.', 'Use plain language.', 'Reply in Japanese.'])
  const packageProfile = (profile, sha256) => buildBundle(profile, matchRecipes(profile, undefined, { maxEnabled: DEFAULT_MAX_ENABLED }), {
    file: 'manual.md', sha256, pluginName: 'kokoro-mods-example',
  })
  const before = packageProfile(beforeProfile, 'a'.repeat(64))
  const after = packageProfile(afterProfile, 'b'.repeat(64))
  const diff = diffProposals(before, after)
  assert.deepEqual(diff, {
    added: ['plain-language'], removed: ['accept-typos-as-intent'],
    changed: [
      { recipeId: 'lead-with-answer', fields: ['params', 'evidence'] },
      // Under the frozen ranking (safety first, then confidence, evidence count,
      // catalog order) the third default-on slot after accept-typos leaves goes to
      // response-language, which precedes receive-only in the catalog (DESIGN §5.4a).
      { recipeId: 'response-language', fields: ['enabledByDefault'] },
    ],
    same: ['publish-guard', 'receive-only-fragments'], hasChanges: true,
  })
  assert.equal(before.proposals.find(item => item.recipeId === 'response-language').enabledByDefault, false)
  assert.equal(after.proposals.find(item => item.recipeId === 'response-language').enabledByDefault, true)
  assert.equal(after.proposals.find(item => item.recipeId === 'receive-only-fragments').enabledByDefault, false)
  assert.match(formatDiff(diff), /response-language \[enabledByDefault\] \(default toggle only\)/u)
  assert.match(formatDiff(diff, { lang: 'ja' }), /response-language \[初期の有効状態\] （既定の ON\/OFF のみ）/u)
})

test('formatDiff mentions each id once in English and Japanese', () => {
  const diff = diffProposals(
    bundle([proposal('respect-stop-signals'), proposal('lead-with-answer'), proposal('publish-guard')]),
    bundle([proposal('lead-with-answer', { enabledByDefault: false }), proposal('plain-language'), proposal('publish-guard')]),
  )
  const ids = ['respect-stop-signals', 'lead-with-answer', 'publish-guard', 'plain-language']
  const expected = {
    en: ['Added: plain-language', 'Removed: respect-stop-signals', 'Changed: lead-with-answer [enabledByDefault] (default toggle only)', 'Same: publish-guard'],
    ja: ['追加: plain-language', '削除: respect-stop-signals', '変更: lead-with-answer [初期の有効状態] （既定の ON/OFF のみ）', '変更なし: publish-guard'],
  }
  for (const lang of ['en', 'ja']) {
    const text = formatDiff(diff, { lang })
    for (const id of ids) assert.equal(text.split(id).length - 1, 1, `${lang}: ${id}`)
    assert.deepEqual(text.split('\n'), expected[lang])
  }
  assert.equal(formatDiff(diff), formatDiff(diff, { lang: 'en' }))
})
