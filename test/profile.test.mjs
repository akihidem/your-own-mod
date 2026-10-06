import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProfile, detectLanguage, sectionKeyForHeading } from '../src/profile.mjs'

const fixtureRoot = new URL('../fixtures/valid/', import.meta.url)
const readFixture = name => readFileSync(new URL(name, fixtureRoot), 'utf8')
const validNames = ['ja-kokoro.md', 'ja-torisetsu.md', 'en-generic.md']
const keys = ['boundaries', 'about', 'strengths', 'style', 'care', 'weak', 'focus', 'decision', 'history']
const headings = [
  'AI に伝える境界線', '私について（AI が知っておくと助かる範囲で）', '強み・関心',
  '応答スタイルの希望', "配慮してほしいこと（DO / DON'T）", '苦手なこと・反応しやすいこと',
  '現在のフォーカス', '意思決定の癖', '改訂履歴',
]

const metadata = {
  'ja-kokoro.md': { format: 'kokoro/0.2', language: 'ja', version: '0.4.0' },
  'ja-torisetsu.md': {
    format: 'torisetsu/0.1', mode: 'self_authored', version: '0.1.0',
    updated_at: '2026-10-06', next_review: '2026-11-06', reviewed_by: 'self',
    psychologist: 'n_a', not_a_diagnosis: 'true', language: 'ja',
    intended_models: '[chatgpt, claude, gemini]',
  },
  'en-generic.md': null,
}

for (const name of validNames) {
  test(`frontmatter, format and language: ${name}`, () => {
    const text = readFixture(name)
    const profile = parseProfile(text)
    assert.deepEqual(profile.frontmatter, metadata[name])
    assert.equal(profile.format, name === 'ja-kokoro.md' ? 'kokoro'
      : name === 'ja-torisetsu.md' ? 'torisetsu' : 'generic')
    assert.equal(profile.language, name.startsWith('ja-') ? 'ja' : 'en')
    assert.ok(profile.title)
    assert.deepEqual(profile, parseProfile(text))
    assert.deepEqual(Object.keys(profile).sort(),
      ['format', 'frontmatter', 'language', 'lines', 'sections', 'title'])
  })

  test(`A3 groundwork: raw lines and inclusive section ranges: ${name}`, () => {
    const text = readFixture(name)
    const sourceLines = text.split(/\r?\n/u)
    if (sourceLines.at(-1) === '') sourceLines.pop()
    const profile = parseProfile(text)
    assert.equal(profile.lines.length, sourceLines.length)
    for (const [index, line] of profile.lines.entries()) {
      assert.equal(line.line, index + 1)
      assert.equal(line.raw, sourceLines[index])
      assert.equal(typeof line.inExample, 'boolean')
      assert.ok(Number.isInteger(line.sectionIndex))
      assert.equal(typeof line.quote, 'string')
      if ((line.kind === 'bullet' || line.kind === 'text') && line.quote === line.raw) {
        assert.ok(line.raw.includes(line.text))
      }
      if (line.kind === 'comment') assert.equal(line.quote, '')
      if (line.kind !== 'bullet') assert.equal(line.depth, 0)
    }
    const first = profile.sections[0]
    assert.ok(profile.lines.slice(0, first.startLine - 1)
      .every(line => line.section === 'unknown' && line.sectionIndex === -1))
    let nextStart = first.startLine
    for (const [sectionIndex, section] of profile.sections.entries()) {
      assert.equal(section.startLine, nextStart)
      assert.ok(section.endLine >= section.startLine)
      const heading = profile.lines[section.startLine - 1]
      assert.equal(heading.kind, 'heading')
      assert.equal(heading.text, section.heading)
      assert.ok(profile.lines.slice(section.startLine - 1, section.endLine)
        .every(line => line.section === section.key && line.sectionIndex === sectionIndex))
      nextStart = section.endLine + 1
    }
    assert.equal(nextStart, sourceLines.length + 1)
  })
}

test('frontmatter uses the first colon and preserves string values and inner spaces', () => {
  const profile = parseProfile([
    '---', 'format: kokoro/custom', 'language: en', 'detail:  part:two  words  ',
    'enabled: true', 'models: [one, two]', '__proto__: literal', '# ignored line', '', '---', '# Title',
  ].join('\n'))
  assert.equal(profile.format, 'kokoro')
  assert.equal(profile.frontmatter.detail, 'part:two  words')
  assert.equal(profile.frontmatter.enabled, 'true')
  assert.equal(profile.frontmatter.models, '[one, two]')
  assert.equal(profile.frontmatter.__proto__, 'literal')
  assert.equal(Object.getPrototypeOf(profile.frontmatter), Object.prototype)
  assert.equal(Object.hasOwn(profile.frontmatter, 'ignored line'), false)
})

test('only a leading pair of fences opens frontmatter; unknown formats stay generic', () => {
  for (const text of ['plain', 'intro\n---\nformat: kokoro\n---', '---\nformat: kokoro']) {
    assert.equal(parseProfile(text).frontmatter, null)
    assert.equal(parseProfile(text, { filename: 'kokoro.md' }).format, 'generic')
  }
  for (const [declared, expected] of [
    ['kokoro', 'kokoro'], ['kokoro-extra', 'generic'], ['torisetsu', 'torisetsu'],
    ['torisetsu/0.1', 'torisetsu'], ['torisetsu-extra', 'generic'],
    ['other/1', 'generic'], ['KOKORO', 'kokoro'], ['Kokoro/0.2', 'kokoro'],
    ['TORISETSU/0.1', 'torisetsu'],
  ]) {
    assert.equal(parseProfile(`---\nformat: ${declared}\n---`).format, expected)
  }
})

test('language uses the exact 20% threshold, ignoring spaces and counting code points', () => {
  for (const text of ['あabcd', 'アabcd', '漢abcd', '𠀀abcd', 'あ😀😀😀😀', ' あ a b c d ']) {
    assert.equal(detectLanguage(text), 'ja', text)
  }
  for (const text of ['', ' \t\n', 'あabcde', 'ASCII only']) {
    assert.equal(detectLanguage(text), 'en', text)
  }
  assert.equal(parseProfile('---\nlanguage: en\n---\n' + 'あ'.repeat(100)).language, 'en')
  assert.equal(parseProfile('---\nlanguage: ja\n---\nEnglish only').language, 'ja')
  const fallback = '---\nlanguage: xx\n---\n' + 'あ'.repeat(100)
  assert.equal(parseProfile(fallback).language, 'ja')
  // Fallback deliberately counts the whole text, including ASCII frontmatter.
  assert.equal(parseProfile('あabcd').language, 'ja')
  assert.equal(parseProfile('---\nlanguage: xx\ndetail: ASCII metadata\n---\nあabcd').language, 'en')
  assert.equal(parseProfile('あ'.repeat(12)).language, 'ja')
  assert.equal(parseProfile(`---\ndetail: ${'x'.repeat(100)}\n---\n${'あ'.repeat(12)}`).language, 'en')
  assert.equal(parseProfile('English only').language, 'en')
})

test('the first level-one heading is the title, with markers removed only at the ends', () => {
  const profile = parseProfile('<!-- # Hidden -->\n# 1. **First  title** ##\n# Later')
  assert.equal(profile.title, 'First  title')
  assert.equal(profile.lines[1].text, 'First  title')
  assert.equal(parseProfile('## About me\n- prose').title, null)
  assert.equal(parseProfile('# __Another  title__').title, 'Another  title')
  assert.equal(parseProfile('# Title with **inner** emphasis').title, 'Title with **inner** emphasis')
  assert.equal(parseProfile('\uFEFF# **BOM title**').title, 'BOM title')
})

test('structured manuals map all nine headings by number, including full-width digits and stops', () => {
  for (const name of ['ja-kokoro.md', 'ja-torisetsu.md']) {
    const profile = parseProfile(readFixture(name))
    assert.deepEqual(profile.sections.map(section => section.num), [1, 2, 3, 4, 5, 6, 7, 8, 9])
    assert.deepEqual(profile.sections.map(section => section.key), keys)
    assert.deepEqual(profile.sections.map(section => section.heading), headings)
  }
  const text = keys.map((key, index) =>
    `## ${index + 1}${index % 2 ? '．' : '.'} About me\n- item`).join('\n')
  for (const format of ['kokoro', 'torisetsu']) {
    assert.deepEqual(parseProfile(`---\nformat: ${format}\n---\n${text}`)
      .sections.map(section => section.key), keys)
    const fullWidth = parseProfile(`---\nformat: ${format}\n---\n## ４．About me\n## １０．Style`)
    assert.deepEqual(fullWidth.sections.map(({ num, key }) => [num, key]), [[4, 'style'], [10, 'style']])
  }
  assert.equal(parseProfile('## 4．Style').sections[0].key, 'style')
  assert.equal(sectionKeyForHeading('About me', 4), 'style')
  assert.equal(sectionKeyForHeading('Style', 10), 'style')
  assert.equal(sectionKeyForHeading('Unlisted heading', 10), 'unknown')
})

test('English fixture headings map to the expected keys', () => {
  const profile = parseProfile(readFixture('en-generic.md'))
  assert.equal(profile.title, 'How to work with me')
  assert.deepEqual(profile.sections.map(section => section.heading), [
    'Boundaries', 'About me', 'How I like answers', "What helps and what doesn't", 'What drains me', 'Right now',
  ])
  assert.deepEqual(profile.sections.map(section => section.key),
    ['boundaries', 'about', 'style', 'care', 'weak', 'focus'])
  assert.ok(profile.sections.every(section => section.num === null))
  assert.equal(sectionKeyForHeading('STYLE'), 'style')
  assert.equal(sectionKeyForHeading('Style and ABOUT ME'), 'about')
  assert.equal(sectionKeyForHeading('Boundaries and About me'), 'boundaries')
  assert.equal(sectionKeyForHeading('私についてのメモ'), 'about')
  assert.equal(sectionKeyForHeading('Unlisted heading'), 'unknown')
})

test('example subsections include intervening lines and end at the next level two or three heading', () => {
  const profile = parseProfile(readFixture('ja-kokoro.md'))
  const examples = profile.lines.filter(line => line.kind === 'bullet' && line.inExample)
  assert.equal(examples.length, 2)
  assert.ok(examples.every(line => line.section === 'style'))
  const inline = parseProfile([
    '## 4. Style', '### EXAMPLES', '- example', '#### Details', '',
    '### Live instructions', '- real', '### 効かなかった', '- another example',
    '## 5. Care', '- real again',
  ].join('\n'))
  assert.deepEqual(inline.lines.map(line => line.inExample),
    [false, true, true, true, true, false, false, true, true, false, false])
  assert.equal(inline.sections.length, 2)
})

test('single and spanning HTML comments preserve visible text on opening and closing lines', () => {
  const profile = parseProfile([
    '## Boundaries', '- visible', 'prefix <!-- one --> suffix', '<!-- open',
    '## About me', '- hidden', 'close --> suffix', 'x <!-- one --> y <!-- two',
    'close -->', '- visible again',
  ].join('\n'))
  assert.deepEqual(profile.lines.filter(line => line.kind === 'comment').map(line => line.line),
    [4, 5, 6, 9])
  assert.deepEqual([2, 6, 7].map(index => [profile.lines[index].kind, profile.lines[index].text]),
    [['text', 'prefix  suffix'], ['text', 'suffix'], ['text', 'x  y']])
  assert.ok(profile.lines.filter(line => line.kind === 'comment')
    .every(line => line.text === '' && line.quote === '' && line.depth === 0))
  assert.deepEqual([2, 6, 7].map(index => profile.lines[index].quote), ['prefix suffix', ' suffix', 'x y '])
  assert.equal(profile.sections.length, 1)
  assert.equal(profile.lines.at(-1).kind, 'bullet')
  const unclosed = parseProfile('<!-- open\n## hidden\n- hidden')
  assert.ok(unclosed.lines.every(line => line.kind === 'comment'))
  assert.deepEqual(unclosed.sections, [])
})

test('tables skip the first row and separator and preserve every cell', () => {
  const fixture = parseProfile(readFixture('ja-kokoro.md'))
  const rows = fixture.lines.filter(line => line.kind === 'row')
  assert.equal(rows.length, 4)
  assert.ok(rows.every(line => line.section === 'care'))
  assert.equal(rows[0].left, '「本当に進めていいですか」と毎回聞く過剰確認')
  assert.equal(rows[0].right, 'すぐ実行し、止まる場面だけ名指しで止まる')
  const profile = parseProfile([
    '## 5. Care', '| Avoid | Prefer |', '| :--- | ---: |',
    '| **old** | plain  words | ignored |', '| single |', '| two cells | |', '',
    '| New header | New alternative |', '|---|---|', '| rushed | calm |',
  ].join('\n'))
  assert.deepEqual(profile.lines.filter(line => line.kind === 'row')
    .map(({ left, right, text }) => ({ left, right, text })), [
    { left: '**old**', right: 'plain  words', text: '**old** | plain  words | ignored' },
    { left: 'single', right: '', text: 'single' },
    { left: 'two cells', right: '', text: 'two cells | ' },
    { left: 'rushed', right: 'calm', text: 'rushed | calm' },
  ])
  assert.deepEqual(profile.lines.filter(line => line.kind === 'row').map(line => line.cells), [
    ['**old**', 'plain  words', 'ignored'], ['single'], ['two cells', ''], ['rushed', 'calm'],
  ])
  for (const index of [1, 2, 7, 8]) assert.equal(profile.lines[index].kind, 'text')
})

test('bullet depths, numbered items and blockquotes preserve inner content', () => {
  const profile = parseProfile([
    '- plain **bold**', '  *   keep  inner   spaces  ', '    + deep', '   12. odd indent',
    '> - quoted **text**', '>   - nested quote', '> > 3. twice quoted',
    '   > ordinary **quoted**  ', '-tight', ' \t ',
  ].join('\n'))
  assert.deepEqual(profile.lines.filter(line => line.kind === 'bullet').map(line => line.depth),
    [0, 1, 2, 1, 0, 1, 0])
  assert.equal(profile.lines[1].text, 'keep  inner   spaces')
  assert.equal(profile.lines[4].text, 'quoted **text**')
  assert.equal(profile.lines[7].kind, 'text')
  assert.equal(profile.lines[7].text, 'ordinary **quoted**')
  assert.equal(profile.lines[8].text, '-tight')
  assert.equal(profile.lines[9].kind, 'blank')
  assert.equal(profile.lines[9].text, '')
  for (const line of profile.lines) assert.ok(line.raw.includes(line.text))
})

test('generic prose remains usable without sections and CRLF does not change raw content', () => {
  const source = '# Notes\r\n> **Keep  this**\r\n- next\r\n'
  const profile = parseProfile(source)
  assert.equal(profile.format, 'generic')
  assert.deepEqual(profile.sections, [])
  assert.ok(profile.lines.every(line => line.section === 'unknown'))
  assert.deepEqual(profile.lines.map(line => line.raw), ['# Notes', '> **Keep  this**', '- next'])
  assert.equal(profile.lines[1].text, '**Keep  this**')
  assert.equal(profile.lines.at(-1).kind, 'bullet')
})

test('the self-authored fixture has three to seven bullets per section and its care table', () => {
  const profile = parseProfile(readFixture('ja-torisetsu.md'))
  for (const section of profile.sections) {
    const count = profile.lines.filter(line => line.section === section.key && line.kind === 'bullet').length
    assert.ok(count >= 3 && count <= 7, section.heading)
  }
  assert.ok(profile.lines.some(line => line.kind === 'row' && line.section === 'care'
    && line.left === '急かす表現' && line.right === 'ご自身のペースで'))
})

test('frontmatter fences and contents never become sections, code, bullets or comments', () => {
  const profile = parseProfile([
    '--- ', '# Hidden title', '## About me', 'bullet: - hidden', 'table: | left | right |', 'fence: ```',
    'comment: <!-- open', 'format: generic', '---\t', '# Visible title', '## Boundaries', '- visible',
  ].join('\n'))
  assert.ok(profile.lines.slice(0, 9).every(line => line.kind === 'frontmatter'
    && line.text === '' && line.depth === 0 && line.section === 'unknown' && line.sectionIndex === -1))
  assert.equal(profile.title, 'Visible title')
  assert.deepEqual(profile.sections.map(({ heading, startLine }) => [heading, startLine]), [['Boundaries', 11]])
  assert.equal(profile.lines.at(-1).kind, 'bullet')
})

test('BOM, CRLF, quoted metadata, format_version and language aliases are accepted', () => {
  const source = '\uFEFF--- \r\nformat_version: "kokoro/0.2-draft"\r\nlanguage: \'JA_JP\'\r\n--- \r\n## 4. About me'
  const profile = parseProfile(source)
  assert.deepEqual(profile.frontmatter, { format_version: 'kokoro/0.2-draft', language: 'JA_JP' })
  assert.equal(profile.format, 'kokoro')
  assert.equal(profile.language, 'ja')
  assert.equal(profile.sections[0].key, 'style')
  assert.ok(profile.lines.slice(0, 4).every(line => line.kind === 'frontmatter' && line.text === ''))
  assert.deepEqual(profile.lines.map(line => line.raw), source.split('\r\n'))
  for (const [language, expected] of [
    ['JA', 'ja'], ['ja-JP', 'ja'], ['Ja_jP', 'ja'], ['EN', 'en'], ['en-US', 'en'], ['en_GB', 'en'],
  ]) {
    assert.equal(parseProfile(`---\nlanguage: "${language}"\n---\n${'あ'.repeat(100)}`).language, expected)
  }
  assert.equal(parseProfile('---\nformat_version: \'torisetsu/0.1\'\n---').format, 'torisetsu')
  // An explicit unknown format wins over format_version; an empty value counts as
  // absent and falls back to format_version (final inspection, chunk A, L5).
  assert.equal(parseProfile('---\nformat: other\nformat_version: kokoro/0.2-draft\n---').format, 'generic')
  assert.equal(parseProfile('---\nformat: \nformat_version: kokoro/0.2-draft\n---').format, 'kokoro')
  assert.equal(parseProfile('---\nformat_version: kokoro-extra\n---').format, 'generic')
})

test('generic numbered headings prefer keywords and fall back to valid numbers', () => {
  const profile = parseProfile([
    '## 1. Boundaries', '## 2. About me', '## 1. About me', '## 2. Boundaries',
    '## ４．About me', '## 4. Unlisted', '## 10. Style', '## 0. About me', '## 10. Unlisted',
  ].join('\n'))
  assert.equal(profile.format, 'generic')
  assert.deepEqual(profile.sections.map(({ num, key }) => [num, key]), [
    [1, 'boundaries'], [2, 'about'], [1, 'about'], [2, 'boundaries'], [4, 'about'],
    [4, 'style'], [10, 'style'], [0, 'about'], [10, 'unknown'],
  ])
})

test('sectionIndex increments only at level-two headings, including repeated keys', () => {
  const profile = parseProfile([
    'intro', '# Title', '## About me', '- first', '### Examples', 'example',
    '## About me', '- second', '## Unlisted', 'end',
  ].join('\n'))
  assert.deepEqual(profile.lines.map(line => line.sectionIndex), [-1, -1, 0, 0, 0, 0, 1, 1, 2, 2])
  assert.deepEqual(profile.sections.map(({ key, startLine, endLine }) => [key, startLine, endLine]), [
    ['about', 3, 6], ['about', 7, 8], ['unknown', 9, 10],
  ])
})

test('inline comments keep headings and bullets, while backticks protect literal comment markers', () => {
  const profile = parseProfile([
    '## 5. Care <!-- draft -->', '- before <!-- note --> after', ' \t<!-- only -->  ',
    '- Keep `<!--` literal', '- Keep ``a ` <!-- literal`` too', '## About me',
  ].join('\n'))
  assert.deepEqual(profile.lines.map(line => line.kind), ['heading', 'bullet', 'comment', 'bullet', 'bullet', 'heading'])
  assert.equal(profile.lines[0].text, 'Care')
  assert.equal(profile.lines[1].text, 'before  after')
  assert.equal(profile.lines[3].text, 'Keep `<!--` literal')
  assert.equal(profile.lines[4].text, 'Keep ``a ` <!-- literal`` too')
  assert.deepEqual(profile.lines.map(line => line.quote), [
    '## 5. Care ', '- before after', '', '- Keep `<!--` literal',
    '- Keep ``a ` <!-- literal`` too', '## About me',
  ])
  assert.deepEqual(profile.sections.map(section => section.key), ['care', 'about'])
  const fixture = parseProfile(readFixture('ja-kokoro.md'))
  assert.equal(fixture.sections.length, 9)
  const heading = fixture.lines.find(line => line.raw === '## 7. 現在のフォーカス <!-- 四半期で更新 -->')
  assert.equal(heading.kind, 'heading')
  assert.equal(heading.text, '現在のフォーカス')
  assert.equal(fixture.lines.find(line => line.raw === '# not a heading').kind, 'code')
})

test('fenced code ignores headings, bullets, tables and comment markers', () => {
  for (const marker of ['```', '~~~', '````']) {
    const profile = parseProfile([
      '# Visible', '## Boundaries', `${marker}markdown`, '# Hidden', '## About me', '### Examples',
      '- hidden', '| a | b |', '<!--', marker, '- visible', '## Style',
    ].join('\n'))
    assert.equal(profile.title, 'Visible')
    assert.deepEqual(profile.sections.map(section => section.key), ['boundaries', 'style'])
    assert.ok(profile.lines.slice(2, 10).every(line => line.kind === 'code' && line.text === ''
      && line.depth === 0 && line.sectionIndex === 0 && !line.inExample))
    assert.equal(profile.lines[10].kind, 'bullet')
  }
  const mismatched = parseProfile('````\n```\n## Hidden\n~~~\n````\n## About me')
  assert.ok(mismatched.lines.slice(0, 5).every(line => line.kind === 'code'))
  assert.equal(mismatched.sections.length, 1)
  const unclosed = parseProfile('~~~\n## Hidden\n- hidden')
  assert.ok(unclosed.lines.every(line => line.kind === 'code'))
  assert.deepEqual(unclosed.sections, [])
  assert.equal(parseProfile('```<!--```\n## About me').sections.length, 1)
})

test('table rows accept missing outer pipes and retain escaped pipes inside cells', () => {
  const profile = parseProfile([
    '## Care', 'Avoid | Prefer | Why', ':--- | ---: | ---',
    String.raw` keep \| together | plain  words | detail `,
    String.raw` path\\ | alternative | more `,
    String.raw`| inside\|cell | final | extra |`, String.raw`only \| a literal`,
  ].join('\n'))
  const rows = profile.lines.filter(line => line.kind === 'row')
  assert.deepEqual(rows.map(line => line.cells), [
    [String.raw`keep \| together`, 'plain  words', 'detail'],
    [String.raw`path\\`, 'alternative', 'more'], [String.raw`inside\|cell`, 'final', 'extra'],
  ])
  assert.equal(rows[0].text, String.raw`keep \| together | plain  words | detail`)
  assert.equal(rows[0].left, String.raw`keep \| together`)
  assert.equal(rows[0].right, 'plain  words')
  assert.equal(profile.lines.at(-1).kind, 'text')
})

test('tabs count as two spaces and hanging continuations stay text at depth zero', () => {
  const profile = parseProfile([
    '## Style', '\t- tab', '\t \t* mixed', '     hanging continuation', '  1. numbered', '    continuation',
  ].join('\n'))
  assert.deepEqual(profile.lines.map(line => [line.kind, line.depth]), [
    ['heading', 0], ['bullet', 1], ['bullet', 2], ['text', 0], ['bullet', 1], ['text', 0],
  ])
  assert.ok(profile.lines.every(line => line.section === 'style' && line.sectionIndex === 0))
  assert.equal(profile.lines[3].text, 'hanging continuation')
})

test('each English keyword maps independently and earlier keys win overlaps', () => {
  for (const [heading, key] of [
    ['answers', 'style'], ['how i like answers', 'style'], ['how i like replies', 'style'],
    ['replies', 'style'], ['How I like to be supported', 'care'], ['What drains me', 'weak'],
    ['Right now', 'focus'], ['Style and How I like to be supported', 'style'],
    ['Style and ABOUT ME', 'about'], ['Boundaries and About me', 'boundaries'],
  ]) {
    assert.equal(sectionKeyForHeading(heading), key, heading)
    assert.equal(parseProfile(`## ${heading}`).sections[0].key, key, heading)
  }
})

test('frontmatter rejects prose and fences beyond the first 40 lines', () => {
  for (const inner of ['ordinary prose', '- a list', '| a | b |', ': missing key']) {
    const profile = parseProfile(`---\n${inner}\n---\n## About me\n- item`)
    assert.equal(profile.frontmatter, null, inner)
    assert.equal(profile.lines[0].kind, 'text')
    assert.equal(profile.lines[2].kind, 'text')
    assert.equal(profile.sections[0].startLine, 4)
  }
  const horizontalRule = parseProfile('---\n## About me\n- item\n---\n## Style')
  assert.equal(horizontalRule.frontmatter, null)
  assert.deepEqual(horizontalRule.sections.map(section => section.key), ['about', 'style'])
  const atLimit = ['---', 'format: kokoro', ...Array(37).fill('# metadata'), '---']
  assert.equal(parseProfile(atLimit.join('\n')).format, 'kokoro')
  atLimit.splice(2, 0, '# one line too far')
  assert.equal(parseProfile(atLimit.join('\n')).frontmatter, null)
})

test('raw evidence retains full-width characters after parsing', () => {
  const profile = parseProfile('## Ａｂｏｕｔ ｍｅ\n- ＡＤＨＤ\n')
  assert.equal(profile.sections[0].key, 'about')
  assert.equal(profile.lines[1].raw, '- ＡＤＨＤ')
  assert.equal(profile.lines[1].quote, '- ＡＤＨＤ')
  assert.equal(profile.lines[1].text, 'ＡＤＨＤ')
})

test('quote removes every inline comment but preserves unrelated spaces and each line kind', () => {
  const source = [
    '---', 'note: ok <!-- private --> ok', '---', '# Title <!-- note -->', '## About me',
    '  - keep  spaces <!-- first --> ok <!-- second --> end', '| left | right |', '|---|---|',
    '| a <!-- private --> b | c |', 'plain  text', '<!-- private -->', '',
    '```', 'code <!-- private --> example', '```',
  ]
  const profile = parseProfile(source.join('\n'))
  assert.deepEqual(profile.lines.map(line => line.raw), source)
  assert.ok(profile.lines.every(line => typeof line.quote === 'string'))
  for (const line of profile.lines.filter(line => !line.raw.includes('<!--'))) {
    assert.equal(line.quote, line.raw)
  }
  assert.equal(profile.lines[1].quote, 'note: ok ok')
  assert.equal(profile.lines[3].quote, '# Title ')
  assert.equal(profile.lines[5].kind, 'bullet')
  assert.equal(profile.lines[5].quote, '  - keep  spaces ok end')
  assert.equal(profile.lines[8].kind, 'row')
  assert.equal(profile.lines[8].quote, '| a b | c |')
  assert.equal(profile.lines[10].quote, '')
  assert.equal(profile.lines[13].kind, 'code')
  assert.equal(profile.lines[13].quote, 'code example')
})

test('piped prose cannot become a table header without outer pipes or a following separator', () => {
  for (const header of ['| Avoid | Prefer |', 'Avoid | Prefer']) {
    const profile = parseProfile([
      'A | B are options', header, '|---|---|', '| rushed | calm |',
    ].join('\n'))
    assert.deepEqual(profile.lines.map(line => line.kind), ['text', 'text', 'text', 'row'])
    assert.equal(profile.lines[0].text, 'A | B are options')
    assert.equal(profile.lines[1].cells, undefined)
    assert.deepEqual(profile.lines[3].cells, ['rushed', 'calm'])
  }
  assert.ok(parseProfile('A | B are options\nC | D are options').lines.every(line => line.kind === 'text'))
  assert.deepEqual(parseProfile('| Header |\n| value |').lines.map(line => line.kind), ['text', 'row'])
})

test('trailing newlines add no phantom line and section ranges end on the last real line', () => {
  assert.deepEqual(parseProfile('').lines, [])
  assert.deepEqual(parseProfile('\n').lines.map(line => line.raw), [''])
  for (const newline of ['\n', '\r\n', '\r']) {
    const text = `## About me${newline}- item`
    for (const suffix of ['', newline]) {
      const profile = parseProfile(text + suffix)
      assert.equal(profile.lines.length, 2)
      assert.equal(profile.sections[0].endLine, 2)
    }
    const withBlank = parseProfile(text + newline + newline)
    assert.equal(withBlank.lines.length, 3)
    assert.equal(withBlank.lines.at(-1).kind, 'blank')
    assert.equal(withBlank.sections[0].endLine, 3)
  }
})
