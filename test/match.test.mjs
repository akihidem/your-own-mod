import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MAX_ENABLED, SECTION_KEYS, TOOL_NAME, TOOL_VERSION } from '../src/constants.mjs'
import { RECIPES, RECIPE_IDS, TEMPLATE_KEYS, EVENT_NAMES, getRecipe } from '../src/catalog/index.mjs'
import { matchRecipes, buildBundle, publishPolarity, slugFor, slugSource } from '../src/match.mjs'

// Hand-built parser contract: no fixtures or parser implementation are involved.
function profileFrom(lines, options = {}) {
  const numbered = lines.map((entry, index) => ({
    section: 'style', kind: 'bullet', depth: 0, inExample: false,
    ...entry, line: index + 1, sectionIndex: -1,
    raw: entry.raw ?? entry.text, quote: entry.quote ?? entry.raw ?? entry.text,
  }))
  const sections = []
  for (const line of numbered) {
    if (line.section === 'unknown') continue
    const previous = sections.at(-1)
    if (previous?.key === line.section && previous.endLine === line.line - 1) previous.endLine = line.line
    else sections.push({ num: null, key: line.section, heading: line.section, startLine: line.line, endLine: line.line })
    line.sectionIndex = sections.length - 1
  }
  return { format: 'kokoro', language: 'ja', frontmatter: null, title: null, ...options, sections, lines: numbered }
}

// The cell a trigger reads, as the matcher reads it (DESIGN §5.4a).
function cellsOf(line, cell = 'any') {
  if (line.kind !== 'row') return cell === 'left' ? [] : [line.text]
  if (cell === 'left') return [line.left ?? '']
  if (cell === 'right') return [line.right ?? '']
  return [line.left ?? '', line.right ?? '']
}

function assertSuppressed(recipeOrId, profile) {
  const recipe = typeof recipeOrId === 'string' ? getRecipe(recipeOrId) : recipeOrId
  const message = `${recipe.id}: ${profile.lines.map(line => line.text).join(' / ')}`
  // The precondition proves that a trigger of the profile's language fires on the cell it
  // reads, so the suppression below is the work of a negation and not of a trigger that
  // never applied (re-inspection, chunk B/D tests, H-1). For a recipe with `unless`, the
  // same recipe without it must propose; for publish-guard, the matcher's own polarity
  // ruling must be a waiver with no request.
  const fires = profile.lines.some(line => recipe.triggers.some(trigger => {
    if (trigger.lang !== 'any' && trigger.lang !== profile.language) return false
    const once = new RegExp(trigger.pattern.source, trigger.pattern.flags.replace('g', ''))
    return cellsOf(line, trigger.cell).some(text => once.test(text))
  }))
  assert.ok(fires, `Trigger precondition: ${message}`)
  if (recipe.unless.length > 0) {
    assert.equal(matchRecipes(profile, [{ ...recipe, unless: [] }]).length, 1, `Unless precondition: ${message}`)
  } else if (recipe.id === 'publish-guard') {
    const rulings = profile.lines.flatMap(line => cellsOf(line, 'right').map(text => publishPolarity(text)))
    assert.ok(rulings.some(ruling => ruling.waiver && !ruling.asking), `Polarity precondition: ${message} ${JSON.stringify(rulings)}`)
  }
  assert.deepEqual(matchRecipes(profile, [recipe]), [], `Unless: ${message}`)
}

// A leading lookbehind is a boundary of its own; what follows it must still be bounded.
function stripLeadingLookbehinds(source) {
  let head = source
  while (head.startsWith('(?<!') || head.startsWith('(?<=')) {
    let depth = 0
    let index = 0
    for (; index < head.length; index++) {
      const char = head[index]
      if (char === '\\') { index++; continue }
      if (char === '(') depth++
      else if (char === ')' && --depth === 0) break
    }
    head = head.slice(index + 1)
  }
  return head
}

// A trailing lookahead (an object excluded after the count) is likewise outside the match.
function stripTrailingLookaheads(source) {
  let tail = source
  while (tail.endsWith(')')) {
    let depth = 0
    let index = tail.length - 1
    for (; index >= 0; index--) {
      const char = tail[index]
      if (index > 0 && tail[index - 1] === '\\') continue
      if (char === ')') depth++
      else if (char === '(' && --depth === 0) break
    }
    if (index < 0 || !(tail.startsWith('(?!', index) || tail.startsWith('(?=', index))) break
    tail = tail.slice(0, index)
  }
  return tail
}

function topLevelAlternatives(source) {
  const alternatives = []
  let start = 0
  let depth = 0
  let inClass = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') { index++; continue }
    if (char === '[') inClass = true
    else if (char === ']') inClass = false
    else if (!inClass) {
      if (char === '(') depth++
      else if (char === ')') depth--
      else if (char === '|' && depth === 0) {
        alternatives.push(source.slice(start, index))
        start = index + 1
      }
    }
  }
  return [...alternatives, source.slice(start)]
}

const CASES = [
  ['lead-with-answer', 'style',
    '結論を先に、短く説明してください。', '結論を先にと言っても、短くしないで。',
    'Answer first and keep it short.', 'Do not keep it short; I need the details.'],
  ['accept-typos-as-intent', 'style',
    '誤字や表記揺れはそのまま読んでください。', '誤字は訂正してください。',
    'Treat my typos as intended text.', 'Please do correct my typos.'],
  ['response-language', 'style',
    '常に日本語で返答してください。', '日本語で返答しないでください。',
    'Always answer in Japanese.', 'Do not answer in Japanese.'],
  ['one-next-step', 'care',
    '一つずつ、次の一手を示してください。', '一つずつにしないで、全体を示してください。',
    'Give me one next step.', 'Do not give me one next step; show the whole plan.'],
  ['receive-only-fragments', 'boundaries',
    '短文断片は受け取るだけにしてください。', '受け取るだけにしないで、助言してください。',
    'Just acknowledge short fragments.', 'Do not just acknowledge; offer advice.'],
  ['respect-stop-signals', 'boundaries',
    '一旦やめると言ったら終わりにしてください。', '終わりと言ったら合図にせず続けてください。',
    'When I say stop for now, wrap up.', 'Do not stop for now; keep working.'],
  ['no-psych-framing', 'care',
    '心理学的なフレーミングは不要です。', '心理学的に解釈してください。',
    'Avoid psychological framing.', 'Please use psychological framing.'],
  ['publish-guard', 'boundaries',
    '外部公開やpushの前にはy/nで確認してください。', 'push前の確認は不要です。',
    'Ask before you push.', 'Do not ask before you push.'],
  ['quiet-confirmations', 'care',
    '都度確認不要、確認せず実行してください。', '都度確認不要とは言わない。毎回確認してください。',
    "Don't ask for confirmation on routine work; just do it.", "Don't just do it; ask every time."],
  ['offer-options', 'decision',
    '２〜４案を比較してから選びたいです。', '複数案は不要です。一案だけにしてください。',
    'Compare options: two to four options, please.', 'Do not offer alternatives; just one option.'],
  ['plain-language', 'care',
    '専門用語を避け、平易な言葉で説明してください。', '専門用語を避けないでください。',
    'Use plain language and explain terms.', 'Do not use plain language; use jargon instead.'],
  ['expert-role-with-evidence', 'style',
    '専門家ロールで、根拠と反証を示してください。', '専門家ロールは不要です。',
    'Use an expert role with evidence and falsifiability.', 'Do not use an expert role.'],
  ['trace-offers', 'style',
    '記録に残す提案としてIssue化を勧めてください。', 'Issue化は不要です。',
    'Offer to file an issue and leave a trace.', 'Do not offer to file an issue.'],
  ['running-indicator', 'weak',
    '動いてるかどうか分からないので表示してください。', '動いているか知らせないでください。',
    "I can't tell if you are still running.", "Don't tell me if you are still running."],
  ['block-ahead-warning', 'weak',
    '認証や承認ダイアログが負担なので先に知らせてください。', '認証が負担でも予告は不要です。',
    'Warn me about auth prompts and permission dialogs.', 'Do not warn me about auth prompts.'],
  ['session-resume-brief', 'about',
    '複数のプロジェクトを並行するので切替時に読み直します。', 'セッション切替時の記録は不要です。',
    'I work on several projects and often context switch.', 'Do not log context switches.'],
  ['focus-timer', 'focus',
    '時間を忘れるので、休憩タイマーを50分ごとに。', '休憩のリマインド不要、タイマーは不要です。',
    'Use a break reminder when I lose track of time.', "I don't need a break reminder; no timer."],
]

for (const [id, section, jaPositive, jaNegative, enPositive, enNegative] of CASES) {
  for (const [language, positive, negative] of [['ja', jaPositive, jaNegative], ['en', enPositive, enNegative]]) {
    test(`${id}: ${language} positive`, () => {
      const profile = profileFrom([{ section, kind: 'bullet', text: positive }], { language })
      const proposal = matchRecipes(profile).find(item => item.recipeId === id)
      assert.ok(proposal, id)
      assert.equal(proposal.confidence, 'high')
      assert.equal(proposal.evidence.length, 1)
      assert.equal(proposal.evidence[0].quote, profile.lines[0].raw)
      assert.ok(proposal.evidence[0].matched.length > 0)
      assert.ok(proposal.evidence[0].quote.includes(proposal.evidence[0].matched))
    })
    test(`${id}: ${language} polarity negative`, () => {
      const profile = profileFrom([{ section, kind: 'bullet', text: negative }], { language })
      assertSuppressed(id, profile)
    })
  }
}

test('catalog order, template mapping, trigger coverage, and provenance are complete', () => {
  const expectedIds = CASES.map(([id]) => id)
  assert.equal(expectedIds.length, 17)
  assert.deepEqual(RECIPE_IDS, expectedIds)
  assert.equal(new Set(RECIPE_IDS).size, 17)
  assert.deepEqual(TEMPLATE_KEYS, ['compose-rule', 'submit-detector', 'publish-guard', 'running-indicator', 'resume-brief', 'focus-timer'])
  const specialTemplates = {
    'receive-only-fragments': 'submit-detector', 'respect-stop-signals': 'submit-detector',
    'publish-guard': 'publish-guard', 'running-indicator': 'running-indicator',
    'session-resume-brief': 'resume-brief', 'focus-timer': 'focus-timer',
  }
  for (const recipe of RECIPES) {
    assert.equal(getRecipe(recipe.id), recipe)
    assert.equal(recipe.template, specialTemplates[recipe.id] ?? 'compose-rule')
    assert.ok(recipe.sections.every(section => SECTION_KEYS.includes(section)))
    assert.ok(recipe.evidence.length > 0)
    assert.ok(recipe.evidence.every(entry => ['author', 'research', 'prior-art'].includes(entry.kind) && entry.ref && entry.note))
    for (const lang of ['ja', 'en']) assert.ok(recipe.triggers.filter(trigger => trigger.lang === lang).length >= 2, `${recipe.id}: ${lang}`)
    for (const trigger of recipe.triggers) {
      assert.ok(trigger.pattern.ignoreCase)
      if (trigger.lang === 'en') {
        // Nested alternatives inherit outer boundaries; each top-level branch needs its own.
        for (const branch of topLevelAlternatives(trigger.pattern.source)) {
          // A lookbehind on digits is a boundary too: \b cannot precede a full-width digit;
          // any other leading lookbehind must be followed by \b (re-inspection, chunk B/D tests, L-1).
          const head = stripLeadingLookbehinds(branch)
          const tail = stripTrailingLookaheads(branch)
          const digitBounded = /\(\?<!\[\\[dw]/u.test(branch.slice(0, branch.length - head.length))
          assert.ok((head.startsWith('\\b') || (digitBounded && head.startsWith('[\\d'))) && tail.endsWith('\\b'), `${recipe.id}: ${branch}`)
        }
      }
    }
    // publish-guard's waiver rule lives in the matcher (publishPolarity), not in unless.
    if (recipe.id !== 'publish-guard') assert.ok(recipe.unless.length > 0)
    else assert.deepEqual(recipe.unless, [])
    if (recipe.template === 'compose-rule') assert.ok(recipe.rule.en)
    if (recipe.template === 'submit-detector') assert.ok(recipe.note.en)
  }
  assert.equal(getRecipe('missing-recipe'), undefined)
  assert.match(getRecipe('lead-with-answer').rule.en, /\{max_lines\}/u)
  assert.match(getRecipe('lead-with-answer').rule.en, /\{max_chars_clause\}/u)
  assert.doesNotMatch(getRecipe('lead-with-answer').rule.en, /\{max_chars\}|greater than zero/u)
  assert.match(getRecipe('response-language').rule.en, /\{language\}/u)
  for (const key of ['min', 'max']) assert.ok(getRecipe('offer-options').rule.en.includes(`{${key}}`))
  assert.equal(getRecipe('publish-guard').priority, 'safety')
  assert.equal(getRecipe('lead-with-answer').rule.en, 'Lead with the answer. Keep explanations within {max_lines} lines{max_chars_clause}, unless the user asks for more detail or for complete code.')
  assert.match(getRecipe('one-next-step').rule.en, /unless the user signals a stop or sends a short state fragment\.$/u)
})

test('catalog row triggers declare cells and only avoid recipes read the left cell', () => {
  const allowLeft = new Set(['quiet-confirmations', 'offer-options', 'one-next-step', 'plain-language', 'trace-offers'])
  for (const recipe of RECIPES) {
    for (const trigger of recipe.triggers) {
      assert.ok(Object.hasOwn(trigger, 'cell'), `${recipe.id}: ${trigger.pattern}`)
      assert.ok(['left', 'right', 'any'].includes(trigger.cell), recipe.id)
      if (trigger.cell === 'left') assert.ok(allowLeft.has(recipe.id), recipe.id)
    }
  }
})

test('catalog derivations need at most three parameter evidence sources', () => {
  for (const recipe of RECIPES) {
    if (!recipe.deriveParams) continue
    // Derivable keys bound the number of parameter source lines. The confidence
    // source is also protected by the matcher's evidence tests.
    const eligible = Object.values(recipe.params).filter(param =>
      !param.multiple && (param.type === 'number' || (param.type === 'string' && Array.isArray(param.options))))
    assert.ok(eligible.length <= 3, `${recipe.id}: at most 3 parameters may be derived`)
    assert.deepEqual(recipe.deriveParams([], { language: 'ja' }), {}, recipe.id)
  }
})

test('EVENT_NAMES is non-empty, unique, sorted, and includes suppressed toast counts', () => {
  assert.ok(EVENT_NAMES.length > 0)
  assert.deepEqual(EVENT_NAMES, [...new Set(RECIPES.flatMap(recipe => recipe.metrics))].sort())
  assert.deepEqual(EVENT_NAMES, ['allowed', 'denied', 'detected', 'long_answers', 'long_turns', 'resumed', 'suppressed', 'ticks'])
  for (const id of ['focus-timer', 'running-indicator']) assert.ok(getRecipe(id).metrics.includes('suppressed'))
})

test('titles, summaries, rules, notes, and parameter descriptions contain no forbidden terms', () => {
  // Appendix A, both lists, with round 3a's case-sensitive ADD/ASD/HSP/IQ/OD/DAN.
  // References and recognition patterns are not injected prose.
  const forbidden = [
    /自閉症|自閉スペクトラム|神経発達症|発達障害|学習障害|知的障害|精神障害|気分障害|睡眠障害|愛着障害|抑うつ|抑鬱|(?:うつ|ウツ|鬱|欝)(?:病|状態|傾向|っぽい|気味|症状)|双極性|双極症|統合失調|パニック(?:障害|症)|強迫性|強迫症|社交不安|全般性不安|適応障害|摂食障害|依存症|人格障害|境界性|不安障害/iu,
    /(?<![A-Za-z0-9])(?:ADD|ASD|HSP|IQ|OD|DAN)(?![A-Za-z0-9])/u,
    /(?<![A-Za-z0-9])(?:ADHD|FSIQ|DSM|PTSD|ICD-?1[01]|F[0-9]{2}\.[0-9A-Z]{1,2}|autism|autistic|dyslexia|dyslexic|bipolar|schizophrenia|schizophrenic|OCD|personality disorder|depressive disorder|major depression|anxiety disorder|panic disorder|eating disorder|asperger)(?![A-Za-z0-9])/iu,
  ]
  for (const recipe of RECIPES) {
    const prose = [[recipe.title, ['en', 'ja']], [recipe.summary, ['en', 'ja']]]
    for (const key of ['rule', 'note']) if (Object.hasOwn(recipe, key)) prose.push([recipe[key], ['en']])
    for (const param of Object.values(recipe.params)) prose.push([param.title, ['en', 'ja']], [param.description, ['en', 'ja']])
    for (const [translated, languages] of prose) {
      assert.ok(translated && typeof translated === 'object' && !Array.isArray(translated), recipe.id)
      assert.deepEqual(Object.keys(translated).sort(), languages, recipe.id)
      for (const lang of languages) assert.equal(typeof translated[lang], 'string', `${recipe.id}: ${lang}`)
      for (const text of Object.values(translated)) {
        for (const pattern of forbidden) assert.doesNotMatch(text, pattern, recipe.id)
      }
    }
  }
  for (const text of ['ADD', 'ASD', 'HSP', 'IQ', 'OD', 'DAN', 'ADHD', 'FSIQ', 'DSM', 'adhd', 'fsiq', 'dsm', 'ptsd', 'ICD-10', 'F32.1', 'F43.10', 'F32.A', '自閉スペクトラム', 'うつっぽい', 'ウツ状態', '欝病', 'Major Depression']) {
    assert.ok(forbidden.some(pattern => pattern.test(text)), text)
  }
  for (const text of ['add', 'asd', 'hsp', 'iq', 'od', 'dan', 'Add', 'Asd', 'Hsp', 'Iq', 'Od', 'Dan', 'F12', 'address', 'DANger', 'xADD2']) {
    assert.ok(forbidden.every(pattern => !pattern.test(text)), text)
  }
})

test('required unless cases suppress negation and unrelated uses', () => {
  const negatives = [
    ['lead-with-answer', 'ja', '結論を先にと言ったが、急がないで'], ['lead-with-answer', 'ja', '簡潔でも短くしないで'],
    ['lead-with-answer', 'en', 'Be concise but not too short.'],
    ['lead-with-answer', 'ja', '短く答えても300字以上で。'],
    ['lead-with-answer', 'en', 'Be brief, but at least 300 characters.'],
    ['lead-with-answer', 'ja', '回答は300字以内ではなく500字以上で。'],
    ['lead-with-answer', 'en', 'Keep answers within 500 chars, but at least 300 chars.'],
    ['lead-with-answer', 'ja', '結論を先にしないでください。'],
    ['lead-with-answer', 'en', "Don't keep it brief."],
    ['no-psych-framing', 'ja', '心理学的なフレーミングを使ってください。'],
    ['offer-options', 'en', 'Compare options? I want only one option instead of alternatives.'],
    ['accept-typos-as-intent', 'ja', '誤字は訂正してください'],
    ['accept-typos-as-intent', 'en', 'please do correct my typos'],
    ['accept-typos-as-intent', 'en', 'please correct my typos'],
    // A predicate at the end of its clause states the opt-out (DESIGN §5.4a); the plain
    // form 「確認せずにpushする」 is no longer one (it is a habit as often as an order).
    ['publish-guard', 'ja', 'pushは確認しない'],
    ['publish-guard', 'ja', 'pushの許可なし'],
    ['publish-guard', 'ja', 'push は確認しなくていい'],
    ['publish-guard', 'ja', '許可なしにpushしてよい'],
    ['publish-guard', 'en', 'No confirmation needed for pushing'],
    ['publish-guard', 'en', 'No permission required for publishing'],
    ['publish-guard', 'en', 'Before you push, push without asking.'],
    ['publish-guard', 'en', 'Before you publish, publish with no confirmation.'],
    ['accept-typos-as-intent', 'en', 'Please fix my typos.'],
    ['offer-options', 'en', 'Do not list me some options.'],
    ['respect-stop-signals', 'en', 'Use stop words when I say stop for now.'],
    ['respect-stop-signals', 'en', 'When I say stop for now, please pause the timer.'],
    ['focus-timer', 'en', "I don't need a break reminder"],
    ['focus-timer', 'en', 'I hyperfocus, but no timer.'], ['focus-timer', 'en', "Don't remind me to take a break; no timer."],
    ['focus-timer', 'en', "I hyperfocus, but I don't want a timer."],
    ['focus-timer', 'ja', '過集中するがリマインド不要'], ['focus-timer', 'ja', '休憩のリマインド不要'],
  ]
  for (const [id, language, text] of negatives) {
    assertSuppressed(id, profileFrom([{ text }], { language }))
  }
  for (const [language, text] of [['ja', '誤字は訂正してほしくない'], ['en', 'Please do not correct my typos.'], ['en', 'Never push without permission.']]) {
    const id = text.includes('push') ? 'publish-guard' : 'accept-typos-as-intent'
    assert.ok(matchRecipes(profileFrom([{ text }], { language })).some(proposal => proposal.recipeId === id))
  }
  // Push-notification mentions are excluded at the object level of the trigger, not by a
  // line-level negation (chunk B, HIGH-2); they simply never propose the guard.
  for (const [language, text] of [['ja', 'push通知の前に確認してください'], ['en', 'Check with me before sending push notifications.']]) {
    assert.deepEqual(matchRecipes(profileFrom([{ text }], { language }), [getRecipe('publish-guard')]), [], text)
  }
})
test('narrow triggers distinguish requests from unrelated mentions', () => {
  const cases = [
    ['lead-with-answer', 'ja', '短く答えて。', 'ビルド時間を短く'],
    ['lead-with-answer', 'ja', '結論を先に。以上の方針で。', '短くしないで'],
    ['lead-with-answer', 'en', 'Answer first, at least for now.', 'At least try again.'],
    ['lead-with-answer', 'ja', '回答は２５０字以内で。', '回答は12.5字以内で。'],
    ['lead-with-answer', 'en', 'Replies within ２５０ chars.', 'Replies within 12.5 chars.'],
    ['lead-with-answer', 'en', 'Replies: ２５０ chars max.', 'Replies: １２．５ chars max.'],
    ['offer-options', 'ja', '３〜５案を示して。', '1.3〜5案という表記です。'],
    ['offer-options', 'en', '3-5 options.', '1.3-5 options.'],
    ['offer-options', 'en', 'More than one option, please.', 'More than one file exists.'],
    ['respect-stop-signals', 'ja', '終わりの合図を出したら止めて。', 'あとでテストしたら結果を教えて。'],
    ['respect-stop-signals', 'ja', 'おわりって言ったら止めて。', 'あとで出したら見て。'],
    ['block-ahead-warning', 'ja', '認証が続くと失速する。', '売上が失速している。'],
    ['block-ahead-warning', 'ja', '承認のたびに手数が増える。', '手順が増えて手数が増える。'],
    ['lead-with-answer', 'ja', 'この project では返答は300字以内。', 'この project のコメントは300字以内。'],
    ['lead-with-answer', 'en', 'Keep answers within 250 chars.', 'Keep commit subjects within 250 chars.'],
    // The object may follow the count (second re-inspection of the catalog, H-1).
    ['lead-with-answer', 'ja', '50文字以内の返答にする', '50文字以内のコミット件名にする'],
    ['lead-with-answer', 'en', 'Wrap at 72 chars max in replies', 'Wrap at 72 chars max in commit bodies'],
    ['lead-with-answer', 'en', 'Limit to 50 characters max for answers', 'Limit to 50 characters max for commit subjects'],
    ['publish-guard', 'en', 'Never push without checking with me.', 'Never push to main without running the tests'],
    ['publish-guard', 'en', 'Never push without confirming with me.', 'Never push without a changelog entry'],
    ['publish-guard', 'en', 'Do not push without my go-ahead.', 'Do not push without rebasing first'],
    ['publish-guard', 'en', 'Never publish without letting me review it.', 'Never publish without a version bump'],
    ['publish-guard', 'en', 'Never push without my approval.', 'Never push without running my tests'],
    ['publish-guard', 'en', 'Do not push without asking me.', 'Do not push without reviewing the diff yourself'],
    ['publish-guard', 'en', 'When asking, never push.', 'When asked, never push the branch'],
    ['publish-guard', 'en', "Don't push without me reviewing it", "Don't push without me around"],
    ['publish-guard', 'en', 'Never push without a review from me', 'Never push without a review of the tests'],
    ['publish-guard', 'en', 'Do not push unless asked', 'Do not push unless the tests pass'],
    ['publish-guard', 'en', 'Never publish unless the user asks', 'Never publish unless the build is green'],
    ['publish-guard', 'en', 'Never push without showing me first', 'Never push without squashing first'],
    ['publish-guard', 'en', "Don't push without letting me see it", "Don't push without a passing build"],
    ['publish-guard', 'en', "Don't push unless I say so", "Don't push unless the tests are confirmed green"],
    ['publish-guard', 'en', "Don't push until I tell you to", "Don't push until the branch is rebased"],
    ['publish-guard', 'en', 'Never publish before I give the go-ahead', 'Never publish before Friday'],
    ['publish-guard', 'en', "Don't push until I've confirmed.", "Don't push until the tests are confirmed green"],
    ['publish-guard', 'en', "Don't push until I've signed off.", "Don't push until the build is signed"],
    ['publish-guard', 'en', 'Never push unless confirmed.', 'Never push unless the build is confirmed green'],
    ['publish-guard', 'en', 'Never push unless the user explicitly confirms', 'Never push unless the linter explicitly passes'],
    ['publish-guard', 'en', "Don't push until you hear from me", "Don't push until you hear the build finish"],
    // Eighth re-inspection of the catalog: "my OK", "I'm OK with it" (H2), "confirmed by me"
    // (L1), was/were as CI tenses (L2).
    ['publish-guard', 'en', "Don't push until you get my OK.", "Don't push until the pipeline is green."],
    ['publish-guard', 'en', "Never push unless I'm OK with it.", "Never push unless it's a fork."],
    ['publish-guard', 'en', "Don't push until the build is confirmed by me", "Don't push until the build is confirmed"],
    ['publish-guard', 'en', "Don't push until the tests were confirmed by me", "Don't push until the tests were confirmed green"],
    // Ninth re-inspection of the catalog: the gate stays by default after unless/until/before
    // and is waived only for a CI, repository or calendar state (H-3, M-1, L-1).
    ['publish-guard', 'en', "Don't push until I'm happy with it", "Don't push until the tests are green"],
    ['publish-guard', 'en', "Never push unless it's OK with me", "Never push unless it's merged"],
    ['publish-guard', 'en', "Don't push until I'm satisfied", "Don't push until the migration has run"],
    ['publish-guard', 'en', "Never push unless we're OK with it", "Never push unless the repo is public"],
    ['publish-guard', 'en', 'Never push without the build being confirmed by me', 'Never push without the build being confirmed'],
    // Tenth re-inspection of the catalog: "green light" (F-2), OK'd / looks good and an unbounded
    // person search (F-3), "before lunch" keeps the gate as the design says (F-4).
    ['publish-guard', 'en', 'Never push until you get the green light.', 'Never push until the light turns green'],
    ['publish-guard', 'en', "Don't push until it's OK'd", "Don't push until it's merged"],
    ['publish-guard', 'en', "Don't push until it looks good", "Don't push until it builds"],
    ['publish-guard', 'en', "Don't push until the changes on the feature branch have been reviewed by me", "Don't push until the changes on the feature branch have been rebased"],
    ['publish-guard', 'en', 'Never push before lunch', 'Never push before the weekend'],
    ['publish-guard', 'ja', 'pushは私がいいと言ってから', 'pushは私がやるので気にしなくていい'],
    ['publish-guard', 'ja', '本人の合図があるまで公開しないで', '原稿が届くまで公開しないで'],
    // Eleventh re-inspection of the catalog: "green light" with a space (H-1), a person's branch
    // or machine is a state (M-1), "it's OK" (M-3), a CI's OK and 合図 after the push (F-6).
    ['publish-guard', 'en', "Don't push until the changes get the green light", "Don't push until the changes are green"],
    ['publish-guard', 'en', "Don't push until you get a thumbs up on this", "Don't push until the thumbnails are generated on CI"],
    ['publish-guard', 'en', "Don't push until it's OK", "Don't push until it's green"],
    ['publish-guard', 'ja', 'pushは私がレビューしてから', 'pushは私のブランチにマージしてからでいい'],
    ['publish-guard', 'ja', '私がいいと言うまで公開しないで', 'こちらの環境でテストしてから公開して'],
    ['publish-guard', 'ja', '私のOKが出てからpushして', 'テストのOKが出てからpushして'],
    ['publish-guard', 'ja', 'pushする前に合図して', 'pushしてから合図して'],
    // Twelfth re-inspection of the catalog: what the person looks at before saying so (高-1), a
    // review received rather than the agent's own (中-1), the ASCII bounds of OK (低-2).
    ['publish-guard', 'ja', '私がいいと言ってからコードをpushして', '私のブランチにマージしてからコードをpushして'],
    ['publish-guard', 'ja', 'pushは私がコードを見てから', 'pushは私がテストしてから'],
    ['publish-guard', 'ja', '公開は私が原稿を読んでからにして', '公開はこちらの環境でビルドが通ってからにして'],
    ['publish-guard', 'ja', 'PRを出す前にレビューをもらって', 'PRを出す前に自分でコードをレビューして'],
    ['publish-guard', 'ja', 'pushはレビューが通ってから', 'PRをレビューしてコメントして'],
    ['publish-guard', 'ja', 'pushはOKをもらってから', 'pushはLOOKをもらってから'],
    // Thirteenth re-inspection of the catalog: received reviews in more words (H-1), a state verb
    // followed by the person's say-so (H-2), the person's machine with a say-so after it (L-1).
    ['publish-guard', 'ja', 'pushはレビューしてもらってから', 'pushは自分でレビューしてコメントして'],
    ['publish-guard', 'ja', 'レビュー後にpushして', 'リベース後にpushして'],
    ['publish-guard', 'ja', 'レビューを経てから公開', 'テストを経てから公開'],
    ['publish-guard', 'ja', '私がテストしてOKを出すまでpushしないで', '私がテストしてから、pushはしていい'],
    ['publish-guard', 'ja', '私が一通りテストして、いいと言うまでpushしないで', 'CIが一通りテストして、緑になるまでpushしないで'],
    ['publish-guard', 'ja', 'pushは本人の手元でいいと言ってから', 'pushは本人の手元でビルドが通ってから'],
    // Fourteenth re-inspection of the catalog: a say-so before a state verb (H-B), the agent's own
    // review a few characters after 自分で (M-2), CIのチェック (L-1).
    ['publish-guard', 'ja', '私が確認してマージするまでpushしないで', '私のブランチにマージするまでpushしないで'],
    ['publish-guard', 'ja', '私がレビューしてマージするまで公開しないで', 'CIがテストしてマージするまで公開しないで'],
    ['publish-guard', 'ja', 'push前にレビューしてもらってから出して', 'push前に自分でコードをレビューしてから出して'],
    ['publish-guard', 'ja', '私のPCで私がチェックしてから公開', '私のPCでCIのチェックが通ってから公開'],
    // Fifteenth re-inspection of the catalog: 後に・後で as linkers again (H-1), the 自分で window
    // stops at てから (H-2), lint のチェック (L-3).
    ['publish-guard', 'ja', '確認後にpushして', '確認は後でいいので先にpushして'],
    ['publish-guard', 'ja', '承認後にリリースして', '承認はあとでかまわないのでリリースして'],
    ['publish-guard', 'ja', '許可をもらった後でpushしてください', 'ビルドが通った後でpushしてください'],
    ['publish-guard', 'ja', 'pushする前に自分でテストしてからレビューしてもらって', 'pushする前に自分でテストしてからレビューして'],
    ['publish-guard', 'ja', '私がチェックしてから公開', '私のPCでlint のチェックが通ってから公開'],
    // Sixteenth re-inspection of the catalog: the ask word put off (High-1), a person's check in other
    // words before a state (Medium-1), the agent's own review across て (Medium-3), lint のOK (Low-1).
    ['publish-guard', 'ja', '確認後にpushして', '確認は後にしてpushして'],
    ['publish-guard', 'ja', '承認後にリリースして', '承認は後でもいいので先にリリースして'],
    ['publish-guard', 'ja', '公開は私がデプロイして、動作に納得してから', '公開は私のブランチにCIがデプロイしてから'],
    // No person at all is no say-so either (eighteenth re-inspection of the matcher, L-2).
    ['publish-guard', 'ja', '公開は私がデプロイして、動作を確かめてから', '公開はCIがデプロイして、ヘルスチェックが通ってから'],
    ['publish-guard', 'ja', 'pushはテストも確認も終わった後にして', 'pushの確認はひとまず後にして'],
    // Eighteenth re-inspection of the catalog: 後でもう一度 is a linker (F-2), 後で取る/後で、 are put off
    // without a gate (F-3), a self review stays the agent's own (F-4).
    ['publish-guard', 'ja', 'レビューを受けた後でもう一度pushして', 'レビューは後でもいいのでpushして'],
    ['publish-guard', 'ja', '承認を得た後でリリースして', '承認は後で取るので先にリリースして'],
    ['publish-guard', 'ja', '確認した後で、pushして', '確認は後で、先にpushして'],
    ['publish-guard', 'ja', 'レビューが通ってからpushして', 'セルフレビューが済んでからpushして'],
    // Nineteenth re-inspection of the catalog: a review of the agent's own code is still a review (M-3),
    // each word that keeps 後で from linking (L-2).
    ['publish-guard', 'ja', '自分で書いたコードのレビューが通ってからpushして', '自分でコードをレビューしてからpushして'],
    ['publish-guard', 'ja', '承認を得た後でリリースして', '承認は後でもらうので先にリリースして'],
    ['publish-guard', 'ja', '確認した後でpushして', '確認は後でするので先にpushして'],
    ['publish-guard', 'ja', '確認した後でpushして', '確認は後でやるので先にpushして'],
    ['publish-guard', 'ja', '確認した後でpushして', '確認は後に回すので先にpushして'],
    ['publish-guard', 'ja', '確認した後でpushして', '確認はまず後でいいのでpushして'],
    // 「その後で」 is a gate only after an ask word or a person (confirmation round, 中1).
    ['publish-guard', 'ja', 'レビューはPRを作った後にして、pushはその後で', 'lintを直して、pushはその後で自由にして'],
    // Twentieth re-inspection of the catalog: a verb before 後でいいので still links (H-b), a review the agent
    // does itself even when written 「のレビューをして」 (M-c), and one pair per adverb and exclusion word (L-2).
    ['publish-guard', 'ja', '承認をもらった後でいいのでリリースして', '承認は後でもらうのでリリースして'],
    ['publish-guard', 'ja', '確認した後でいいのでpushして', '確認は後でいいのでpushして'],
    ['publish-guard', 'ja', 'レビューをもらってからpushして', '自分でコードのレビューをしてからpushして'],
    ...['一旦', 'いったん', 'とりあえず', 'ひとまず', 'まず', 'もう', 'また', 'もっと', 'もう少し', '全部', 'すべて', '全て', '基本', '基本的に', '原則', 'いつも', '毎回', '今は', '今回は', '当面', 'しばらく', 'なるべく', 'できれば'].map(adverb => ['publish-guard', 'ja', '確認した後でpushして', `確認は${adverb}後でいいので先にpushして`]),
    ...['済ませる', '回す', 'OKな', '構わない', '大丈夫な', 'もいい', 'する', '取る'].map(word => ['publish-guard', 'ja', '確認した後でpushして', `確認は後で${word}ので先にpushして`]),
    ['publish-guard', 'ja', 'レビューしてもらってからpushして', '自分でテストを書いてレビューしてからpushして'],
    ['publish-guard', 'ja', 'pushは私のOKが出てから', 'pushはlint のOKが出てから'],
    // Seventeenth re-inspection of the matcher: 「確認後にして」 asks first, 「確認は後にして」 puts it off (HIGH-1, MEDIUM-1).
    ['publish-guard', 'ja', 'pushは確認後にして', 'pushの確認は後にして'],
    ['publish-guard', 'ja', 'リリースは承認後にして。', 'リリースの承認は後にして。'],
    ['publish-guard', 'ja', 'pushはレビュー後で大丈夫', 'pushのレビューは後で大丈夫'],
    ['publish-guard', 'ja', '公開は承認後でもいい', '公開の承認は後でもいい'],
    // Seventeenth re-inspection of the catalog: a review received after the agent's own work (H-1).
    ['publish-guard', 'ja', '自分でテストしてレビューしてもらってからpushして', '自分でテストしてレビューしてからpushして'],
    ['publish-guard', 'ja', '自分で直してレビューしてもらってからpushして', '自分で直してレビューしてからpushして'],
    ['lead-with-answer', 'ja', '250字以内で答えて件名は不要', '250字以内のコミット件名にする'],
    ['lead-with-answer', 'ja', '50字以内で返答する', '50字以内でコミット件名を付ける'],
    ['lead-with-answer', 'ja', '72字以内に収まる回答', '72字以内に収まる件名'],
    ['block-ahead-warning', 'ja', 'トークンの入力で手数が増える。', 'トークンの価格で手数料が増える。'],
    ['block-ahead-warning', 'ja', 'トークン認証のたびに失速する。', 'トークン消費で応答が失速する。'],
    ['respect-stop-signals', 'ja', '「あとで」と言ったら止めて。', 'あとで打ったら教えて。'],
    ['respect-stop-signals', 'ja', 'あとでって言ったら止めて。', 'あとでいったら電話して。'],
    ['block-ahead-warning', 'ja', '認証が続くと失速する。', '売上を確認したら失速していた。'],
    ['quiet-confirmations', 'en', 'Skip the routine confirmations', 'Never just skip the confirmation step'],
    ['respect-stop-signals', 'en', 'Wrap up for now.', 'Please pause.'],
    ['respect-stop-signals', 'en', 'Wrap up for today.', 'Wrap up each answer with a one-line summary'],
    ['respect-stop-signals', 'en', 'When I say "wrap up", stop.', 'Wrap up this function into a module.'],
    ['respect-stop-signals', 'en', "When I type 'wrap up', stop.", 'Please pause the timer.'],
    ['receive-only-fragments', 'en', 'Just receive it without advice.', 'When you receive it, validate the JSON'],
    ['receive-only-fragments', 'en', 'Receive it and acknowledge.', 'Receive it tomorrow.'],
    ['session-resume-brief', 'ja', '前回の内容を読み直して復帰します。', '送信前にコードを読み直してから答えて'],
    ['session-resume-brief', 'ja', '毎回内容を読み直します。', 'コードを読み直して答えて。'],
    ['session-resume-brief', 'ja', '復帰したら読み直します。', '読み直してください。'],
    ['session-resume-brief', 'en', 'Re-read everything when I resume.', 'Re-read the code before answering.'],
    ['session-resume-brief', 'en', 'Re-read where I was last time.', 'Re-read this paragraph.'],
    ['running-indicator', 'ja', '進捗が不確実なので表示して。', '不確実な点は明示して'],
    ['running-indicator', 'ja', '進み具合が不確実です。', '結論が不確実です。'],
    ['running-indicator', 'ja', '状態が不確実なので知らせて。', '予測が不確実です。'],
    ['focus-timer', 'ja', '時間を忘れてしまいます。', '締切の時間を忘れずに伝えて'],
    ['publish-guard', 'ja', 'PRを出す前に確認して', 'PRのレビュー結果を確認して'],
    ['publish-guard', 'ja', '公開の前に確認して', '非公開の前に確認して'],
    ['publish-guard', 'ja', '公開する前に確認して', '公開鍵を出す前に確認して'],
    ['publish-guard', 'en', 'Ask me before pushing.', 'Ask me before lunch.'],
    ['publish-guard', 'en', 'Before you publish, check with me.', 'Before publishers arrive, check the room.'],
    ['response-language', 'ja', '返答は日本語で。', 'コードのコメントは日本語で。'],
    ['response-language', 'en', 'Reply in Japanese.', 'I can read Japanese.'],
    ['lead-with-answer', 'ja', '250字以内で。', '250字の例文です。'],
    ['lead-with-answer', 'en', 'Within 250 characters, please.', 'Within 250 words, please.'],
    ['response-language', 'en', 'Respond in Japanese.', 'Respond in my preferred language.'],
    ['response-language', 'en', 'Reply in English.', 'Reply in detail.'],
    ['response-language', 'en', 'Answer in Japanese.', 'Answer in JSON.'],
    ['offer-options', 'en', 'Offer me some alternatives.', 'There are alternatives to this package.'],
    ['offer-options', 'en', 'Three to five options, please.', 'One option has several alternatives.'],
    ['focus-timer', 'ja', '休憩を教えてください。', '休憩室を掃除します。'],
    ['focus-timer', 'ja', 'タイマーをかけてください。', 'タイマーの実装を説明します。'],
    ['focus-timer', 'en', 'Remind me to take a break.', 'Remind me to attend a meeting.'],
    ['focus-timer', 'en', 'Use pomodoro.', 'Set a timer for the build.'],
    ['block-ahead-warning', 'ja', '認証が面倒で作業が止まります。', '認証方式を説明してください。'],
    ['block-ahead-warning', 'ja', '許可ダイアログが煩雑です。', '許可ダイアログの色を変更します。'],
    ['session-resume-brief', 'ja', '案件を並行して進めます。', '表示を切り替えてください。'],
    ['respect-stop-signals', 'ja', 'あとでと言ったら止める合図です。', 'あとで見返せるように要約して。'],
    ['respect-stop-signals', 'ja', '一旦ここまでと打ったら止めて。', '関数の終わりにログを追加して。'],
    ['publish-guard', 'ja', '公開前に確認して。', '公開リストを確認して。'],
    ['receive-only-fragments', 'ja', 'まず受け取ってください。', '荷物を受け取ってください。'],
    ['running-indicator', 'en', "I can't tell whether you are working.", "I can't tell whether the answer is correct."],
  ]
  for (const [id, language, positive, unrelated] of cases) {
    const recipe = getRecipe(id)
    assert.equal(matchRecipes(profileFrom([{ text: positive }], { language }), [recipe]).length, 1, positive)
    // These are trigger-narrowing checks, not unless checks: no trigger should fire.
    const profile = profileFrom([{ text: unrelated }], { language })
    assert.deepEqual(matchRecipes(profile, [{ ...recipe, unless: [] }]), [], unrelated)
    assert.deepEqual(matchRecipes(profile, [recipe]), [], unrelated)
  }
})

test('unrelated correction requests do not suppress reading past typos', () => {
  const recipe = getRecipe('accept-typos-as-intent')
  for (const text of ['Please fix the build; read my typos as intended.', 'Please correct the output; ignore my misspellings.']) {
    assert.equal(matchRecipes(profileFrom([{ text }], { language: 'en' }), [recipe]).length, 1, text)
  }
  assertSuppressed(recipe, profileFrom([{ text: 'Please fix my typos.' }], { language: 'en' }))
})

test('routine confirmation opt-outs keep explicit publishing gates enabled', () => {
  for (const [language, text] of [
    ['ja', '都度確認不要、ただし push は確認して'],
    ['en', 'No confirmation needed for edits, but ask before pushing'],
  ]) {
    const proposals = matchRecipes(profileFrom([{ section: 'care', text }], { language }))
    assert.deepEqual(proposals.map(proposal => proposal.recipeId).sort(), ['publish-guard', 'quiet-confirmations'])
    assert.ok(proposals.every(proposal => proposal.enabledByDefault))
  }
  const summary = getRecipe('publish-guard').summary.ja
  assert.match(summary, /Bash以外のツール/u)
  assert.match(summary, /内部でpushするスクリプトは保護できません/u)
})

test('unless applies across languages', () => {
  assertSuppressed('lead-with-answer', profileFrom([{ text: '短く答えて; not too short.' }], { language: 'ja' }))
  assertSuppressed('lead-with-answer', profileFrom([{ text: 'Be brief。短くしないで。' }], { language: 'en' }))
})

function probeRecipe(triggers, overrides = {}) {
  return { ...getRecipe('lead-with-answer'), id: 'probe', triggers, unless: [], params: {}, deriveParams: undefined, ...overrides }
}

test('row triggers read only their selected cell, and any reads cells separately', () => {
  const row = profileFrom([{ kind: 'row', text: 'needle | other', left: 'needle', right: 'other' }], { language: 'en' })
  row.lines[0].quote = row.lines[0].raw = '|needle|other|'
  for (const [cell, expected] of [['left', 1], ['right', 0], ['any', 1], [undefined, 1]]) {
    const recipe = probeRecipe([{ lang: 'any', pattern: /\bneedle\b/iu, cell }])
    const proposals = matchRecipes(row, [recipe])
    assert.equal(proposals.length, expected, String(cell))
    if (expected) assert.equal(proposals[0].evidence[0].quote, '|needle|other|')
  }
  const swapped = profileFrom([{ kind: 'row', text: 'other | needle', left: 'other', right: 'needle' }])
  assert.equal(matchRecipes(swapped, [probeRecipe([{ lang: 'any', pattern: /needle/iu, cell: 'right' }])]).length, 1)
  assert.equal(matchRecipes(swapped, [probeRecipe([{ lang: 'any', pattern: /needle/iu, cell: 'left' }])]).length, 0)
  assert.equal(matchRecipes(row, [probeRecipe([{ lang: 'any', pattern: /needle\s*\|\s*other/iu }])]).length, 0)
})

test('row unless checks stay in the matched cell and continue past a suppressed cell', () => {
  const recipe = probeRecipe([{ lang: 'any', pattern: /needle \w+/iu, cell: 'any' }], {
    unless: [{ lang: 'ja', pattern: /\bveto\b/iu }],
  })
  for (const [left, right] of [['veto needle blocked', 'needle kept'], ['needle kept', 'veto needle blocked']]) {
    const text = `${left} | ${right}`
    const profile = profileFrom([{ kind: 'row', text, left, right }], { language: 'en' })
    const proposal = matchRecipes(profile, [recipe])[0]
    assert.ok(proposal, text)
    assert.equal(proposal.evidence[0].matched, 'needle kept')
    for (const kind of ['bullet', 'text']) {
      assertSuppressed(recipe, profileFrom([{ kind, text }], { language: 'en' }))
    }
  }
})

test('DO/DONT row negations do not cancel publishing or quiet-confirmation requests in the other cell', () => {
  for (const [id, section, language, left, right] of [
    ['publish-guard', 'boundaries', 'ja', 'push前の確認は不要です。', '外部公開やpushの前にはy/nで確認してください。'],
    ['publish-guard', 'boundaries', 'en', 'Do not ask before you push.', 'Ask before you push.'],
    ['quiet-confirmations', 'care', 'ja', '念のため確認', '念のため確認は必要です。'],
    ['quiet-confirmations', 'care', 'en', 'over-confirm', "Don't just do it; ask every time."],
  ]) {
    const recipe = getRecipe(id)
    const negation = id === 'publish-guard' ? left : right
    // publish-guard decides waivers in the matcher (publishPolarity); the others by unless.
    if (id !== 'publish-guard') assert.ok(recipe.unless.some(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(negation)), id)
    const raw = `| ${left} | ${right} |`
    const profile = profileFrom([{ kind: 'row', section, text: `${left} | ${right}`, left, right, raw }], { language })
    const proposal = matchRecipes(profile, [recipe])[0]
    assert.ok(proposal, `${id}: ${language}`)
    assert.equal(proposal.confidence, 'high')
    assert.equal(proposal.evidence[0].quote, raw)
    assert.ok((id === 'publish-guard' ? right : left).includes(proposal.evidence[0].matched))
  }
})

test('catalog row polarity: left avoid wording requests the opposite behavior', () => {
  const wrongCell = profileFrom([{ kind: 'row', text: 'keep it short | give detailed context', left: 'keep it short', right: 'give detailed context' }], { language: 'en' })
  const lead = getRecipe('lead-with-answer')
  const readAny = { ...lead, triggers: lead.triggers.map(trigger => ({ ...trigger, cell: 'any' })) }
  assert.equal(matchRecipes(wrongCell, [readAny]).length, 1, 'left wording must actually trigger when read')
  assert.deepEqual(matchRecipes(wrongCell, [lead]), [])
  const options = getRecipe('offer-options')
  for (const [language, left, right] of [
    ['en', 'only one option', 'show distinct choices'],
    ['en', 'a single option', 'show distinct choices'],
    ['ja', '一案だけ', '違いを示してほしい'],
    ['ja', '一択', '違いを示してほしい'],
  ]) {
    const profile = profileFrom([{ kind: 'row', text: `${left} | ${right}`, left, right }], { language })
    const proposal = matchRecipes(profile, [options])[0]
    assert.ok(proposal, left)
    assert.ok(left.includes(proposal.evidence[0].matched), left)
    const swapped = profileFrom([{ kind: 'row', text: `${right} | ${left}`, left: right, right: left }], { language })
    assert.deepEqual(matchRecipes(swapped, [options]), [], left)
  }
  const positive = profileFrom([{ kind: 'row', text: 'other | more than one option', left: 'other', right: 'more than one option' }], { language: 'en' })
  assert.equal(matchRecipes(positive, [options]).length, 1)
  const misplaced = profileFrom([{ kind: 'row', text: 'more than one option | other', left: 'more than one option', right: 'other' }], { language: 'en' })
  const optionsAny = { ...options, triggers: options.triggers.map(trigger => ({ ...trigger, cell: 'any' })) }
  assert.equal(matchRecipes(misplaced, [optionsAny]).length, 1)
  assert.deepEqual(matchRecipes(misplaced, [options]), [])
})

test('quiet-confirmations reads avoid wording on the left and action wording on the right', () => {
  const recipe = getRecipe('quiet-confirmations')
  for (const [language, left, right] of [
    ['ja', '念のため確認ですが、のような過剰確認', '即実行。止めるべき場面だけ明示して止まる'],
    ['ja', '念のため確認', '必要な時だけ止まる'],
    ['ja', '過剰確認', '必要な時だけ止まる'],
    ['en', 'over-confirm', 'Proceed with routine work'],
  ]) {
    const profile = profileFrom([{ kind: 'row', text: `${left} | ${right}`, left, right }], { language })
    const proposal = matchRecipes(profile, [recipe]).find(item => item.recipeId === recipe.id)
    assert.ok(proposal, left)
    assert.ok(left.includes(proposal.evidence[0].matched), left)
  }
  for (const [language, text] of [['ja', '即実行'], ['en', 'Just do it.']]) {
    const profile = profileFrom([{ kind: 'row', text: `other | ${text}`, left: 'other', right: text }], { language })
    assert.equal(matchRecipes(profile, [recipe]).length, 1, text)
  }
  for (const [language, text] of [['ja', '過剰確認'], ['en', 'over-confirm']]) {
    const profile = profileFrom([{ kind: 'row', text: `other | ${text}`, left: 'other', right: text }], { language })
    assert.deepEqual(matchRecipes(profile, [recipe]), [], text)
  }
})

test('catalog positive requests read the DO cell; authentication burdens also match bullets', () => {
  for (const [id, section, ja, , en] of CASES) {
    for (const [language, text] of [['ja', ja], ['en', en]]) {
      const recipe = getRecipe(id)
      const profile = profileFrom([{ section, kind: 'row', left: 'other', right: text, text: `other | ${text}` }], { language })
      assert.equal(matchRecipes(profile, [recipe]).length, 1, `${id}: ${language}`)
      const swapped = profileFrom([{ section, kind: 'row', left: text, right: 'other', text: `${text} | other` }], { language })
      assert.deepEqual(matchRecipes(swapped, [recipe]), [], `${id}: ${language}`)
    }
  }
  const profile = profileFrom([{ section: 'weak', text: '認証やPATの手数が負担で失速します。' }])
  assert.equal(matchRecipes(profile, [getRecipe('block-ahead-warning')]).length, 1)
})

test('only bullet, row, and text candidates outside history and examples can match', () => {
  for (const override of [
    { kind: 'comment' }, { kind: 'heading' }, { kind: 'blank' }, { kind: 'frontmatter' }, { kind: 'code' },
    { section: 'history' }, { inExample: true },
  ]) {
    assert.deepEqual(matchRecipes(profileFrom([{ text: 'Answer first.', ...override }], { language: 'en' })), [])
  }
  for (const kind of ['bullet', 'row', 'text']) {
    const profile = profileFrom([{ kind, text: 'Answer first.', left: '', right: 'Answer first.' }], { language: 'en' })
    assert.ok(matchRecipes(profile).some(proposal => proposal.recipeId === 'lead-with-answer'))
  }
})

test('trigger language, ASCII word boundaries, empty matches, and regex state are respected', () => {
  const profile = profileFrom([{ text: 'needle' }])
  assert.equal(matchRecipes(profile, [probeRecipe([{ lang: 'en', pattern: /needle/iu }])]).length, 0)
  assert.equal(matchRecipes(profile, [probeRecipe([{ lang: 'any', pattern: /needle/iu }])]).length, 1)
  assert.equal(matchRecipes(profile, [probeRecipe([{ lang: 'any', pattern: /(?:)/iu }])]).length, 0)
  const pattern = /needle/giu
  pattern.lastIndex = 5
  const recipe = probeRecipe([{ lang: 'any', pattern }])
  const first = matchRecipes(profile, [recipe])
  assert.equal(first.length, 1)
  assert.deepEqual(matchRecipes(profile, [recipe]), first)
  assert.equal(pattern.lastIndex, 5)
  assert.ok(matchRecipes(profileFrom([{ text: 'BRIEF' }], { language: 'en' })).some(proposal => proposal.recipeId === 'lead-with-answer'))
  assert.ok(!matchRecipes(profileFrom([{ text: 'briefcase' }], { language: 'en' })).some(proposal => proposal.recipeId === 'lead-with-answer'))
})

test('confidence follows format and section, including generic and unknown profiles', () => {
  for (const [format, section, expected] of [
    ['kokoro', 'style', 'high'], ['torisetsu', 'style', 'high'],
    ['generic', 'style', 'medium'], ['kokoro', 'about', 'medium'],
    ['generic', 'unknown', 'low'], ['kokoro', 'unknown', 'low'],
  ]) {
    const profile = profileFrom([{ section, text: 'Answer first.' }], { format, language: 'en' })
    assert.equal(matchRecipes(profile).find(proposal => proposal.recipeId === 'lead-with-answer').confidence, expected)
  }
  const mixed = profileFrom([{ section: 'unknown', text: 'Answer first.' }, { section: 'style', text: 'Keep it short.' }], { language: 'en' })
  assert.equal(matchRecipes(mixed).find(proposal => proposal.recipeId === 'lead-with-answer').confidence, 'high')
})

test('evidence retains the first hit that determines confidence beyond the initial three', () => {
  for (const [format, section, expected] of [
    ['kokoro', 'style', 'high'], ['torisetsu', 'style', 'high'],
    ['generic', 'style', 'medium'], ['kokoro', 'about', 'medium'],
  ]) {
    const profile = profileFrom([
      ...Array.from({ length: 3 }, () => ({ section: 'unknown', text: 'Answer first.' })),
      { section, text: 'Keep it short.' }, { section, text: 'Answer first.' },
    ], { format, language: 'en' })
    profile.lines.reverse()
    const proposal = matchRecipes(profile, [getRecipe('lead-with-answer')])[0]
    assert.equal(proposal.confidence, expected)
    assert.deepEqual(proposal.evidence.map(hit => hit.line), [1, 2, 4])
    assert.equal(proposal.evidence.at(-1).quote, 'Keep it short.')
  }
})

test('evidence quotes the parser\'s comment-free quote and refuses a line without one', () => {
  const recipe = probeRecipe([{ lang: 'any', pattern: /needle/iu, cell: 'any' }])
  const profile = profileFrom([
    { text: 'needle', raw: '- need<!-- private -->le <!-- hidden -->', quote: '- needle ' },
    { kind: 'row', text: 'skip | needle', left: 'skip', right: 'needle', raw: '| skip <!-- private row --> | needle |', quote: '| skip  | needle |' },
    { kind: 'text', text: 'needle', raw: '> needle', quote: '> needle' },
  ])
  const snapshot = structuredClone(profile)
  const proposal = matchRecipes(profile, [recipe])[0]
  assert.deepEqual(proposal.evidence.map(({ quote, matched }) => ({ quote, matched })), [
    { quote: '- needle ', matched: 'needle' },
    { quote: '| skip  | needle |', matched: 'needle' },
    { quote: '> needle', matched: 'needle' },
  ])
  assert.deepEqual(profile, snapshot)
  // A line without `quote` is never quoted from `raw` (an inline comment could leak);
  // the matcher refuses it (final inspection, chunk D, L2).
  const broken = profileFrom([{ text: 'needle', raw: '- needle <!-- private -->', quote: '- needle ' }])
  delete broken.lines[0].quote
  assert.throws(() => matchRecipes(broken, [recipe]), TypeError)
})

test('evidence is capped at the first three source lines and first parameter values win', () => {
  const profile = profileFrom([
    { text: 'Answer first within 120 chars.' }, { text: 'Be concise within 400 characters.' },
    { text: 'Keep it short: 600 words.' }, { text: 'Be brief within 800 chars.' },
  ], { language: 'en' })
  for (const line of profile.lines) line.quote = line.raw = `- ${line.text}`
  profile.lines.reverse()
  const snapshot = structuredClone(profile)
  const proposal = matchRecipes(profile).find(item => item.recipeId === 'lead-with-answer')
  assert.deepEqual(proposal.evidence.map(hit => hit.line), [1, 2, 3])
  assert.deepEqual(proposal.evidence.map(hit => hit.quote), [...profile.lines].reverse().slice(0, 3).map(line => line.raw))
  assert.equal(proposal.params.max_chars, 120)
  assert.deepEqual(profile, snapshot)
})

test('ranking uses confidence, capped evidence count, catalog order, and maxEnabled', () => {
  const profile = profileFrom([
    { text: 'Answer first.' }, { text: 'Accept my typos as intended.' }, { text: 'Ignore my misspellings.' },
    { text: 'Reply in Japanese.' }, { section: 'care', text: 'Just acknowledge short fragments.' },
    { section: 'about', text: 'One thing at a time.' }, { section: 'about', text: 'Break it down.' },
    { section: 'unknown', text: 'Use a break reminder.' }, { section: 'unknown', text: 'Use pomodoro.' },
    { section: 'unknown', text: 'I lose track of time.' }, { section: 'unknown', text: 'Set a timer.' },
  ], { language: 'en' })
  const expected = ['accept-typos-as-intent', 'lead-with-answer', 'response-language', 'receive-only-fragments', 'one-next-step', 'focus-timer']
  const proposals = matchRecipes(profile)
  assert.deepEqual(proposals.map(proposal => proposal.recipeId), expected)
  assert.equal(proposals.filter(proposal => proposal.enabledByDefault).length, DEFAULT_MAX_ENABLED)
  assert.deepEqual(matchRecipes(profile), proposals)
  for (const maxEnabled of [0, 2, Infinity]) {
    const selected = matchRecipes(profile, RECIPES, { maxEnabled })
    assert.deepEqual(selected.map(proposal => proposal.recipeId), expected)
    assert.deepEqual(selected.map(proposal => proposal.enabledByDefault), expected.map((_, index) => index < maxEnabled))
  }
})

test('safety ranks ahead of three high-confidence style recipes with three quotes each', () => {
  const expected = ['publish-guard', 'lead-with-answer', 'accept-typos-as-intent', 'response-language']
  for (const section of ['boundaries', 'unknown']) {
    const profile = profileFrom([
      ...['Answer first.', 'Read my typos as intended.', 'Reply in Japanese.']
        .flatMap(text => Array.from({ length: 3 }, () => ({ text }))),
      { section, text: 'Ask before you push.' },
    ], { language: 'en' })
    const proposals = matchRecipes(profile)
    assert.deepEqual(proposals.map(proposal => proposal.recipeId), expected)
    assert.deepEqual(proposals.map(proposal => proposal.evidence.length), [1, 3, 3, 3])
    assert.deepEqual(proposals.map(proposal => proposal.confidence), [section === 'unknown' ? 'low' : 'high', 'high', 'high', 'high'])
    assert.deepEqual(proposals.map(proposal => proposal.enabledByDefault), [true, true, true, false])
    for (const maxEnabled of [0, 1, Infinity]) {
      const selected = matchRecipes(profile, RECIPES, { maxEnabled })
      assert.deepEqual(selected.map(proposal => proposal.recipeId), expected)
      assert.deepEqual(selected.map(proposal => proposal.enabledByDefault), expected.map((_, index) => index < maxEnabled))
    }
  }
})

test('maxEnabled rejects values other than non-negative integers and Infinity even without hits', () => {
  for (const profile of [profileFrom([]), profileFrom([{ text: 'Answer first.' }], { language: 'en' })]) {
    for (const maxEnabled of [-1, '3', 0.5, NaN, -Infinity, null, true, {}, 3n]) {
      assert.throws(() => matchRecipes(profile, RECIPES, { maxEnabled }), TypeError, String(maxEnabled))
    }
  }
})

test('five hits tie three hits within one confidence, then catalog order wins', () => {
  const profile = profileFrom([
    ...Array.from({ length: 5 }, () => ({ text: 'Read my typos as intended.' })),
    ...Array.from({ length: 3 }, () => ({ text: 'Answer first.' })),
    ...Array.from({ length: 3 }, () => ({ text: 'Reply in Japanese.' })),
    { text: 'One next step.' }, { text: 'One thing at a time.' },
  ], { language: 'en' })
  const proposals = matchRecipes(profile)
  assert.ok(proposals.every(proposal => proposal.confidence === 'high'))
  assert.deepEqual(proposals.map(proposal => proposal.evidence.length), [3, 3, 3, 2])
  assert.deepEqual(proposals.map(proposal => proposal.recipeId), ['lead-with-answer', 'accept-typos-as-intent', 'response-language', 'one-next-step'])
  const reversed = matchRecipes(profile, [...RECIPES].reverse())
  assert.deepEqual(reversed.map(proposal => proposal.recipeId), ['response-language', 'accept-typos-as-intent', 'lead-with-answer', 'one-next-step'])
})

test('bounded derivations: character counts, full-width ranges, intervals, and languages', () => {
  const cases = [
    ['lead-with-answer', 'ja', '結論を先に、250字程度で。', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Answer first within 321 characters.', { max_chars: 321, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Brief, 123 words.', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Brief, within 123 words.', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'ja', '短く答えて。123字を使いました。', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Brief, 123 characters.', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'ja', '回答は123456字以内で。', { max_chars: 20000, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Replies within 123456 chars.', { max_chars: 20000, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Responses: 250 chars max.', { max_chars: 250, max_lines: 12 }],
    ['lead-with-answer', 'ja', '回答は250字以内で。', { max_chars: 250, max_lines: 12 }],
    // DESIGN §5.4a: a bound word within a dozen characters after the reply word derives.
    ['lead-with-answer', 'en', 'Keep answers within 250 chars.', { max_chars: 250, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Answer first, using 250 characters.', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'ja', '結論を先に。回答は12.5字以内で。', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'ja', '結論を先に。返答は１２．５字以内で。', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Be brief. Replies within 12.5 chars.', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Be brief. Responses: １２．５ chars max.', { max_chars: 0, max_lines: 12 }],
    ['lead-with-answer', 'en', 'Responses: ２５０ chars max.', { max_chars: 250, max_lines: 12 }],
    ['offer-options', 'ja', '３〜５案を比較してから選びたい。', { min: 3, max: 5 }],
    ['offer-options', 'en', 'Compare options: 8-9 alternatives.', { min: 4, max: 6 }],
    ['offer-options', 'ja', '９〜８案を比較してから。', { min: 2, max: 4 }],
    ['offer-options', 'en', 'Compare options: 5-3 choices.', { min: 2, max: 4 }],
    ['offer-options', 'en', 'Compare options for 3-5 hours.', { min: 2, max: 4 }],
    ['offer-options', 'en', 'Compare options: 3-5 choices.', { min: 3, max: 5 }],
    ['offer-options', 'en', 'Compare options: ３〜５ options.', { min: 3, max: 5 }],
    ['offer-options', 'en', 'Compare options: 1.3-5 choices.', { min: 2, max: 4 }],
    ['offer-options', 'ja', '比較してから。１．３〜５案。', { min: 2, max: 4 }],
    ['focus-timer', 'ja', '休憩タイマーを使って1分ごとに知らせて。', { interval_minutes: 5 }],
    ['focus-timer', 'en', 'Use a break reminder every 999 min.', { interval_minutes: 180 }],
    ['focus-timer', 'en', 'I hyperfocus for 25 min.', { interval_minutes: 50 }],
    ['focus-timer', 'ja', '時間を忘れて25分ほど経ちます。', { interval_minutes: 50 }],
    ['focus-timer', 'en', 'Remind me to break every 25 minutes.', { interval_minutes: 25 }],
    ['focus-timer', 'ja', '5分の休憩を1時間ごとに知らせて', { interval_minutes: 60 }],
    ['focus-timer', 'ja', '５分の休憩を１時間ごとに知らせて', { interval_minutes: 60 }],
    ['focus-timer', 'en', 'Use a break reminder every 2 hours.', { interval_minutes: 120 }],
    ['focus-timer', 'en', 'Use a break reminder every １ hour.', { interval_minutes: 60 }],
    ['focus-timer', 'en', 'Use pomodoro every ２５ min.', { interval_minutes: 25 }],
    ['focus-timer', 'ja', 'タイマーを25分で入れて', { interval_minutes: 25 }],
    ['focus-timer', 'ja', 'タイマーを２５分で入れて', { interval_minutes: 25 }],
    ['focus-timer', 'ja', 'ポモドーロで休憩を30分おきに知らせて', { interval_minutes: 30 }],
    ['focus-timer', 'ja', '5分の休憩を知らせて', { interval_minutes: 50 }],
    ['focus-timer', 'ja', 'タイマーを使って25分休みます', { interval_minutes: 50 }],
    ['focus-timer', 'en', 'Use pomodoro for 40 min.', { interval_minutes: 50 }],
    ['focus-timer', 'en', 'I hyperfocus for 2 hours.', { interval_minutes: 50 }],
    ['focus-timer', 'ja', '休憩を12.5分ごとに知らせて', { interval_minutes: 50 }],
    ['focus-timer', 'ja', '休憩を１．５時間ごとに知らせて', { interval_minutes: 50 }],
    ['focus-timer', 'en', 'Use a break reminder every 12.5 min.', { interval_minutes: 50 }],
    ['focus-timer', 'en', 'Use pomodoro for 1.5 hours.', { interval_minutes: 50 }],
    ['response-language', 'ja', 'コードのコメントは英語で、返答は日本語で', { language: 'ja' }],
    ['response-language', 'ja', 'コードのコメントは日本語で、返答は英語で', { language: 'en' }],
    ['response-language', 'en', 'I can read English, but reply in Japanese.', { language: 'ja' }],
    ['response-language', 'en', 'I can read Japanese, but respond in English.', { language: 'en' }],
    ['response-language', 'ja', '英語で返答してください。', { language: 'en' }],
    ['response-language', 'en', 'Always answer in Japanese.', { language: 'ja' }],
    ['response-language', 'ja', '私の言語で返答してください。', { language: 'ja' }],
    ...['ではなく', 'でなく', 'じゃなく'].map(negation => ['response-language', 'ja', `英語${negation}日本語で返答して。`, { language: 'ja' }]),
    ...['Not', 'Instead of', 'Rather than'].map(negation => ['response-language', 'en', `${negation} English, reply in Japanese.`, { language: 'ja' }]),
    ['response-language', 'en', 'Reply in Japanese, not English.', { language: 'ja' }],
    ['response-language', 'en', 'Reply in English rather than Japanese.', { language: 'en' }],
  ]
  for (const [id, language, text, expected] of cases) {
    const proposal = matchRecipes(profileFrom([{ text }], { language })).find(item => item.recipeId === id)
    assert.ok(proposal, text)
    assert.deepEqual(proposal.params, expected, text)
  }
  // A limit that names another object is no request for short answers (DESIGN §5.4a,
  // inspection H8): it neither triggers nor derives. Integrator's correction.
  for (const [language, text] of [['ja', 'コミットメッセージの件名は50字以内'], ['en', 'Keep commit subjects within 50 chars.']]) {
    assert.equal(matchRecipes(profileFrom([{ text }], { language })).find(item => item.recipeId === 'lead-with-answer'), undefined, text)
  }
  for (const suffix of ['以内', '程度', 'まで', 'くらい']) {
    const proposal = matchRecipes(profileFrom([{ text: `回答は２５０字${suffix}で。` }])).find(item => item.recipeId === 'lead-with-answer')
    assert.equal(proposal.params.max_chars, 250)
  }
  for (const prefix of ['Under', 'Within', 'Max', 'At most']) {
    const proposal = matchRecipes(profileFrom([{ text: `Replies: ${prefix} ２５０ chars.` }], { language: 'en' })).find(item => item.recipeId === 'lead-with-answer')
    assert.equal(proposal.params.max_chars, 250)
  }
  for (const cadence of ['ごと', 'おき', '毎', '間隔']) {
    const proposal = matchRecipes(profileFrom([{ text: `休憩を２５分${cadence}に知らせて。` }])).find(item => item.recipeId === 'focus-timer')
    assert.equal(proposal.params.interval_minutes, 25, cadence)
  }
  for (const separator of ['〜', '～', '~', '–', '-']) {
    const proposal = matchRecipes(profileFrom([{ text: `３${separator}５案を示してください。` }])).find(item => item.recipeId === 'offer-options')
    assert.deepEqual(proposal.params, { min: 3, max: 5 })
  }
})

test('later explicit derivations cannot replace earlier values, even beyond the evidence cap', () => {
  for (const [id, texts, params] of [
    ['offer-options', ['Compare options: 3-5 alternatives.', 'Compare options: 2-4 alternatives.'], { min: 3, max: 5 }],
    ['focus-timer', ['Use pomodoro every 40 min.', 'Use pomodoro every 60 min.'], { interval_minutes: 40 }],
    ['response-language', ['Reply in English.', 'Reply in Japanese.'], { language: 'en' }],
    ['lead-with-answer', ['Answer first.', 'Be brief.', 'Keep it short.', 'Keep replies concise within 200 chars.', 'Keep responses brief within 500 chars.'], { max_lines: 12, max_chars: 200 }],
  ]) {
    const proposal = matchRecipes(profileFrom(texts.map(text => ({ text })), { language: 'en' })).find(item => item.recipeId === id)
    assert.deepEqual(proposal.params, params)
    assert.ok(proposal.evidence.length <= 3)
    if (id === 'lead-with-answer') {
      assert.deepEqual(proposal.evidence.map(hit => hit.line), [1, 2, 4])
      assert.equal(proposal.evidence.at(-1).quote, texts[3])
    }
  }
})

test('matcher clamps numbers and rejects arbitrary strings, arrays, booleans, and extra keys', () => {
  const recipe = probeRecipe([{ lang: 'any', pattern: /needle/iu }], {
    params: {
      count: { type: 'number', default: 3, min: 2, max: 4 },
      language: { type: 'string', default: 'en', options: ['ja', 'en'] },
      phrases: { type: 'string', multiple: true, default: ['fixed'] },
      flag: { type: 'boolean', default: true },
    },
    deriveParams: () => ({ count: 999, language: 'PRIVATE TEXT', phrases: ['PRIVATE TEXT'], flag: false, extra: 'PRIVATE TEXT' }),
  })
  const profile = profileFrom([{ text: 'needle' }])
  assert.deepEqual(matchRecipes(profile, [recipe])[0].params, { count: 4, language: 'en', phrases: ['fixed'], flag: true })
  recipe.deriveParams = () => ({ count: -9, language: 'ja' })
  assert.deepEqual(matchRecipes(profile, [recipe])[0].params, { count: 2, language: 'ja', phrases: ['fixed'], flag: true })
  for (const [count, expected] of [[2.4, 2], [3.49, 3], [3.5, 4]]) {
    recipe.deriveParams = () => ({ count })
    assert.equal(matchRecipes(profile, [recipe])[0].params.count, expected)
  }
  for (const count of [NaN, Infinity, -Infinity, '4']) {
    recipe.deriveParams = () => ({ count })
    assert.equal(matchRecipes(profile, [recipe])[0].params.count, 3)
  }
})

test('inverted derived ranges are ignored before and after clamping', () => {
  const recipe = probeRecipe([{ lang: 'any', pattern: /needle/iu }], { params: getRecipe('offer-options').params })
  const profile = profileFrom([{ text: 'needle' }])
  for (const derived of [{ min: 5, max: 3 }, { min: 9, max: 8 }, { min: 3.9, max: 3.1 }]) {
    recipe.deriveParams = () => derived
    assert.deepEqual(matchRecipes(profile, [recipe])[0].params, { min: 2, max: 4 })
  }
  const options = getRecipe('offer-options')
  const invalid = profileFrom(['Compare options.', 'Offer alternatives.', 'Show options.', '9-8 options.'].map(text => ({ text })), { language: 'en' })
  const ignored = matchRecipes(invalid, [options])[0]
  assert.deepEqual(ignored.params, { min: 2, max: 4 })
  assert.deepEqual(ignored.evidence.map(hit => hit.line), [1, 2, 3])
  const valid = profileFrom([...invalid.lines, { text: '3-5 options.' }], { language: 'en' })
  const accepted = matchRecipes(valid, [options])[0]
  assert.deepEqual(accepted.params, { min: 3, max: 5 })
  assert.deepEqual(accepted.evidence.map(hit => hit.line), [1, 2, 5])
})

test('evidence retains every parameter source, including an explicit default value', () => {
  const recipe = probeRecipe([{ lang: 'any', pattern: /needle/iu }], {
    params: { count: { type: 'number', default: 3, min: 1, max: 10 }, language: { type: 'string', default: 'en', options: ['en', 'ja'] } },
    deriveParams(hits) {
      const values = {}
      for (const { text } of hits) {
        const count = /count=(\d+)/u.exec(text)
        const language = /language=(ja|en)/u.exec(text)
        if (count && !Object.hasOwn(values, 'count')) values.count = Number(count[1])
        if (language && !Object.hasOwn(values, 'language')) values.language = language[1]
      }
      return values
    },
  })
  const texts = ['needle', 'needle', 'needle', 'needle count=3', 'needle language=ja', 'needle count=8 language=en']
  const profile = profileFrom(texts.map(text => ({ text })))
  profile.lines.reverse()
  const proposal = matchRecipes(profile, [recipe])[0]
  assert.deepEqual(proposal.params, { count: 3, language: 'ja' })
  assert.deepEqual(proposal.evidence.map(hit => hit.line), [1, 4, 5])
  assert.deepEqual(proposal.evidence.map(hit => hit.quote), ['needle', 'needle count=3', 'needle language=ja'])
  const laterConfidence = profileFrom(texts.map((text, index) => ({ text, section: index === 5 ? 'style' : 'unknown' })))
  const located = matchRecipes(laterConfidence, [recipe])[0]
  assert.equal(located.confidence, 'high')
  assert.deepEqual(located.params, { count: 3, language: 'ja' })
  assert.deepEqual(located.evidence.map(hit => hit.line), [4, 5, 6])
  assert.deepEqual(located.evidence.map(hit => hit.quote), texts.slice(3))
})

test('phrases and command patterns stay at catalog defaults and are not shared mutable arrays', () => {
  for (const [id, text, key] of [
    ['receive-only-fragments', 'Just acknowledge short fragments including PRIVATE TEXT.', 'phrases'],
    ['respect-stop-signals', 'Stop for now means PRIVATE TEXT.', 'phrases'],
    ['publish-guard', 'Ask before you push; protect PRIVATE TEXT.', 'patterns'],
  ]) {
    const profile = profileFrom([{ text }], { language: 'en' })
    const proposal = matchRecipes(profile).find(item => item.recipeId === id)
    const defaults = getRecipe(id).params[key].default
    assert.deepEqual(proposal.params[key], defaults)
    proposal.params[key].push('CHANGED')
    assert.ok(!defaults.includes('CHANGED'))
    assert.deepEqual(matchRecipes(profile).find(item => item.recipeId === id).params[key], defaults)
  }
})

test('buildBundle preserves proposals and identity, computes notMatched, and sorts copied files', () => {
  const profile = profileFrom([{ text: 'Answer first.' }], { language: 'en', frontmatter: { version: '0.2' } })
  const proposals = matchRecipes(profile)
  const files = ['plugin/hooks/register.ts', 'PROPOSALS.json', 'PROPOSALS.md']
  const options = { file: '/private/manual.md', sha256: 'a'.repeat(64), pluginName: 'kokoro-mods-example', files }
  const bundle = buildBundle(profile, proposals, options)
  assert.deepEqual(bundle.tool, { name: TOOL_NAME, version: TOOL_VERSION })
  assert.deepEqual(bundle.profile, { file: 'manual.md', format: 'kokoro', language: 'en', version: '0.2', sha256: 'a'.repeat(64) })
  assert.equal(bundle.pluginName, options.pluginName)
  assert.equal(bundle.proposals, proposals)
  assert.deepEqual(bundle.notMatched, RECIPE_IDS.filter(id => !proposals.some(proposal => proposal.recipeId === id)).sort())
  assert.deepEqual(bundle.files, [...files].sort())
  assert.deepEqual(files, ['plugin/hooks/register.ts', 'PROPOSALS.json', 'PROPOSALS.md'])
  assert.deepEqual(buildBundle(profile, proposals, options), bundle)
  const empty = buildBundle(profileFrom([]), [], { file: 'C:\\private\\manual.md', sha256: '', pluginName: 'kokoro-mods-profile' })
  assert.equal(empty.profile.file, 'manual.md')
  assert.equal(empty.profile.version, null)
  assert.deepEqual(empty.files, [])
  assert.deepEqual(empty.notMatched, [...RECIPE_IDS].sort())
})

test('buildBundle uses the supplied catalog and rejects unknown proposal ids', () => {
  const profile = profileFrom([{ text: 'Answer first.' }], { language: 'en' })
  const recipes = [getRecipe('lead-with-answer'), probeRecipe([], { id: 'z-unused' }), probeRecipe([], { id: 'a-unused' })]
  const proposals = matchRecipes(profile, recipes)
  const options = { file: 'manual.md', sha256: '', pluginName: 'kokoro-mods-profile', recipes }
  assert.deepEqual(buildBundle(profile, proposals, options).notMatched, ['a-unused', 'z-unused'])
  assert.deepEqual(buildBundle(profile, [], { ...options, recipes: [] }).notMatched, [])
  // The message names the position, never the value (re-inspection, chunk D, L-3).
  assert.throws(() => buildBundle(profile, proposals, { ...options, recipes: [] }), { message: 'proposals[0].recipeId: unknown recipe id' })
  assert.throws(() => buildBundle(profile, [{ ...proposals[0], recipeId: 'PRIVATE-unknown' }], options), error => error.message === 'proposals[0].recipeId: unknown recipe id' && !error.message.includes('PRIVATE'))
  assert.throws(() => buildBundle(profile, [{ ...proposals[0], recipeId: 'unknown' }], { ...options, recipes: RECIPES }), { message: 'proposals[0].recipeId: unknown recipe id' })
  // Only a version-shaped frontmatter version is copied (re-inspection, chunk D, M-4).
  for (const [version, expected] of [['0.4.0', '0.4.0'], ['1.2.3-rc.1', '1.2.3-rc.1'], ['1.0.0-beta2', '1.0.0-beta2'], ['2026.10', '2026.10'], ['v1', null], ['PRIVATE text', null], ['1.0.0-adhd', null], ['1.0.0-alice', null], ['1.0.0+x', null], ['', null]]) {
    const versioned = profileFrom([{ text: 'Answer first.' }], { language: 'en', frontmatter: { version } })
    assert.equal(buildBundle(versioned, [], { file: 'm.md', sha256: '', pluginName: 'kokoro-mods-profile' }).profile.version, expected, version)
  }
})

test('principle-1-profile-driven: every proposal quotes a verbatim line', () => {
  for (const language of ['ja', 'en']) {
    const profile = profileFrom(CASES.map(([, section, ja, , en]) => ({ section, kind: 'bullet', text: language === 'ja' ? ja : en })), { language })
    for (const line of profile.lines) line.quote = line.raw = `- ${line.text}`
    const proposals = matchRecipes(profile, RECIPES, { maxEnabled: Infinity })
    assert.equal(proposals.length, 17)
    for (const proposal of proposals) {
      assert.ok(proposal.evidence.length >= 1 && proposal.evidence.length <= 3)
      for (const hit of proposal.evidence) {
        assert.equal(hit.quote, profile.lines[hit.line - 1].raw)
        assert.ok(hit.quote.length > 0 && hit.matched.length > 0)
        assert.ok(hit.quote.includes(hit.matched))
      }
    }
  }
})

test('publishing requests and negated waivers keep the guard', () => {
  const recipe = getRecipe('publish-guard')
  const positives = [
    ['ja', '確認せずにpushしないで'],
    ['ja', '確認せずにpushしないでください'],
    ['ja', '許可なしにpushしないこと'],
    ['ja', '許可なしでpushしないで'],
    ['ja', 'pushは許可なしにしない'],
    ['ja', 'pushは確認しないとダメ'],
    ['ja', 'pushは承認を得てから'],
    ['ja', 'プッシュする前に確認して'],
    ['ja', '公開する前に聞いて'],
    ['ja', 'PRを出す前に相談して'],
    ['ja', '確認してからプルリクを出して'],
    ['ja', '承認を得てからIssueを出して'],
    ['ja', 'リリースの前に同意を得て'],
    ['ja', '外部公開する前にOKをもらって'],
    ['ja', '公開の前に尋ねて'],
    ['ja', '公開する前に聞くこと'],
    ['ja', '非公開リポジトリでもpushの前に確認して'],
    ['ja', '非公開のリポジトリへpushする前に確認'],
    ['ja', '公開鍵をpushする前に確認'],
    ['en', 'Ask me before pushing.'],
    ['en', 'Check with me before publishing.'],
    ['en', 'Confirm with me before you open a PR.'],
    ['en', 'Get my approval first before opening an issue.'],
    ['en', 'Get ok before publishing.'],
    ['en', "Don't push without asking."],
    ['en', 'Never publish with no confirmation.'],
    ['en', 'Do not publish without asking.'],
    ['en', 'Do not ever push without asking.'],
    ['en', "Please don't publish without asking."],
    ['en', 'Publish without confirmation, but not before asking me.'],
    ['en', 'Ask before pushing — never ever push without asking.'],
    ['en', 'No confirmation needed before pushing; ask before pushing.'],
    ['en', 'No confirmation needed for pushing; ask before pushing.'],
    ['ja', 'pushは確認しなくていい。ただしpushする前に聞いて'],
  ]
  const conflicts = new Set([
    'Publish without confirmation, but not before asking me.',
    'No confirmation needed before pushing; ask before pushing.',
    'No confirmation needed for pushing; ask before pushing.',
    'pushは確認しなくていい。ただしpushする前に聞いて',
  ])
  for (const [language, text] of positives) {
    const profile = profileFrom([{ section: 'boundaries', text }], { language })
    const proposals = matchRecipes(profile, [recipe])
    assert.equal(proposals.length, 1, text)
    assert.equal(proposals[0].confidence, conflicts.has(text) ? 'medium' : 'high', text)
  }
  for (const ending of ['しないで', 'しないでください', 'しないこと', 'は禁止', 'はダメ', 'はだめ', 'するな']) {
    const text = `確認せずにpush${ending}`
    const proposals = matchRecipes(profileFrom([{ section: 'boundaries', text }]), [recipe])
    assert.equal(proposals.length, 1, text)
    assert.equal(proposals[0].confidence, 'high', text)
  }
})

test('publishing waivers and requests are judged per trigger cell, by the matcher (chunk D, H1)', () => {
  const recipe = getRecipe('publish-guard')
  for (const [language, text, confidence] of [
    ['en', "Don't push without asking.", 'high'],
    ['en', 'Ask before you push; push without asking.', 'medium'],
    ['en', 'Publish without confirmation, but not before asking me.', 'medium'],
    ['ja', '確認せずにpushしないで', 'high'],
    ['ja', 'pushは確認しなくていい。ただしpushする前に聞いて', 'medium'],
    ['ja', '確認なしのpushは厳禁', 'high'],
    ['en', 'Pushing without asking is forbidden', 'high'],
    ['en', 'Without asking, never push', 'high'],
  ]) {
    const profile = profileFrom([{ section: 'boundaries', text }], { language })
    const proposal = matchRecipes(profile, [recipe])[0]
    assert.ok(proposal, text)
    assert.equal(proposal.confidence, confidence, text)
    const unknown = profileFrom([{ section: 'unknown', text }], { language })
    assert.equal(matchRecipes(unknown, [recipe])[0].confidence, 'low', text)
  }
  for (const [language, text] of [
    ['en', 'Before you push, push without asking.'],
    ['ja', '確認せずにpushして'],
    ['ja', 'push は確認しなくていい'],
    ['en', 'No confirmation needed for pushing'],
    ['en', 'Feel free to push without asking'],
    ['en', 'Do not ask before you push.'],
  ]) assertSuppressed(recipe, profileFrom([{ section: 'boundaries', text }], { language }))
  // A waiver in the avoid cell never cancels a request in the DO cell (the triggers read
  // the DO cell; a request written in the avoid cell alone is not read).
  for (const [left, right, expected] of [
    ['Publish without confirmation.', "Don't push without asking.", 'high'],
    ["Don't push without asking.", 'Ask before you push.', 'high'],
    // The mirror: a waiver in the DO cell is a waiver, whatever the avoid cell says
    // (proved through the suppression preconditions), and a request that stands only in
    // the avoid cell is not read (re-inspection, chunk B/D tests, M-2).
    ["Don't push without asking.", 'Publish without confirmation.', 'suppressed'],
    ['Ask before you push.', 'other', null],
  ]) {
    const profile = profileFrom([{ section: 'boundaries', kind: 'row', text: `${left} | ${right}`, left, right }], { language: 'en' })
    if (expected === 'suppressed') assertSuppressed(recipe, profile)
    else if (expected === null) assert.deepEqual(matchRecipes(profile, [recipe]), [], `${left} | ${right}`)
    else assert.equal(matchRecipes(profile, [recipe])[0].confidence, expected, right)
  }
  // "or push without asking" is neither an imperative nor an explicit permission, so the
  // sentence is read as a request (the uncertain side falls towards the gate).
  const mention = profileFrom([{ section: 'boundaries', text: 'I receive push notifications; ask before pushing, or push without asking.' }], { language: 'en' })
  assert.equal(matchRecipes(mention, [recipe])[0].confidence, 'high')
})
test('correction and interruption requests respect polarity', () => {
  const typos = getRecipe('accept-typos-as-intent')
  for (const action of ['point out', 'flag', 'tell me about', 'catch']) {
    assertSuppressed(typos, profileFrom([{ text: `Please ${action} my typos.` }], { language: 'en' }))
    const profile = profileFrom([{ text: `Please don't ${action} my typos.` }], { language: 'en' })
    assert.equal(matchRecipes(profile, [typos]).length, 1, action)
  }
  assertSuppressed(typos, profileFrom([{ text: 'Correct me when I misspell.' }], { language: 'en' }))
  assert.equal(matchRecipes(profileFrom([{ text: "Don't correct me when I misspell." }], { language: 'en' }), [typos]).length, 1)
  for (const subject of ['誤字', '表記揺れ']) {
    assertSuppressed(typos, profileFrom([{ text: `${subject}は指摘して` }]))
    assert.equal(matchRecipes(profileFrom([{ text: `${subject}は指摘してほしくない` }]), [typos]).length, 1, subject)
  }
  const timer = getRecipe('focus-timer')
  for (const action of ['interrupt', 'disturb']) {
    for (const negation of ["Don't", 'Do not', 'Never']) {
      assertSuppressed(timer, profileFrom([{ text: `${negation} ${action} me when I hyperfocus.` }], { language: 'en' }))
    }
    assert.equal(matchRecipes(profileFrom([{ text: `Please ${action} me with a break reminder.` }], { language: 'en' }), [timer]).length, 1, action)
  }
  for (const [negative, positive] of [['話しかけないで', '話しかけて'], ['割り込まないで', '割り込んで'], ['邪魔しない', '邪魔してもよい']]) {
    assertSuppressed(timer, profileFrom([{ text: `過集中しても${negative}` }]))
    assert.equal(matchRecipes(profileFrom([{ text: `過集中したら${positive}` }]), [timer]).length, 1, positive)
  }
  assertSuppressed('receive-only-fragments', profileFrom([{ text: 'Do not just receive it without advice.' }], { language: 'en' }))
  // A single-option request in a bullet never triggers (the avoid wording reads table rows
  // only); the unless covers a line where a trigger fires beside it.
  assert.deepEqual(matchRecipes(profileFrom([{ text: 'Give me a single option.' }], { language: 'en' }), [getRecipe('offer-options')]), [])
  assertSuppressed('offer-options', profileFrom([{ text: 'Show me options? No, give me a single option.' }], { language: 'en' }))
  assertSuppressed('offer-options', profileFrom([{ text: "Don't offer more than one option." }], { language: 'en' }))
  assert.deepEqual(matchRecipes(profileFrom([{ text: '一案だけにして' }]), [getRecipe('offer-options')]), [])
  assertSuppressed('offer-options', profileFrom([{ text: '複数案は不要、一案だけにして' }]))
})

test('slugFor uses only an explicit name and never the manual (final inspection, chunks C and E)', () => {
  const profile = profileFrom([], { frontmatter: { name: 'Front Matter', user_alias: 'alias' }, title: 'Title Name' })
  assert.equal(slugFor(profile), 'profile')
  assert.equal(slugSource(profile), 'fallback')
  assert.equal(slugFor(profile, { name: '  Override__Name / 42! ' }), 'override-name-42')
  assert.equal(slugSource(profile, { name: 'ＡＬＩＣＥ　１２' }), 'option')
  assert.equal(slugFor(profile, { name: 'ＡＬＩＣＥ　１２' }), 'alice-12')
  assert.equal(slugFor(profile, { name: 'A'.repeat(80) }), 'a'.repeat(40))
  assert.equal(slugFor(profile, { name: `${'a'.repeat(39)} b` }), 'a'.repeat(39))
  // An empty or unusable name was given, so it is rejected rather than silently replaced
  // (re-inspection, chunk D, L-2).
  for (const name of ['---', '日本語', '', '   ']) {
    assert.equal(slugFor(profile, { name }), 'profile', name)
    assert.equal(slugSource(profile, { name }), 'rejected', name)
  }
  assert.equal(slugSource(profile, { name: undefined }), 'fallback')
  assert.equal(slugSource(profile, { name: null }), 'fallback')
})

test('an explicit name carrying an Appendix A term is rejected, not replaced by a manual-derived name', () => {
  const terms = [
    'ASD', 'HSP', 'IQ', 'ADHD', 'FSIQ', 'DSM', 'PTSD', 'ICD-10', 'ICD11', 'F32.1', 'F43.10', 'F32.A',
    'autism', 'autistic', 'dyslexia', 'dyslexic', 'bipolar', 'schizophrenia', 'schizophrenic', 'OCD',
    'personality disorder', 'depressive disorder', 'major depression', 'anxiety disorder', 'panic disorder', 'eating disorder', 'asperger',
  ]
  const profile = profileFrom([], { frontmatter: { name: 'Front Matter' }, title: 'Title Name' })
  for (const term of terms) {
    for (const name of [term.toUpperCase(), term.toLowerCase(), term.replaceAll(' ', '_'), `${'safe-'.repeat(10)}${term}`]) {
      assert.equal(slugFor(profile, { name }), 'profile', name)
      assert.equal(slugSource(profile, { name }), 'rejected', name)
    }
  }
  // The longer terms are refused inside a word as well (re-inspection, chunk D, L-1);
  // truncation therefore cannot expose one either.
  for (const name of ['adhdtools', 'myadhd', 'autismhelper', 'F84.0', 'f84-0', `${'a'.repeat(31)}-autisticx`, 'ptsdnotes']) {
    assert.equal(slugFor(profile, { name }), 'profile', name)
    assert.equal(slugSource(profile, { name }), 'rejected', name)
  }
  // ADD, OD and DAN are ordinary words or names in a lower-case slug and are allowed, and
  // the three-letter terms are not sought inside words.
  for (const name of ['address', 'DANger', 'xADD2', 'F12', 'addison', 'dan', 'add', 'od', 'scripts-demo', 'tasks-done', 'bishop']) {
    assert.equal(slugFor(profile, { name }), name.toLowerCase(), name)
    assert.equal(slugSource(profile, { name }), 'option', name)
  }
})

test('publish-guard polarity: a bare 確認なし/せず is not permission, a negated permission is a prohibition, and prohibitions reach across commas (re-inspection, chunk D, H-1 to H-4, M-1)', () => {
  const recipe = getRecipe('publish-guard')
  for (const [language, text] of [
    ['ja', '確認なしのpushが心配'],
    ['ja', '確認せずにpushしてしまう癖がある'],
    ['ja', '確認なしでpushしても大丈夫じゃない'],
    ['ja', '確認なしで公開されるのがいいとは思わない'],
    ['ja', '確認せずにpushするのは、絶対にやめて'],
    ['ja', '確認なしのpushは不要'],
    ['ja', 'テストは確認なしで回してOK、pushは慎重に'],
    ['en', "Pushing without asking isn't ok"],
    ['en', 'Publishing without confirmation — not allowed'],
    ['en', 'Pushing without asking has burned me before'],
    ['en', 'Publishing without confirmation worries me'],
    ['en', 'Avoid pushing without confirmation'],
    ['en', 'Push without asking if the token is set'],
    ['en', 'Push notifications are fine, but ask me before you push'],
    ['ja', 'push通知の実装はOK。pushの前には必ず確認して'],
    // Second re-inspection of the matcher: incomplete English predicates (F1), negated
    // permissions (F2), Japanese predicates that do not end their clause (F3), the plain
    // form and 勝手に (F4).
    ['en', 'Pushing with no confirmation broke prod'],
    ['en', "I don't want you to push without asking"],
    ['en', "You can't push without asking."],
    ['en', 'You may not push without asking.'],
    ['en', "I don't think it's ok to push without asking."],
    ['en', 'Pushing without asking is not ok'],
    ['en', 'Pushing without asking is not fine'],
    ['ja', '確認なしでpushしていいなんて言ってない'],
    ['ja', '確認なしでpushしていいわけがない'],
    ['ja', '確認なしでpushしてもOKではない'],
    ['ja', '確認不要のpushが怖い'],
    ['ja', '確認せず pushしてしまう'],
    ['ja', '確認なし pushで事故った'],
    ['ja', 'いつも確認せずにpushする。'],
    ['ja', '確認せずにpushする'],
    ['ja', '確認なしで勝手にpushされるのがつらい'],
    // Third re-inspection of the matcher: polite negations (H1), adverbs (H2), the
    // imperative anchored to the clause end (H3), questions (M1), a bare "don't" (M2),
    // だと (M3), first-person habits (M4), かわいい/つよい (L2).
    ['ja', '確認せずにpushしていいとは思いません。'],
    ['ja', '確認なしでpushしても大丈夫ではありません。'],
    ['ja', '確認せずにpushしていいわけではありません。'],
    ['ja', '確認なしのpushは良くありません。'],
    ['en', "Pushing without asking isn't really OK."],
    ['en', "I'm not exactly okay with pushing without asking"],
    ['en', 'Pushing without asking is hardly ok'],
    ['ja', '確認せずにpushしてよく事故る。'],
    ['ja', '確認せずにpushしてくださいと言われても困ります'],
    ['ja', '確認せずにpushしてね、という人がいる'],
    ['ja', 'pushは確認不要ですか？'],
    ['ja', '確認せずにpushしていい？ダメ。'],
    ['en', 'You can push without asking? No.'],
    ['en', "Please don't, even if it seems fine, push without asking."],
    ['en', "Don't — I repeat — push without asking"],
    ['ja', 'pushは確認不要だと思われがち'],
    ['ja', '私はpushの前に確認しない。'],
    ['en', 'I never ask before pushing, and it bit me'],
    ['ja', '確認なしのpushはかわいい猫でも許さない'],
    // Fourth re-inspection of the matcher: advice (High-1), open adverbs and "no longer"
    // (High-2), reported speech inside the clause (Medium-1), outer negations
    // (Medium-2), tag questions (Medium-3), issues (Low-1), adjective stems (L2).
    ['ja', '確認せずにpushしない方がいい'],
    ['ja', '確認なしのpushは避けたほうがいい'],
    ['ja', '確認なしのpushは控えたほうがいい'],
    ['en', "Pushing without asking isn't actually OK."],
    ['en', 'Pushing without asking is no longer OK.'],
    ['en', 'You can no longer push without asking.'],
    ['ja', '確認せずにpushしていい、という人がいる'],
    ['ja', '確認なしでpushしてOKって言う人がいる'],
    ['en', 'Some people say you can push without asking.'],
    ['en', 'Nobody said you can push without asking.'],
    ['en', 'It is not true that you can push without asking.'],
    ['ja', '確認なしでpushしていい、なんてことはない'],
    ['en', 'You can push without asking, right?'],
    ['ja', '確認なしのpushはかわいい。'],
    ['ja', '確認なしのpushはかっこいい'],
    ['ja', 'ちょっと言いにくいけど、確認なしのpushは困ります'],
    // Sixth re-inspection of the matcher: "…, right?" is a question (M-1), でしょうか/かな
    // without a mark (M-2), noun-phrase "open issues" (L-1).
    ['en', 'Push without asking, right?'],
    ['ja', '確認なしでpushしていいでしょうか'],
    ['ja', '確認なしでpushしてもいいかな'],
    // Seventh re-inspection of the matcher: "isn't something I'm OK with" (H-B), ですかね (M-A).
    ['en', "Pushing without asking isn't something I'm OK with."],
    ['en', 'Pushing without asking is not something I am fine with'],
    ['ja', '確認なしでpushしても大丈夫ですかね'],
    // Eighth re-inspection of the matcher: person nouns as speakers (Medium-1), だろうか, a
    // bare か and かどうか/whether (Medium-2), reported forms that stay reported (Low-3).
    ['ja', '確認なしでpushしてOKって言う同僚もいる'],
    ['ja', '確認なしでpushしていいという上司がいる'],
    ['ja', '確認なしでpushしてOKという声がある'],
    ['ja', '確認なしでpushしていいという方が多い'],
    ['ja', '確認なしでpushしてOKという噂がある'],
    ['ja', '確認なしでpushしても大丈夫だろうか。'],
    ['ja', '確認なしでpushしても大丈夫か。'],
    ['ja', '確認なしでpushしても大丈夫かね'],
    ['ja', '確認なしでpushしても大丈夫かどうか迷っている'],
    ['en', 'I wonder whether pushing without asking is fine'],
    // Fifteenth re-inspection of the matcher: 後でいい about a review, then the person's check
    // before publishing, with and without a 、 after けど (High-1).
    ['ja', 'レビューは後でいいけど公開は私がチェックしてから'],
    ['ja', 'レビューは後でいいけど、公開は私がチェックしてから'],
    // Sixteenth re-inspection of the matcher: けれど・ですが・だが as clause ends (low-3).
    ['ja', '確認は後でいいけれど公開は私がチェックしてから'],
    ['ja', '確認は後でいいですが公開は私がチェックしてから'],
    ['ja', '確認は後でいいのだが公開は私がチェックしてから'],
    // 「後回しにしないで」 asks to keep confirming (seventeenth re-inspection of the catalog, M-1).
    ['ja', 'pushの確認は後回しにしないで'],
    // A verb between the particle and 後 asks first (eighteenth re-inspection of the matcher, H-1).
    ['ja', 'pushはテストも確認も終わった後にして'],
    // The topic's は does not put the confirmation off (eighteenth re-inspection of the catalog, F-1).
    ['ja', '公開はOKが出た後にして'],
    ['ja', 'リリースは承認を得た後にして'],
    ['ja', 'pushは確認が済んだ後で'],
    // The topic's は before 確認 is not the put-off particle (nineteenth re-inspection, Low-3).
    ['ja', 'pushは確認後でいい'],
    // A particle-less 後でいい without 先に/まず is "once confirmed, no hurry" (twentieth re-inspection, H-1).
    ['ja', 'pushは確認後でいいので、急がなくて大丈夫'],
    ['ja', '私の確認後でいいのでpushして'],
    // The order after ので is not the publishing (twentieth re-inspection of the catalog, H-a).
    ['ja', 'pushは確認後でいいので、先にテストを書いて'],
    ['ja', 'pushは確認後でいいので先にPRを作って'],
    // A word between the topic and the ask word, or a compound after 先に (confirmation round, 高1).
    ['ja', 'リリースは私の確認後でいいので、先にリリースノートを書いて'],
    ['ja', 'pushは私の確認後でいいので、先にPRを作って'],
    ['ja', 'pushは、確認後でいいので先にPRを作って'],
    // A negated put-off keeps the confirmation (twenty-first re-inspection of the matcher, Medium-1); the
    // publishing after the thing put off is a gate (Medium-2); 「確認後にして」 asks first (Low-3).
    ['ja', 'pushの確認は後回しにしなくていい'],
    ['ja', 'pushの確認は後に回さなくていい'],
    ['ja', 'pushの確認は後回ししなくていい'],
    ['ja', 'pushの確認は後回しにはしなくていい'],
    ['ja', 'pushの確認はあと回しにしなくていい'],
    ['ja', '確認はレビューのあとに回さなくていい、pushは私が見てから'],
    ['ja', 'pushの確認は後回しにできないので私が見るまで待ってもらっていい'],
    // 「その後でいい」 accepts the order; a 、 ends the permission window; OK as a topic's ask word
    // (final confirmation of the catalog, 高-A, 中-B, 低-E).
    ['ja', 'pushはその後で、私がOKを出したら'],
    ['ja', 'pushはOKの後でいいので先にPRを作って'],
    ['ja', 'push確認後でいいので先にPRを作って'],
    ['ja', '確認後でいいので先にPRの説明を書いて'],
    ['ja', '確認後にしてpushして'],
    // Several things before 後 (nineteenth re-inspection of the catalog, H-1).
    ['ja', 'pushは確認とテストとlintが全部終わった後にして'],
  ]) {
    const profile = profileFrom([{ section: 'boundaries', text }], { language })
    const proposals = matchRecipes(profile, [recipe])
    assert.equal(proposals.length, 1, text)
    assert.equal(proposals[0].confidence, 'high', text)
    const ruling = publishPolarity(text)
    assert.ok(!(ruling.waiver && !ruling.asking), `${text}: ${JSON.stringify(ruling)}`)
  }
  for (const [language, text] of [
    ['ja', '確認なしでpushしてOK'],
    ['ja', '確認なしでpushして構わない'],
    ['ja', '確認せずにpushして'],
    ['ja', 'pushの確認は不要'],
    ['ja', 'pushの確認は不要です'],
    ['ja', 'pushは確認しない'],
    ['ja', 'pushの許可なし'],
    ['en', 'Push without asking.'],
    ['en', 'Push it without asking, please.'],
    ['en', 'Feel free to push without asking'],
    ['en', 'No confirmation needed for pushing'],
    ['en', "I don't want confirmation before pushes"],
    ['en', 'Do not ask before you push.'],
    ['en', 'Before you push, push without asking.'],
    ['en', "Don't ask, just push without confirmation."],
    ['ja', '確認なしでpushして構いません'],
    ['ja', 'pushは確認不要だよ'],
    ['ja', '確認なしでpushしていいです'],
    ['en', "I'm fine with you pushing without asking"],
    ['ja', '確認なしでpushしていいと思う'],
    // Fifth re-inspection of the matcher: a policy statement (High-1), "no longer" on the
    // confirmation side (Medium-1), an order with an OK tag (Medium-2), でしょう/けど (Medium-3).
    ['ja', 'pushは確認なしでいいという方針にします。'],
    ['ja', '確認なしでpushしていい、という方針です。'],
    ['ja', '確認せずにpushして、と頼みます'],
    ['ja', '確認なしでpushしていいと言う方針です'],
    ['ja', 'pushは確認なしでOK、という方向でお願いします'],
    ['ja', 'pushは確認なしでいい、という方式にします'],
    ['ja', '確認せずにpushして、OK？'],
    ['en', 'Pushing no longer needs my OK, go ahead and push without asking.'],
    ['en', 'Just push without asking, OK?'],
    ['ja', 'pushは確認なしでいいでしょう'],
    ['ja', 'pushは確認なしでいいけど、テストは回して'],
    // A bare か as a question ending does not touch these (ninth re-inspection, L-2).
    ['ja', '確認なしでpushしていいよ'],
    ['ja', '確認なしでpushしてOKだよね'],
    // The ask words added to the catalog are waiver words too (tenth re-inspection, F-5).
    ['ja', 'pushする前の了承は不要です'],
    // 「確認は後でいい」 waives the gate (fourteenth re-inspection of the catalog, H-A).
    ['ja', '確認は後でいいので先にpushして'],
    ['ja', 'pushの確認はあとでかまわない'],
    // 「後にして」「後でもいい」「後回し」 put the confirmation off (sixteenth re-inspection, High-1).
    ['ja', '確認は後にしてpushして'],
    ['ja', '確認は後でもいいので先にpushして'],
    ['ja', 'pushの確認は後回しで'],
    // A waiver before 、 and a statement after it (seventeenth re-inspection, LOW-1).
    ['ja', 'pushは確認不要で、mainだけは私が見る'],
    // An unrelated に回さない beside a waiver is not a prohibition (confirmation round, L-1).
    ['ja', 'テストはCIに回さなくていい、pushは確認なしでいい'],
    ['ja', 'バグは後回しせず、pushは確認なしでいい'],
    // A publishing object in an earlier clause is not the topic (final confirmation, 中-C).
    ['ja', 'PRを作ったら、確認後でいいので先にpushして'],
    // An adverb between は and 後 (seventeenth re-inspection of the catalog, H-2).
    ['ja', '確認は一旦後にしてpushして'],
    ['ja', '確認はとりあえず後にしてpushして'],
    // もう・また, を, and no particle before 後でいい (nineteenth re-inspection of the catalog, M-2).
    ['ja', '確認はもう後でいいので先にpushして'],
    ['ja', '確認はまた後でいいのでpushして'],
    ['ja', '確認を後にしてpushして'],
    ['ja', '確認後でいいので先にpushして'],
    ['ja', '確認後でいいので、先にpushして'],
    ['ja', '確認は後に回せばいいので先にpushして'],
    // A permission before "and" still governs the waiver after it (thirteenth re-inspection, H-a).
    ['en', 'You can push and open PRs without asking.'],
    ['en', 'Feel free to push and open PRs without asking.'],
    // An order ends at "and" even when another clause follows (fourteenth re-inspection, High-1).
    ['en', "Just push without asking and I'll check it afterwards."],
    ['en', "Push without asking and I'll review later."],
    // けど without a 、 ends the clause too (fifteenth re-inspection, High-1).
    ['ja', 'pushは確認なしでいいけどテストは回して'],
  ]) {
    // Same section as the positives, so a difference in the ruling, not in the section,
    // decides (second re-inspection of the tests, M-A).
    assertSuppressed(recipe, profileFrom([{ section: 'boundaries', text }], { language }))
    const ruling = publishPolarity(text)
    assert.ok(ruling.waiver && !ruling.asking, `${text}: ${JSON.stringify(ruling)}`)
  }
  // Filing an issue is a publishing object; fixing or closing issues is not (fourth and
  // sixth re-inspections, Low-1, L-1).
  assert.ok(publishPolarity('Feel free to file issues without asking.').waiver)
  assert.ok(publishPolarity('Feel free to open a new issue without asking.').waiver)
  assert.ok(publishPolarity('You can open new issues without asking').waiver)
  assert.ok(publishPolarity('イシューは確認なしで立てていい').waiver)
  // The topic form needs a filing verb in a conjugated form (eighth re-inspection, Low-1).
  assert.ok(publishPolarity('イシューは確認なしで作成していい').waiver)
  assert.ok(!publishPolarity('イシューは確認なしで作業していい').waiver)
  // A prohibition without an asking word in another sentence of the cell is not a request
  // for the gate: the guard asks before publishing, it is not a ban on a branch (eighth
  // re-inspection, Medium-3; §5.4a).
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'boundaries', text: 'mainへpushしないで。イシューは確認なしで立てていい。' }]), [recipe]), [])
  // A request for the gate in one sentence and a waiver for another object in the next keep
  // the gate: the asking sentence is found with the recipe's own triggers (ninth
  // re-inspection of the matcher, H-1).
  // The third column says whether the asking vocabulary alone (no triggers) already keeps
  // the gate, so the rows marked false are the ones that prove the trigger path (tenth
  // re-inspection of the matcher, L-A); the clause forms are M-A.
  for (const [language, text, byVocabulary] of [
    ['en', 'Never push unless confirmed. Feel free to file issues without asking.', true],
    ['en', "Don't push until you hear from me. You can open new issues without asking.", false],
    ['ja', 'pushは私のOKが出てから。イシューは確認なしで立てていい。', true],
    ['en', 'Wait for my go-ahead before pushing, but you can open new issues without asking.', false],
    ['en', "Wait until I'm happy with it before pushing, filing issues is fine without asking", false],
    ['ja', 'pushは私がいいと言ってから、イシューは確認なしで立てていい', false],
    // A topic split off by 、 and a person named without the vocabulary (eleventh re-inspection, 1, 2).
    ['ja', 'pushは、私がいいと言ってから、イシューは確認なしで立てていい', false],
    ['en', 'Wait until the team lead says so before pushing, but feel free to open new issues without asking.', false],
    ['ja', 'pushはレビューが通ってから、イシューは確認なしで立てていい', false],
    // A review put off and the publishing after it: a conflict (twenty-first re-inspection, Medium-2).
    ['ja', 'レビューはPRを作った後にして、pushはその後で', false],
    ['ja', 'レビューはPRを作った後にして、pushはその後でいい', false],
    // Two orders joined by "and" (twelfth re-inspection of the matcher, H-1).
    ['en', 'Wait for my go-ahead before pushing and feel free to open new issues without asking.', false],
    // 査読 moved out of the asking words with レビュー; the trigger carries it (thirteenth, M-a).
    ['ja', '公開前に査読を通して。イシューは確認なしで立てていい。', false],
  ]) {
    const proposals = matchRecipes(profileFrom([{ section: 'boundaries', text }], { language }), [recipe])
    assert.equal(proposals.length, 1, text)
    assert.equal(proposals[0].confidence, 'medium', text)
    assert.equal(publishPolarity(text).asking, byVocabulary, text)
    const ruling = publishPolarity(text, recipe.triggers.filter(trigger => trigger.lang === 'any' || trigger.lang === language))
    assert.ok(ruling.waiver && ruling.asking, `${text}: ${JSON.stringify(ruling)}`)
  }
  // A clause that is more than a bare time clause and names nobody still does not cancel a
  // waiver when no trigger matches it (eleventh re-inspection, 4).
  for (const [language, text] of [['en', 'Push without asking; I\'ll review the PR later.'], ['en', 'Before you push, push without asking.'], ['ja', 'pushする前に、確認せずにpushして'],
    // A review the person will do later, and a CI condition before the waiver, are not requests
    // for the gate (twelfth re-inspection, M-1, L-1).
    ['ja', '確認せずにpushして。PRのレビューは後で私がする。'], ['ja', 'CIが通ってから、pushは確認なしでしていい']]) {
    assertSuppressed(recipe, profileFrom([{ section: 'boundaries', text }], { language }))
    const ruling = publishPolarity(text, recipe.triggers.filter(trigger => trigger.lang === 'any' || trigger.lang === language))
    assert.ok(ruling.waiver && !ruling.asking, `${text}: ${JSON.stringify(ruling)}`)
  }
  // "whether" counts only before the waiver; 「イシューを切る」 files an issue (ninth, M-1, L-1).
  assert.ok(publishPolarity("Feel free to push without asking whether I've reviewed it.").waiver)
  assert.ok(publishPolarity('イシューは確認なしで切っていい').waiver)
  assert.ok(!publishPolarity('イシューは確認なしで切り分けていい').waiver)
  // An order that an "and" opens lends its object to the waiver before it (fifteenth, Medium-1);
  // no trigger reads these lines, so only the ruling is pinned.
  for (const text of ["Don't ask me and just push.", 'No confirmation needed and push freely.']) {
    const ruling = publishPolarity(text)
    assert.ok(ruling.waiver && !ruling.asking, `${text}: ${JSON.stringify(ruling)}`)
  }
  assert.ok(!publishPolarity('No approval needed and publishing notes is up to you').waiver)
  assert.ok(!publishPolarity('No approval needed and publishing the release notes is up to you').waiver)
  assert.ok(publishPolarity("Don't ask me and just push changes that are fine").waiver)
  // A confirmation put after the publishing act is no gate before it (nineteenth re-inspection, High-1);
  // no trigger reads these lines, so only the ruling is pinned.
  for (const text of ['確認はpush後でいい', 'レビューはPRを出した後でいい', '確認はリリース後で大丈夫', 'レビューはPRを作った後でいい', '確認はイシューを立てた後でいい', 'レビューはPRを作成した後でいい', 'レビューはPRを切った後でいい', '確認は後に回すので先にpushして']) {
    const ruling = publishPolarity(text)
    assert.ok(ruling.waiver && !ruling.asking, `${text}: ${JSON.stringify(ruling)}`)
  }
  // A waiver before けど and the person's say-so after it keep the gate through the recipe's own
  // trigger (sixteenth re-inspection of the matcher, medium-1).
  {
    const text = 'pushの確認は不要だけど、mainへのpushは私が見てから'
    const proposals = matchRecipes(profileFrom([{ section: 'boundaries', text }]), [recipe])
    assert.equal(proposals.length, 1, text)
    assert.equal(proposals[0].confidence, 'medium', text)
  }
  // The publishing object is looked for in the tight clause (fourteenth re-inspection, Low-1).
  assert.ok(!publishPolarity('Feel free to run the linter without asking and push when it passes').waiver)
  assert.ok(!publishPolarity('Feel free to fix issues without asking.').waiver)
  assert.ok(!publishPolarity('Feel free to close open issues without asking.').waiver)
  assert.ok(publishPolarity('イシュー作成は確認なしでOK').waiver)
  // "token" and "book" grant nothing: OK needs word boundaries (M-2).
  assert.ok(!publishPolarity('Push without asking when the token is set').waiver)
  assert.ok(!publishPolarity('Push without asking as the book says').waiver)
  assert.ok(publishPolarity('Push without asking, ok').waiver)
  // A waiver about something else leaves the gate alone (M-1).
  assert.deepEqual(publishPolarity('テストは確認なしで回してOK'), { unlessText: `テストは${' '.repeat('確認なしで'.length)}回してOK`, waiver: false, asking: false, conflict: false })
})

test('unless patterns keep their lastIndex and apply within the matched cell only (probe recipe)', () => {
  const veto = /\bveto\b/giu
  veto.lastIndex = 7
  const recipe = probeRecipe([{ lang: 'any', pattern: /\bneedle\b/iu, cell: 'any' }], { unless: [{ lang: 'en', pattern: veto }] })
  const plain = profileFrom([{ text: 'needle' }], { language: 'en' })
  for (let round = 0; round < 3; round += 1) assert.equal(matchRecipes(plain, [recipe]).length, 1)
  assert.equal(veto.lastIndex, 7)
  assertSuppressed(recipe, profileFrom([{ text: 'veto needle' }], { language: 'en' }))
  assertSuppressed(recipe, profileFrom([{ text: 'needle, then veto' }], { language: 'en' }))
  const otherCell = profileFrom([{ kind: 'row', text: 'veto | needle', left: 'veto', right: 'needle' }], { language: 'en' })
  assert.equal(matchRecipes(otherCell, [recipe]).length, 1)
  assertSuppressed(recipe, profileFrom([{ kind: 'row', text: 'other | veto needle', left: 'other', right: 'veto needle' }], { language: 'en' }))
  // An unless of another language still applies (DESIGN §5.4a: `lang` is informational).
  assertSuppressed(recipe, profileFrom([{ text: 'veto needle' }], { language: 'ja' }))
})

test('character limits that name another object neither trigger nor derive, even beside a brevity request (re-inspection, chunk B, M-3; tests H-2)', () => {
  const lead = getRecipe('lead-with-answer')
  for (const [language, text, expected] of [
    ['en', 'Keep branch names within 30 chars. Answer first.', 0],
    ['ja', 'ブランチ名は30字以内。結論を先に。', 0],
    ['en', 'Keep commit subjects under 50 chars; keep answers within 250 chars.', 250],
    ['ja', 'コミットの件名は50字以内。返答は200字以内。', 200],
    ['ja', '関数の説明コメントは50字以内。結論を先に。', 0],
    ['ja', '回答は、200字以内で。', 200],
    // A comma ends the object's clause (M-c), and a 、 counts only right after the reply word (L-e).
    ['ja', '件名は英語、回答は200字以内', 200],
    ['en', 'Commit subjects in English, replies under 200 chars', 200],
    ['ja', '回答は日本語で、引用は200字以内', 0],
    ['ja', '返答に含めるコメントは50字以内。結論を先に。', 0],
    // A second limit in the same clause keeps the reply's limit (third re-inspection, M1).
    ['ja', '回答は200字以内で件名は50字以内', 200],
    ['en', 'Keep replies under 250 chars and commit titles under 72 chars', 250],
    ['ja', '件名は英語,回答は200字以内', 200],
    ['ja', '回答、200字以内', 200],
    ['ja', '回答については、200字以内', 200],
    ['en', 'Replies under 250 chars\n- commit titles under 72 chars', 250],
  ]) {
    const proposal = matchRecipes(profileFrom([{ text }], { language }), [lead])[0]
    assert.ok(proposal, text)
    assert.equal(proposal.params.max_chars, expected, text)
  }
  // The reply word must stand within a dozen characters before the count.
  for (const [filler, expected] of [[11, 200], [12, 0]]) {
    const text = `返答は${'あ'.repeat(filler)}200字以内`
    assert.equal(matchRecipes(profileFrom([{ text }]), [lead])[0].params.max_chars, expected, text)
  }
})

test('quiet-confirmations never fires on a request to keep confirming (re-inspection, chunk B, H-1)', () => {
  const recipe = getRecipe('quiet-confirmations')
  // The negated forms are refused by the trigger itself (a lookbehind or lookahead on the
  // verb), so the proof is the positive pair below with the same verbs.
  for (const [language, text] of [
    ['en', 'Never skip the confirmation before deleting'],
    ['en', "Don't stop checking in"],
    ['en', 'Do not drop the routine confirmations'],
    ['ja', '確認の質問はやめないで'],
    ['ja', '確認を減らしたりしないで'],
    ['ja', '念のため確認を省かないでください'],
  ]) assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text }], { language }), [recipe]), [], text)
  // Where a trigger fires beside the negated form, the unless cancels the line.
  for (const [language, text] of [
    ['en', "Just do it, but never skip the confirmation before deleting"],
    ['ja', '即実行でいいが、確認の質問はやめないで'],
  ]) assertSuppressed(recipe, profileFrom([{ section: 'care', text }], { language }))
  for (const [language, text] of [
    ['en', 'Skip the routine confirmations'],
    ['en', 'Skip the confirmation before deleting'],
    ['en', 'Drop the routine confirmations'],
    ['en', 'Stop checking in on routine edits'],
    ['en', "Don't keep asking me to confirm; just do it"],
    ['ja', '確認の質問はやめて'],
    ['ja', '念のため確認を減らして'],
    ['ja', '念のため確認を減らしたりして'],
    ['ja', '念のため確認を省いて'],
    ['ja', '確認の質問はやめて構わない'],
    ['ja', '念のため確認を控えてもらえませんか'],
    ['ja', '確認の質問は省きます'],
  ]) assert.equal(matchRecipes(profileFrom([{ section: 'care', text }], { language }), [recipe]).length, 1, text)
  for (const [language, text] of [
    ['ja', '確認の質問は省かないで'], ['ja', '確認を減らさないで'], ['en', 'Never just skip the confirmation step'],
    // Late negations (third re-inspection of the catalog, H1).
    ['ja', '念のため確認はやめてほしくない'], ['ja', '確認の質問は控えてほしくない'], ['ja', '過剰確認は不要ではない'],
    ['ja', '念のため確認を省かずに'], ['ja', '確認の質問はやめずに続けて'], ['ja', '念のため確認を減らしてはいけない'],
    // Polite and continuative forms (fourth re-inspection of the catalog, H-1).
    ['ja', '念のための確認は不要ではありません'], ['ja', '念のため確認を不要ではなく必須とする'], ['ja', '確認の質問はやめてほしくありません'],
    ['ja', '念のため確認は控えるべきではありません'], ['ja', '確認の質問をやめるわけではありません'],
    // Fifth re-inspection of the catalog: は dropped or inserted, 駄目, いただきたく, a quoted doubt.
    ['ja', '確認の質問はやめるべきでない'], ['ja', '確認の質問をやめてほしくはありません'], ['ja', '念のため確認をやめては駄目'],
    ['ja', '確認の質問は減らしていただきたくない'], ['ja', '念のため確認が不要だとは思いません'],
    // Sixth re-inspection of the catalog: 省くな, 省くべきではない, a doubted 不要 in other verb forms.
    ['ja', '確認の質問を省くな'], ['ja', '念のため確認を省くべきではない'], ['ja', '念のため確認が不要だとは思っていません'], ['ja', '確認の質問が不要とは言いません'],
    // Seventh re-inspection of the catalog: 「省くのはやめて」「省くことはしないで」 (H-2).
    ['ja', '念のため確認を省くのはやめてください'], ['ja', '確認の質問を省くことはしないでください'], ['ja', '確認の質問をやめることは禁止'],
    // Eighth re-inspection of the catalog: 減らす/省略する/なくす + のはやめ (H1), 「が、」 (M1).
    ['ja', '確認の質問を減らすのはやめてください'], ['ja', '念のため確認を省略するのはやめて'], ['ja', '確認の質問を減らすことはしないでください'],
    ['ja', '念のため確認は不要だが、なくすのは禁止'], ['ja', '念のため確認は不要と言われるが、省かないでください'],
    // Ninth re-inspection of the catalog: the noun 省略 (H-1), せず/省かず (H-2).
    ['ja', '確認の質問の省略は禁止です'], ['ja', '念のため確認の省略はやめてください'], ['ja', '念のため確認の省略はしないでください'],
    ['ja', '念のため確認は省略せずに行ってください'], ['ja', '確認の質問は省かずに続けて'],
    // Tenth re-inspection of the catalog: 「ほしくないと思っています」「不要ではないと思います」 (F-1).
    ['ja', '念のため確認を減らしてほしくないと思っています'], ['ja', '念のため確認は不要ではないと思います'],
    // Eleventh re-inspection of the catalog: 「やめないと約束して」 is a promise, not a condition (M-2).
    ['ja', '念のため確認はやめないと約束してください'],
    // Thirteenth re-inspection of the catalog: a manner word before 言われている (M-1).
    ['ja', '確認の質問は省かないと厳しく言われている'],
  ]) {
    assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text }], { language }), [recipe]), [], text)
  }
  for (const [language, text] of [
    ['en', "Don't ever stop checking in with me."],
    ['ja', '即実行でいいが、念のため確認はやめてほしくない'],
    ['ja', '即実行でいいが、確認は省かずに'],
    ['ja', '即実行でいいが、確認の質問はやめてほしくありません'],
    ['ja', '即実行でいいが、念のため確認は控えるべきではありません'],
    ['ja', '念のため確認は不要だと言われても、やめないで'],
  ]) assertSuppressed(recipe, profileFrom([{ section: 'care', text }], { language }))
  // A concessive clause about another topic does not cancel (seventh re-inspection, M-a),
  // and a colloquial affirmative 「いらないな」 is still a request (L-a).
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問はやめてほしいけど、テストは省かないで' }]), [recipe]).length, 1)
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '過剰確認はいらないな。' }]), [recipe]).length, 1)
  // The verbs the eighth-round negatives carry still fire when the request is to reduce.
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '念のため確認は省略して' }]), [recipe]).length, 1)
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らして' }]), [recipe]).length, 1)
  // 「省略しないと進まない」 is a condition, not a negation (ninth re-inspection, L-3), also when the
  // consequence stands a few characters after と (twelfth, 中-2).
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問は省略しないと進まない' }]), [recipe]).length, 1)
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '念のため確認はやめないと仕事にならない' }]), [recipe]).length, 1)
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を省かないと話が進まない' }]), [recipe]).length, 1)
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らさないと疲れる' }]), [recipe]).length, 1, '減らさないと疲れる')
  // 減らす in a non-request (fifteenth re-inspection of the catalog, M-1).
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすとミスが増える' }]), [recipe]), [])
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすかどうかは私が決める' }]), [recipe]), [])
  // 「減らすと助かります」 is a request (sixteenth re-inspection, Medium-2).
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすと助かります' }]), [recipe]).length, 1, '減らすと助かります')
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすといいです' }]), [recipe]).length, 1, '減らすといいです')
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすといいとは思わない' }]), [recipe]), [])
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすといいとは思います' }]), [recipe]).length, 1, '減らすといいとは思います')
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすといいとは限らない' }]), [recipe]), [])
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問を減らすといいとは言えない' }]), [recipe]), [])
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問は不要とは限らない' }]), [recipe]), [])
  assert.deepEqual(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問は不要とまでは言えない' }]), [recipe]), [])
  // A line about something else than confirmation does not cancel (L-1), nor does a
  // negated verb in another clause (fifth re-inspection, M3).
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '即実行でいい。テストは不要ではない' }]), [recipe]).length, 1)
  assert.equal(matchRecipes(profileFrom([{ section: 'care', text: '確認の質問はやめて、テストは省かないで' }]), [recipe]).length, 1)
})

test('narrowed negations keep their proposals (re-inspection, chunk B, M-2, L-1, L-2, L-3)', () => {
  assert.equal(matchRecipes(profileFrom([{ text: '短くまとめて。冗長な説明はしないで' }]), [getRecipe('lead-with-answer')]).length, 1)
  const typos = getRecipe('accept-typos-as-intent')
  for (const [language, text] of [
    ['en', 'Ignore my typos; if the build breaks, point it out'],
    ['ja', '誤字があったら教えてくれなくていい'],
    ['en', 'Do not ever correct my typos'],
    ['en', "My typos: please don't point them out"],
    ['en', 'My typos: no need to point them out'],
    ['en', "My typos: don't ever point them out"],
    ['en', "Don't ever fix my typos"],
    ['en', "You don't need to correct my typos"],
    ['en', "Needn't flag my typos"],
    ['en', "You don't have to fix my typos"],
    ['en', 'You do not need to fix typos'],
    ['en', "You shouldn't correct my typos"],
  ]) assert.equal(matchRecipes(profileFrom([{ text }], { language }), [typos]).length, 1, text)
  const lead = getRecipe('lead-with-answer')
  for (const text of ['短く答えなくていい', '短くまとめようとしないで']) assertSuppressed(lead, profileFrom([{ text }]))
  for (const [language, text] of [['en', 'I make typos; please point them out'], ['ja', '誤字があったら教えて']]) {
    assertSuppressed(typos, profileFrom([{ text }], { language }))
  }
  const expert = getRecipe('expert-role-with-evidence')
  for (const text of ['I work as a professor.', "I’m a professor, so answer as a specialist."]) {
    assertSuppressed(expert, profileFrom([{ text }], { language: 'en' }))
  }
  assert.equal(matchRecipes(profileFrom([{ text: 'Answer as a specialist.' }], { language: 'en' }), [expert]).length, 1)
})
