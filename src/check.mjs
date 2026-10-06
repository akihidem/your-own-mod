function pattern(japanese, ascii = []) {
  const sources = [...japanese]
  // ASCII word boundaries must still recognize tokens directly beside Japanese text.
  if (ascii.length) sources.push(`(?<![A-Za-z0-9])(?:${ascii.join('|')})(?![A-Za-z0-9])`)
  return new RegExp(sources.join('|'), 'giu')
}

const definitions = [
  {
    id: 'F-DIAGNOSIS', level: 'FAIL', description: 'Refuse diagnosis and classification terms.',
    pattern: pattern([
      '自閉症', '自閉スペクトラム', '神経発達症', '発達障害', '学習障害', '知的障害',
      '精神障害', '気分障害', '睡眠障害', '愛着障害', '抑うつ', '抑鬱',
      '(?:うつ|ウツ|鬱|欝)(?:病|状態|傾向|っぽい|気味|症状)', '双極性', '双極症', '統合失調',
      'パニック(?:障害|症)', '強迫性', '強迫症', '社交不安', '全般性不安', '適応障害',
      '摂食障害', '依存症', '人格障害', '境界性', '不安障害',
    ], [
      'ADHD(?:s|ers?)?', 'ASDs?', 'HSPs?', 'PTSD', 'DSM', 'ICD-?1[01]', String.raw`F[0-9]{2}\.[0-9A-Z]{1,4}`,
      'ADD', 'autism', 'autistic', 'dyslexia', 'dyslexic', 'bipolar', 'schizophrenia',
      'schizophrenic', 'OCD', 'personality disorder', 'depressive disorder', 'major depression',
      'anxiety disorder', 'panic disorder', 'eating disorder', 'asperger',
    ]),
  },
  {
    id: 'F-TEST-SCORE', level: 'FAIL', description: 'Refuse test names and scores.',
    pattern: pattern(['ロールシャッハ', '知能検査', '知能指数'],
      ['IQ', 'FSIQ', 'WAIS', 'WISC', 'MMPI', 'Rorschach']),
  },
  {
    id: 'F-SELF-HARM', level: 'FAIL', description: 'Refuse self-harm method terms.',
    pattern: pattern([
      '首を?吊', '首つり', '飛び降り', '過量服薬', 'オーバードーズ', 'リストカット', '練炭', '手首を切',
    ], [
      'OD', 'overdose', 'hang(?:ing)? myself', 'cut(?:ting)? my wrists',
      'jump(?:ing)? off (?:a|the) (?:bridge|building|roof)',
    ]),
  },
  {
    id: 'F-OVERRIDE', level: 'FAIL', description: 'Refuse requests to bypass safety rules.',
    pattern: pattern([
      '制限を(?:無視|解除)', 'セーフティ(?:を|機能を)?(?:無効|解除|オフ)',
      'ガードレールを(?:外|無効)', 'ルールを無視', '脱獄',
    ], [
      'DAN', 'ignore (?:all |your |the )?(?:safety|guardrails|rules|restrictions)',
      'disable (?:the |your )?(?:safety|guardrails)', 'jailbreak',
    ]),
  },
  {
    id: 'F-ROLEPLAY', level: 'FAIL', description: 'Refuse clinician role-play requests.',
    pattern: pattern([
      '(?:あなたは|あなたが)(?:医師|医者|精神科医|セラピスト|カウンセラー|臨床心理士|公認心理師)(?:です|だ|として|になって|のように|役)',
      '(?:医師|医者|精神科医|セラピスト|カウンセラー|臨床心理士|公認心理師)(?:として|のように)(?:振る舞|答え|話し)',
    ], [
      "(?:you are(?: now)?|you're|act as|act like|pretend to be|behave as|behave like) (?:a |an |my )?(?:doctor|physician|psychiatrist|therapist|counselor|counsellor|clinical psychologist|psychologist)",
    ]),
  },
  { id: 'F-STRUCTURE', level: 'FAIL', description: 'Require sections in a structured manual.' },
  {
    id: 'W-NEG-LABEL', level: 'WARN', description: 'Flag strong negative labels.',
    pattern: pattern(['(?:とても|ひどく|非常に|かなり|極度に)(?:不安|落ち込|抑うつ|憂うつ|自己嫌悪)'],
      ['(?:extremely|severely|very) (?:anxious|depressed)']),
  },
  {
    id: 'W-THIRD-PARTY', level: 'WARN', description: 'Flag references to a named third party.',
    pattern: pattern(['[一-龥々ぁ-んァ-ン]{2,4}(さん|先生|部長|課長|社長)(?:が|は|に|の)']),
  },
  { id: 'W-FEW-SECTIONS', level: 'WARN', description: 'Flag a manual with only one or two sections.' },
  { id: 'W-NO-SECTIONS', level: 'WARN', description: 'Flag a generic manual without sections.' },
]
const uppercaseAbbreviations = new Set(['ADD', 'OD', 'DAN'])
const precedingNegations = pattern([], ["don't", 'do not(?: ever)?', 'never', 'not to'])
const thirdPartyStoplist = ['患者さん', '看護師さん', '皆さん', 'みなさん', 'お客さん']
const unnamedPrefixes = ['その', 'この', 'あの', 'うちの', 'お母', 'お父', 'お姉', 'お兄']
// って is the colloquial quoting particle (「しないでって言われても」; fifth re-inspection of the checker, HIGH-1).
const japaneseConditions = /^(?:か|なら|わけ|にはいられ|限り|では)/u
// What may follow a Japanese negation for it to end the request (Appendix A); anything
// else (「ないのはだめ」「ないでほしくない」) turns it into a demand and keeps the hit.
// 「ように」「です」 and a closing bracket end the request too (re-inspection, chunk A, M-3).
const japaneseNegationEndings = /^(?:ください|下さい|ほしい|欲しい|ね|よ|こと|です|ように|[。、！!」』)）\uE000]|$)/u
const japaneseDemands = /^(?:(?:は|のは|ことは|も)?\s*(?:だめ|ダメ|NG|いけない|いけません|困る|ほしくは?(?:ない|ありません)|欲しくは?(?:ない|ありません)|許さ|禁止|ありません))/u
// What the negation guard reads is the final spelling: tags, emphasis markers and runs of
// spaces are dropped from the context first, so a `<b>` or a double space between the
// negation and the verb is not a word (re-inspection, chunk A, M-1).
const TAG = /<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>/gu
const EMPHASIS = /(?<=\p{L})[*_~`]+(?=\p{L})/gu
// Private-use characters are removed too, so none can hide a term or pose as the break
// mark (sixth re-inspection of the checker, L-2).
const INVISIBLE = /[\p{Cf}\p{Co}\u034F\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u115F\u1160\u3164\uFFA0]|(?![\t\n\r])\p{Cc}/gu
// A block-level tag is a clause break (a negation in one paragraph does not govern the
// next); an inline tag is a space (second re-inspection of the checker, H-a). The break
// is its own mark, a private-use character that no manual carries and that neither the
// space collapse nor the invisible-character removal touches; the English clause set and
// the Japanese request endings contain it, so 「<li>ルールを無視しない</li>」 stays guarded
// while a real 。 keeps its own meaning: what stands after a break is read on both sides of
// it, what stands after a 。 is another sentence (fourth re-inspection of the checker, M-A).
const BLOCK_TAG = /<\/?(?:br|p|div|li|ul|ol|tr|td|th|table|h[1-6]|hr|blockquote|pre|section|article)\b[^<>]*>/giu
const BREAK = '\uE000'
const BREAKS = /^(?:\uE000\s*)+/u
// A quoting particle (と・って・なんて) after a negated request keeps the request alive
// when a concessive or conditional marker follows it in the same clause (「と言われても」
// 「と約束したけど」「と言われたら」), or when it begins no benign word (「と言われた」「と答えて
// ください」, refused on the safe side); it is guarded only when it begins one of the closed
// benign words with no such marker (「とにかく」「と思います」「と約束して」「ところ」「とき」
// 「ということ」). The particle may stand right after the negation or after a run of
// endings: a closed set of hiragana auxiliaries and request forms (ください・くれ・ちょうだい・
// ほしい・いただきたい・もらいたい・ように・こと・です・ます・ません・しなさい・しましょう・
// おいて・ね・よ・な・か…), the elongation marks, sentence punctuation, closing quotation marks,
// 、 and block breaks; a content word (kanji, katakana, Latin) ends the run. The verbs that
// can follow the particle are an open set, so none is enumerated (eighth and ninth
// re-inspections of the checker; Appendix A).
const BENIGN_TO = String.raw`にかく|もかく|もあれ|もに|ても|っても|一緒|いっしょ|同時|約束|思|考|願|期待|ころ|き(?:は|も|に|どき|\s|$)|いう(?:の|こと|点|意味|わけ|話|ものの)|いえば|りあえず|りわけ|くに|うとう|っさに|すると|は(?:言え|いえ)(?=[、,\s]|$)`
const BENIGN_START = new RegExp(String.raw`^(?:${BENIGN_TO})`, 'u')
const QUOTING_PARTICLE = /^(?:と|って|なんて)/u
// The clause after the particle, with a leading とても/とっても removed first (「と思っても」 is a
// concessive; tenth re-inspection, M-2); が counts as a concessive after a predicate (M-1),
// whatever follows it, except a が followed by って, or by a う that no hiragana or elongation
// mark follows, the shape of したがって/したがう (eleventh, 中1; twelfth, M-1; thirteenth and
// fourteenth, low); on the safe side a が after a noun's last kana counts too (「あなたが決めて」;
// Appendix A).
const CONCESSIVE = /ても|でも|たって|ようと|けど|けれど|のに|たら|れば|なら|ものの|ながら|にもかかわらず|[たださるうすいん]が(?!って|う(?![\p{Script=Hiragana}ー〜~〰]))/u
const ENDING_RUN = /^(?:ください|下さい|くださ|くれ|ちょうだい|頂戴|ほしい|欲しい|いただき|いただけ|いただい|いただ|もらい|もらえ|もらっ|もら|たい|たく|ように|よう|こと|です|でしょう|でしょ|でし|ます|ませ|ましょう|ましょ|しょう|しなさい|なさい|しろ|せよ|しよ|して|する|し|おいて|おく|おこう|おき|いて|いる|いよ|ん|ね|よ|な(?!んて)|わ|さ|ぞ|ぜ|か|ー|〜|~|〰|[。．.!！?？…]|[」』"”）)]|、|\s|\uE000)*/u
const CLAUSE_END = /[、,。．.!?！？\uE000\n]/u
// After 「ないで」「ず(に)」 these conditions keep the request alive as well, on either side of
// a block break; 「ないでかまわない」 is not the condition か (ninth re-inspection, low-2).
const subordinateConditions = /^(?:か(?!まわ|まい)|なら|わけ|にはいられ|限り|では)/u
// Beyond a block break only these keep the request alive (「かならず守って」 starts a new
// clause; fourth re-inspection, M-B; tenth, L-2).
const beyondConditions = /^(?:にはいられ|かどうか)/u
function quotedAfter(text) {
  const run = ENDING_RUN.exec(text)[0]
  const tail = text.slice(run.length)
  const particle = QUOTING_PARTICLE.exec(tail)
  if (particle === null) return false
  if (particle[0] === 'なんて') return true
  if (CONCESSIVE.test(tail.split(CLAUSE_END)[0].replace(/^と(?:っ)?ても/u, ''))) return true
  return !(particle[0] === 'と' && BENIGN_START.test(tail.slice(particle[0].length)))
}
function plainContext(text) {
  return text.replace(BLOCK_TAG, `${BREAK} `).replace(TAG, ' ').replace(EMPHASIS, '').replace(/\s+/gu, ' ')
}
const negationAdverbs = new Set(['ever', 'really', 'just', 'please', 'even', 'also', 'again'])

/** Frozen, input-independent rule metadata for command listings. */
export const RULES = Object.freeze(definitions.map(({ id, level, description }) =>
  Object.freeze({ id, level, description })))

function negatesRequest(text, match, rule) {
  if (!/^[A-Za-z]/u.test(match[0])) {
    let suffix = plainContext(text.slice(match.index + match[0].length))
    if (rule === 'F-ROLEPLAY' && match[0].endsWith('振る舞')) suffix = suffix.replace(/^わ/u, '')
    // An optional verb may sit between a role phrase and its negation
    // (「カウンセラーとして振る舞わないで」); the stem set includes す for するな.
    const negation = /^(?:に|は|も|を)?(?:振る舞わ?|答え|話さ?|行動し|対応し|にし|し|さ|せ|す)?(ない|ず|るな)/u.exec(suffix)
    if (!negation) return false
    const rest = suffix.slice(negation[0].length).trimStart()
    // Conditions right after the negation keep the request alive (「無視しないと答えられない」
    // 「解除しないか」「無視しないではいられない」), and so does a quoting particle, directly
    // or after the run of endings (quotedAfter); checked before で/に are consumed.
    if (japaneseConditions.test(rest) || quotedAfter(rest)) return false
    // 「ないで」「ず(に)」 open a subordinate clause (「解除せず進めて」 = proceed without
    // lifting), so the negation holds unless what follows negates the negation itself
    // (「ないでほしくない」「せずにはだめ」). A bare 「ない」 must end the request
    // (「無視しない。」「無視しないこと」); 「無視しないのはだめ」 is a demand. 「ないです」 is
    // the polite ending, not 「ないで」 (second re-inspection of the checker, M-a).
    const subordinate = negation[1] === 'ず' || (negation[1] === 'ない' && /^で(?!す|しょう)/u.test(rest))
    if (subordinate) {
      const after = rest.replace(/^(?:で|に)/u, '').trimStart()
      // Block tags between 「ないで」 and what follows became breaks; the demand is read on
      // both sides of them (third and fourth re-inspections, H-1, H-A). 「ないでかまわない」 is
      // not the condition か (ninth re-inspection, low-2).
      const beyond = after.replace(BREAKS, '')
      if (subordinateConditions.test(after) || beyondConditions.test(beyond) || quotedAfter(after)) return false
      return !(japaneseDemands.test(after) || japaneseDemands.test(beyond))
    }
    // 「無視しないですか」 is an invitation and 「ないですって」 a retort, not a refusal
    // (fifth re-inspection, MEDIUM-1).
    if (rest.startsWith('です')) {
      const tail = rest.slice(2).trimStart()
      return !(/^(?:か|なら|わけ|限り|では)/u.test(tail) || quotedAfter(tail) || japaneseDemands.test(tail.replace(BREAKS, '')))
    }
    // A bare 「ない」 must end the request; a demand beyond a block break keeps it alive
    // (fourth re-inspection of the checker, M-B).
    return japaneseNegationEndings.test(rest) && !japaneseDemands.test(rest.replace(BREAKS, ''))
  }
  // Appendix A explicitly permits the emphatic comma in "never, ever".
  const prefix = plainContext(text.slice(0, match.index))
    .replace(/(?<![A-Za-z0-9])never,\s*ever(?![A-Za-z0-9])/giu, 'never ever')
    .split(/[.,;:!?。、—–()\uE000]/u).at(-1)
  for (const guard of prefix.matchAll(precedingNegations)) {
    // Only a closed set of adverbs may stand between the negation and the verb it
    // negates ("don't ever ignore", "never really ignore"); any other word means the
    // negation governs something else ("don't forget to ignore", "don't worry and
    // ignore") and the request stays a hit. Final inspection, chunk A, HIGH-3.
    const between = prefix.slice(guard.index + guard[0].length)
    const words = between.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
    if (words.length <= 2 && words.every(word => negationAdverbs.has(word.toLowerCase()))) return true
  }
  return false
}

// One pass of text with the positions of the join between two lines carried along, so a
// term that straddles the join is reported at the first line whatever replacements shift.
function transform(state, expression, replacement) {
  let shift = 0
  state.text = state.text.replace(expression, (...args) => {
    const matched = args[0]
    const value = typeof replacement === 'function' ? replacement(...args) : replacement
    const start = args.at(-2) + shift
    const end = start + matched.length
    const delta = value.length - matched.length
    // Replacements spanning the join inherit both lines (e.g. a split entity).
    if (state.leftEnd > start) state.leftEnd = state.leftEnd >= end ? state.leftEnd + delta : start + value.length
    if (state.rightStart >= end) state.rightStart += delta
    else if (state.rightStart > start) state.rightStart = start
    shift += delta
    return value
  })
  return state
}

function normalizeForScan(raw, commentsOnly = false, join = null, openComment = false) {
  const normalizedText = raw.normalize('NFKC')
  const state = {
    text: normalizedText,
    leftEnd: join ? raw.slice(0, join.leftEnd).normalize('NFKC').length : 0,
    rightStart: join ? normalizedText.length - raw.slice(join.rightStart).normalize('NFKC').length : 0,
  }
  // Entities are decoded first, until nothing changes (an entity may yield another entity,
  // a full-width or a zero-width character). Final inspection, chunk A, HIGH-2 / MEDIUM-1.
  // Entities and normalisation alternate until nothing changes: a run of nested
  // ampersand entities, in any of its spellings, collapses in one step (third and fourth
  // re-inspections, L-1, L-C); each decoding replaces an entity by at most one character;
  // NFKC and the removal of invisible characters are repeated until stable (a base kana,
  // an invisible character and a combining mark compose only after the mark is gone;
  // re-inspection, chunk A, H-1); and a decoded full-width ＆ (U+FF06) becomes & under
  // NFKC, which can open another entity, so the whole alternation repeats (fifth
  // re-inspection of the checker, LOW-1). Final inspection, chunk A, HIGH-2 / MEDIUM-1.
  for (;;) {
    const start = state.text
    transform(state, /&(?:amp;|#0*38;|#x0*26;)+/giu, '&')
    for (;;) {
      const before = state.text
      transform(state, /&amp;/giu, '&')
      transform(state, /&#(?:([0-9]+)|x([0-9a-f]+));/giu, (entity, decimal, hex) => {
        const codePoint = Number.parseInt(hex ?? decimal, hex === undefined ? 10 : 16)
        return codePoint <= 0x10FFFF && !(codePoint >= 0xD800 && codePoint <= 0xDFFF)
          ? String.fromCodePoint(codePoint) : entity
      })
      if (state.text === before) break
    }
    for (let round = 0; round < 8; round += 1) {
      const before = state.text
      transform(state, /[^\x00-\x7F]+/gu, run => run.normalize('NFKC'))
      transform(state, INVISIBLE, '')
      if (state.text === before) break
    }
    if (state.text === start) break
  }
  const comments = []
  let start = 0
  let bodyStart = 0
  // A marker inside a code span is text, as the parser treats it (chunk A, MEDIUM-3).
  const markerText = state.text.replace(/`[^`]*`/gu, span => ' '.repeat(span.length))
  for (const marker of markerText.matchAll(/<!--|-->/gu)) {
    if (!openComment && marker[0] === '<!--') {
      openComment = true
      start = marker.index
      bodyStart = start + 4
    } else if (openComment && marker[0] === '-->') {
      comments.push({ start, end: marker.index + 3, bodyStart, bodyEnd: marker.index })
      openComment = false
    }
  }
  if (openComment) comments.push({ start, end: state.text.length, bodyStart, bodyEnd: state.text.length })
  transform(state, /[\s\S]/gu, (character, offset) => {
    if (commentsOnly) {
      return comments.some(span => offset >= span.bodyStart && offset < span.bodyEnd)
        ? character : ' '.repeat(character.length)
    }
    return comments.some(span => offset >= span.start && offset < span.end) ? '' : character
  })
  transform(state, /[\u2018\u2019]/gu, "'")
  // Four spellings are scanned, each with its own join positions: with tags and emphasis
  // markers (`<ADHD>` looks like a tag but is a term; chunk A, HIGH-1), with tags but
  // without emphasis (`<A_DHD>`; re-inspection, chunk A, M-2), without tags but with
  // emphasis (`x_ADHD_y` must not be joined to its neighbours), and the final text.
  const preTags = { ...state }
  const preTagsNoEmphasis = transform({ ...preTags }, EMPHASIS, '')
  // A block-level tag is the break mark in every spelling (「ないで</li><li>とにかく」 is not
  // 「ないでと…」, and the demand behind a break is still read); a term cannot hide across
  // one, since it renders as a visual break. Inline tags are removed, so `A<b>D</b>HD` is
  // still a term (fifth re-inspection of the checker, MEDIUM-2).
  if (!commentsOnly) transform(state, BLOCK_TAG, BREAK)
  if (!commentsOnly) transform(state, TAG, '')
  const preEmphasis = { ...state }
  transform(state, EMPHASIS, '')
  transform(state, /\s+/gu, ' ')
  const seen = new Set()
  const variants = [state, preEmphasis, preTags, preTagsNoEmphasis].filter(variant => {
    if (seen.has(variant.text)) return false
    seen.add(variant.text)
    return true
  })
  return { variants, openComment }
}

/**
 * Check every raw line against Appendix A without interpreting the person's labels.
 * @param {object} profile A parsed Profile.
 * @returns {{level: 'FAIL'|'WARN', rule: string, line: number|null, message: string}[]} Sorted findings.
 */
export function checkProfile(profile) {
  const findings = []
  const seen = new Set()
  const scan = (normalized, line, failOnly = false, acrossJoin = false) => {
    for (const { text, leftEnd, rightStart } of normalized.variants)
    for (const rule of definitions) {
      const location = `${rule.id}:${line}`
      if (!rule.pattern || seen.has(location) || (failOnly && rule.level !== 'FAIL')) continue
      for (const match of text.matchAll(rule.pattern)) {
        if (acrossJoin && !(match.index < leftEnd && match.index + match[0].length > rightStart)) continue
        if (uppercaseAbbreviations.has(match[0].toUpperCase()) && match[0] !== match[0].toUpperCase()) continue
        // Negation guards this occurrence only; a later unguarded request must still fail.
        if ((rule.id === 'F-OVERRIDE' || rule.id === 'F-ROLEPLAY')
          && negatesRequest(text, match, rule.id)) continue
        if (rule.id === 'W-THIRD-PARTY') {
          const person = match[0].slice(0, -1)
          const name = person.slice(0, -match[1].length)
          if (thirdPartyStoplist.some(noun => person.endsWith(noun))
            || unnamedPrefixes.some(prefix => name.endsWith(prefix))) continue
        }
        const label = rule.level === 'FAIL' ? 'forbidden term' : 'matched term'
        findings.push({
          level: rule.level, rule: rule.id, line,
          message: rule.id === 'W-THIRD-PARTY' ? `${rule.id}: a named person (…${match[1]})`
            : `${rule.id}: ${label} ${JSON.stringify(match[0])}`,
        })
        seen.add(location)
        break
      }
    }
  }
  const lines = [...profile.lines].sort((a, b) => a.line - b.line)
  const commentStarts = new Map()
  let openComment = false
  for (const line of lines) {
    commentStarts.set(line.line, openComment)
    if (line.kind === 'code') {
      // Fenced code never opens or closes a comment; its raw text is still scanned.
      scan(normalizeForScan(line.raw, false, null, false), line.line)
      continue
    }
    const visible = normalizeForScan(line.raw, false, null, openComment)
    scan(visible, line.line)
    // Inspect private comment bodies separately so they cannot alter visible guards.
    scan(normalizeForScan(line.raw, true, null, openComment), line.line, true)
    openComment = visible.openComment
  }
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const left = lines[index]
    const right = lines[index + 1]
    if (left.kind === 'code' || right.kind === 'code' || right.line !== left.line + 1) continue
    for (const separator of ['', ' ']) {
      const raw = left.raw + separator + right.raw
      const join = { leftEnd: left.raw.length, rightStart: left.raw.length + separator.length }
      for (const commentsOnly of [false, true]) {
        scan(normalizeForScan(raw, commentsOnly, join, commentStarts.get(left.line)), left.line, true, true)
      }
    }
  }
  const count = profile.sections.filter(section => section.key !== 'unknown').length
  if (count === 0) {
    if (profile.format === 'kokoro' || profile.format === 'torisetsu') {
      findings.push({ level: 'FAIL', rule: 'F-STRUCTURE', line: null, message: 'F-STRUCTURE: no sections' })
    } else if (profile.format === 'generic') {
      findings.push({ level: 'WARN', rule: 'W-NO-SECTIONS', line: null, message: 'W-NO-SECTIONS: no sections' })
    }
  } else if (count < 3) {
    findings.push({
      level: 'WARN', rule: 'W-FEW-SECTIONS', line: null,
      message: 'W-FEW-SECTIONS: fewer than three sections',
    })
  }
  return findings.sort((a, b) => {
    const left = a.line ?? Infinity
    const right = b.line ?? Infinity
    if (left !== right) return left - right
    return a.level === b.level ? 0 : a.level === 'FAIL' ? -1 : 1
  })
}

/**
 * Count the two finding levels without changing the findings.
 * @param {{level: 'FAIL'|'WARN'}[]} findings
 * @returns {{fails: number, warns: number}}
 */
export function summarize(findings) {
  const result = { fails: 0, warns: 0 }
  for (const { level } of findings) {
    if (level === 'FAIL') result.fails += 1
    else if (level === 'WARN') result.warns += 1
  }
  return result
}
