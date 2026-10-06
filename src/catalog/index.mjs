const labels = (ja, en) => ({ ja, en })

// Positive requests belong in the DO cell. Only explicit avoid-cues read the left.
const right = (lang, ...patterns) => patterns.map(pattern => ({ lang, pattern, cell: 'right' }))
const unless = (lang, ...patterns) => patterns.map(pattern => ({ lang, pattern }))

function numberParam(value, min, max, title, description) {
  return { type: 'number', default: value, min, max, title, description }
}

function phrasesParam(values, title, description) {
  return { type: 'string', multiple: true, default: values, title, description }
}

function recipe(spec) {
  return {
    mechanisms: ['prompt.compose'],
    template: 'compose-rule',
    params: {},
    evidence: [{
      kind: 'author',
      ref: 'KOKORO SPEC §1.2 / §7',
      note: 'Design provenance for honoring explicit preferences, not evidence of measured benefit.',
    }],
    metrics: [],
    ...spec,
  }
}

// A limit whose clause names another object (a commit subject, a title, a branch name, a
// comment) is no request for short answers (DESIGN §5.4a; inspections H8 and chunk B
// M3). It is excluded in the trigger and in the derivation themselves rather than by
// `unless`, so a brevity request elsewhere in the same line still proposes
// (re-inspection, chunk B, M-3; tests H-2).
const JA_CHAR_OBJECT = String.raw`(?:件名|コミット|タイトル|題名|見出し|ファイル名|ブランチ名|変数名|関数名|要約文|コメント|(?<![A-Za-z])PRs?(?![A-Za-z]))`
const EN_CHAR_OBJECT = String.raw`\b(?:subjects?|commits?|titles?|headings?|filenames?|branch names?|variable names?|function names?|summar(?:y|ies)|comments?|PRs?)\b`
// A character limit derives only when a reply word stands within a dozen characters
// before the number (DESIGN §5.4a): 「返答は200文字以内」 derives, 「ブランチ名は30字以内」
// does not. Final inspection, chunk B, MEDIUM-1 and MEDIUM-3. A 、 may stand between
// (「回答は、200字以内」; re-inspection, chunk B, L-6).
// The object may stand before or after the count, within the same clause (a comma ends
// the clause, so 「件名は英語、回答は200字以内」 keeps its limit; second re-inspection
// of the catalog, H-1 and M-c). A 、 directly after the reply word is allowed (「回答は、
// 200字以内」) but no other, so 「回答は日本語で、引用は200字以内」 derives nothing (L-e).
// After the count only a modifier relation names the object (「50文字以内のコミット件名」,
// "72 chars max in commit bodies"), so a second limit in the same clause (「回答は200字以内で
// 件名は50字以内」) keeps the reply's limit; no window crosses a line end or a comma of
// either width (third re-inspection of the catalog, M1, L1).
// A limit with a reply word before it (the derivation form) takes only a modifier
// relation as an object after the count (「回答は200字以内で件名は50字以内」 keeps 200); a
// bare limit refuses any object within the clause after the count (「50字以内でコミット件名
// を付ける」 is no brevity request; fourth re-inspection of the catalog, M-1).
const JA_NO_OBJECT = String.raw`(?<!${JA_CHAR_OBJECT}[^。！？、，,;；\n]{0,16})`
const JA_NO_MODIFIER_AFTER = String.raw`(?!\s*の[^。！？、，,;；\n]{0,8}${JA_CHAR_OBJECT})`
// The bare form's window after the count stops at a て-form verb (「250字以内で答えて件名は
// 不要」 keeps its brevity request; fifth re-inspection of the catalog, L2).
const JA_NO_OBJECT_AFTER = String.raw`(?![^。！？、，,;；\nて]{0,16}${JA_CHAR_OBJECT})`
const EN_NO_OBJECT = String.raw`(?<!${EN_CHAR_OBJECT}[^.;,!?\n]{0,24})`
const EN_NO_MODIFIER_AFTER = String.raw`(?!\s*(?:in|for|of|on)\s+(?:the |my |all )?[^.;,!?\n]{0,12}${EN_CHAR_OBJECT})`
const EN_NO_OBJECT_AFTER = String.raw`(?![^.;,!?\n]{0,24}${EN_CHAR_OBJECT})`
const JA_CHAR_LIMIT_SOURCE = String.raw`(?:回答|返答|答え|説明|返事|応答)(?:(?:は|も|を|については)?、)?[^。、，,;；\n]{0,12}?${JA_NO_OBJECT}(?<![\d０-９.．])([\d０-９]+)\s*(?:文字|字)\s*(?:以内|程度|まで|くらい)${JA_NO_MODIFIER_AFTER}`
const JA_CHAR_LIMIT = new RegExp(JA_CHAR_LIMIT_SOURCE, 'iu')
// The trigger is the derivation form or a bare limit (「250字以内で。」 is a brevity request).
const JA_CHAR_TRIGGER = new RegExp(String.raw`${JA_CHAR_LIMIT_SOURCE}|${JA_NO_OBJECT}(?<![\d０-９.．])[\d０-９]+\s*(?:文字|字)\s*(?:以内|程度|まで|くらい)${JA_NO_OBJECT_AFTER}`, 'iu')
// The reply word must stand within 24 characters before the bound; both word orders
// ("within 250 chars", "250 chars max") derive.
const EN_CHAR_LIMIT_SOURCE = String.raw`\b(?:answers?|responses?|repl(?:y|ies)|explanations?)\b[^.;,\n]{0,24}?${EN_NO_OBJECT}(?:(?:under|within|max|at most)\s+(?<![\d０-９.．])([\d０-９]+)\s*(?:chars?|characters?)|(?<![\d０-９.．])([\d０-９]+)\s*(?:chars?|characters?)\s*(?:max|at most))\b${EN_NO_MODIFIER_AFTER}`
const EN_CHAR_LIMIT = new RegExp(EN_CHAR_LIMIT_SOURCE, 'iu')
// The digit branch starts with a lookbehind rather than \b: \b never matches before a
// full-width digit such as ２５０. The bare branches refuse any object in the clause
// after the count (see JA_CHAR_OBJECT).
const EN_CHAR_TRIGGER = new RegExp(String.raw`${EN_CHAR_LIMIT_SOURCE}|${EN_NO_OBJECT}\b(?:under|within|max|at most)\s+(?<![\d０-９.．])[\d０-９]+\s*(?:chars?|characters?)\b${EN_NO_OBJECT_AFTER}|${EN_NO_OBJECT}(?<![\w０-９.．])[\d０-９]+\s*(?:chars?|characters?)\s*(?:max|at most)\b${EN_NO_OBJECT_AFTER}`, 'iu')
// The negated forms of a verb that would otherwise ask for fewer confirmations, plain
// and polite (「やめないで」「やめてほしくありません」「控えるべきではありません」「不要では
// なく」; fourth re-inspection of the catalog, H-1), shared by the quiet-confirmations
// trigger and its unless.
const JA_NEG_TAIL = String.raw`(?:な(?:い|く|かった)|ありません(?!か))`
// 「ないと」 after the bare verb is a condition only before a closed set of consequences
// (「省略しないと進まない」「やめないといけない」 ask to skip); any other continuation, a verb of
// thought, speech or promise (「やめないと約束して」), keeps the negation; the other negated
// forms keep the plain tail (ninth re-inspection, L-3; tenth, F-1; eleventh, M-2).
// The manner adverb 厳しく is not a consequence, and a verb of speech or thought before the
// consequence keeps the negation (「省かないと厳しく言われている」; thirteenth, M-1); the
// predicative 疲れる・しんどい・つらい are consequences (fourteenth, M-1).
const JA_BARE_NEG_TAIL = String.raw`(?:な(?:い(?!と(?:(?!言|思|伝え|約束|注意|頼|お願)[^。、]){0,6}?(?:いけ|だめ|ダメ|駄目|困|進ま|進め|回ら|動か|通ら|終わら|間に合わ|足り|まずい|NG|不安|心配|持た|やっていけ|始まら|ならな|なりません|かかる|かかり|遅|面倒|効率|無駄|むだ|疲れ|しんどい|つらい|きつい))|く|かった)|ありません(?!か))`
const JA_VERB_NEGATED = String.raw`(?:${JA_BARE_NEG_TAIL}|ません(?!か)|るな|(?<=[くぐすつぬぶむる])な(?=\s*(?:[。、！？]|$))|(?:せ)?ず(?:に)?|て(?:ほしく|もらいたく|いただきたく)は?${JA_NEG_TAIL}|ては(?:いけ|だめ|ダメ|駄目)|(?:では|じゃ|で)${JA_NEG_TAIL}|る?わけ(?:では|じゃ|で)${JA_NEG_TAIL}|る?べき(?:では|じゃ|で)${JA_NEG_TAIL}|たり(?:しない|しません)|(?:る)?(?:の|こと)(?:は|を)?(?:やめ|しないで|控え|禁止)|(?:は|を)(?:やめ|しないで|控え|禁止|厳禁|不可))`
// The negations that cancel an English request to correct typos, used before every verb
// of that unless (fourth re-inspection of the catalog, M-3).
const EN_NOT_BEFORE = String.raw`(?<!\b(?:not|never|never ever|don['’]t|don['’]t ever|do not|do not ever|don['’]t need to|do not need to|don['’]t have to|do not have to|needn['’]t|never need to|no need to|shouldn['’]t|should not)\s)`

const LANGUAGE_TRIGGERS = [
  ...right('ja', /(日本語|英語|私の言語)で(?:返|答|応答)/iu, /常に(日本語|英語)で(?:返|答|応答|話)|(?:返答|回答|応答)(?:は|を)(日本語|英語)/iu),
  ...right('en', /\b(?:respond|reply) in (Japanese|English)\b/iu, /\b(?:always )?answer in (Japanese|English)\b/iu),
]

const JA_PUBLISH_OBJECT = String.raw`(?:\bpush\b(?!\s*(?:通知|notifications?))|\b(?:PR|Issue)\b|プッシュ(?!\s*通知)|プルリク|リリース|外部公開|(?<!非)公開(?!鍵))`
const JA_PUBLISH_ASK = String.raw`(?:確認|承認|承諾|了承|許可|聞いて|聞く|尋ね|相談|同意|合図|ゴーサイン|(?:レビュー|査読)(?:を)?(?:もら|受け|依頼|を経|待|が入|し?て(?:もら|いただ|くれ))|(?<!(?:自分で|セルフ)(?:(?!てから|でから|ず|の(?:レビュー|査読)(?=が通|が済|が終わ|をもら|を受け|してもら))[^。、]){0,8})(?:レビュー|査読)(?:を)?(?:が通|を通|が済|が終わ|してから)|(?<!(?:テスト|CI|ビルド|チェック|lint)\s*の)(?:(?<![A-Za-z])OK(?![A-Za-z])|オーケー)\s*(?:をもら|を得|が出)|y\s*\/\s*n)`
// A person whose say-so gates publishing, in whatever words (「私がいいと言ってから」「本人の合図が
// あるまで」; tenth re-inspection of the matcher, M-A).
const JA_PERSON = String.raw`(?:私|僕|俺|自分|本人|わたし|ぼく|こちら|ユーザー|人間)`
// The adverbs, or the publishing act itself (「確認はpush後でいい」), that may stand between the
// particle and 後 in a put-off waiver (eighteenth, H-1; nineteenth re-inspection of the matcher, High-1).
const JA_PUTOFF_ADV = String.raw`(?:一旦|いったん|とりあえず|ひとまず|まず|もう少し|もう|また|もっと|全部|すべて|全て|基本的に|基本|原則|いつも|毎回|今は|今回は|当面|しばらく|なるべく|できれば|(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)(?:を(?:出し|作っ|作成し|立て|切っ)(?:た|て))?(?:作成|した|して)?の?)`
// A person's own branch, machine or repository right after の, or a state verb, is a state and
// not a say-so (「私のブランチにマージしてから」「こちらの環境でテストしてから」); what the person
// looks at before saying so is not (「私がコードを見てから」). The lookahead stops at てから/まで
// (eleventh re-inspection of the catalog, M-1; twelfth, 高-1).
// A state waives the say-so only when no say-so word stands between it and てから/まで (「私が
// テストしてOKを出すまで」「本人の手元でいいと言ってから」 keep the gate; thirteenth, H-2, L-1).
const JA_SAYSO = String.raw`(?:言|OK|オーケー|いい|よい|良い|合図|ゴーサイン|了解|了承|承認|確認|確かめ|納得|試し|許可|返事|判断|見て|見る|読ん|読む|目を通|(?<!(?:CI|lint|テスト|ビルド)\s*の)チェック|レビュー)`
const JA_STATE = String.raw`(?:(?:(?<=の)(?:ブランチ|環境|手元|PC|マシン|端末|リポジトリ|repo)|(?:(?!てから|でから|まで|${JA_SAYSO})[^。！？;；]){0,12}(?:マージ|デプロイ|テストし|テストが|ビルドし|ビルドが|CIが))(?:(?!てから|でから|まで|${JA_SAYSO})[^。！？;；]){0,24}(?:てから|でから|まで))`
const JA_PUBLISH_WAIVER = String.raw`(?:確認|承認|承諾|了承|許可|同意|合図|レビュー|査読|(?<![A-Za-z])OK(?![A-Za-z])|オーケー|ゴーサイン)(?:は|を|が)?\s*(?:不要|${JA_PUTOFF_ADV}?(?<=[はもを]${JA_PUTOFF_ADV}?)(?:後|あと)(?:で(?:も)?(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)|にして|回し|に回(?=[しすさせ]))|(?<!(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)\s*(?:[はをの]、?[^。！？;；、,]{0,16})?(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読|OK|オーケー))(?:後|あと)で(?:も)?(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)(?:ので|から)(?=[\s、,]*(?:先に|まず)[\s、,]*(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)(?:を|は|して|する|\s|$|[。、！？]))|しなくて(?:いい|よい)|しなくても(?:いい|よい)|なし(?:で|に)?|せず(?:に)?|しない(?:で)?|求めない)`
// After unless/until/before the gate stays by default: the condition is the person's say-so
// in whatever words ("until I'm happy with it", "unless it's OK with me", "until the reviewer
// signs off"). It is waived only when the condition names a CI, repository or calendar state
// and no person ("until the tests pass", "unless it's a fork", "before Friday"); a confirmation
// of such a state is not a person's ("the tests are confirmed green"). Ninth re-inspection of
// the catalog, H-3: the say-so predicates are an open set, the states a closed one.
const EN_PERSON_GATE = String.raw`I|me|my|mine|we|us|our|the user|someone|somebody|a human|the human|reviewers?|maintainers?|owners?|ask\w*|(?<!\b(?:tests?|build|CI|checks?|pipeline) (?:are|is|was|were|have been|has been|being) )confirm\w*|approv\w*|permission|consent|review\w*|sign(?:ed|s)?[- ]?off|go-ahead|green[- ]?light|nod|thumbs?[- ]?up|ok['’]?d|okay['’]?d|looks? good|lgtm|good to go|it['’]?s (?:ok|okay|fine|alright|good)|told|instructed|says? so|said so`
const EN_STATE = String.raw`tests?|test suite|builds?|CI|checks?|pipelines?|lint\w*|coverage|type-?checks?|migrations?|deploy\w*|releases?|versions?|tags?|branch\w*|main|master|prod\w*|staging|forks?|repos?|repositor\w*|remotes?|upstream|origin|passing|passes|merged|rebased|squashed|green(?![- ]?light)|it|it['’]s|they|they['’]re|this|that|everything|all|things|code|diffs?|changes?|commits?|work|features?|fix\w*|bugs?|tickets?|docs?|readme|changelog|notes?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|morning|noon|afternoon|evening|night|weekend|\d+`
const EN_PUBLISH_WAIVER = String.raw`\b(?:(?:do not(?: ever)?|don['’]t|never) (?:ask(?: me)?|confirm(?: with me)?|check with(?: me)?|get (?:my )?(?:ok|approval))(?: first)? before|(?:without|no) (?:asking|confirmation|permission|approval)(?: (?:needed|required))?)\b`

function publishWaiver() {
  // Consume the waiver's own words, but never an independent request or negation.
  // In particular, "without asking" cannot swallow "don't push" or "ask first".
  const waiver = String.raw`(?:${JA_PUBLISH_WAIVER}|${EN_PUBLISH_WAIVER})`
  const cancellation = String.raw`(?:${JA_PUBLISH_ASK}|ない|禁止|ダメ|だめ|な(?=[。！？.!?\s]|$)|\b(?:never|not|don['’]t|do not|no|ask(?:ing)?|check(?:ing)? with|confirm(?:ation)?|approval|permission|get (?:my )?(?:ok|approval))\b)`
  return new RegExp(String.raw`^(?=[\s\S]*${waiver})(?:${waiver}|(?!${cancellation})[\s\S])*$`, 'iu')
}

function rangeParams(hits) {
  for (const hit of hits) {
    const match = /(?<![0-9０-９.．])([2-9２-９])\s*[〜～~–-]\s*([2-9２-９])\s*(?:案|(?:options?|alternatives|choices)\b)/iu.exec(hit.text)
    if (!match) continue
    const min = Number(match[1].normalize('NFKC'))
    const max = Number(match[2].normalize('NFKC'))
    if (min <= max) return { min, max }
  }
  return {}
}

function languageParams(hits, profile) {
  for (const hit of hits) {
    for (const { lang, pattern } of LANGUAGE_TRIGGERS) {
      if (lang !== profile.language) continue
      const match = pattern.exec(hit.matched ?? hit.text)
      const requested = match?.slice(1).find(Boolean)
      if (!requested) continue
      if (requested === '私の言語') return { language: profile.language }
      return { language: /^(?:日本語|Japanese)$/iu.test(requested) ? 'ja' : 'en' }
    }
  }
  return {}
}

const conciseEvidence = () => [
  { kind: 'prior-art', ref: 'ayghri/i-have-adhd', note: 'Prior art for answer-first responses and small next actions.' },
  { kind: 'research', ref: 'arXiv:2605.23135', note: 'Vella & Blincoe longitudinal study; background, not a test of this mod.' },
]

/** The six emitter templates, in their frozen order. @type {string[]} */
export const TEMPLATE_KEYS = [
  'compose-rule', 'submit-detector', 'publish-guard', 'running-indicator', 'resume-brief', 'focus-timer',
]

/** The 17 recipes in DESIGN §6 order; all injected text is authored here. */
export const RECIPES = [
  recipe({
    id: 'lead-with-answer',
    title: labels('結論を先に', 'Lead with the answer'),
    summary: labels('結論から始め、必要な説明を短くまとめます。', 'Start with the answer and keep the necessary explanation brief.'),
    sections: ['style', 'care'],
    triggers: [
      ...right('ja', /(?:結論|要点)(?:を|は)?(?:先|最初)|結論から|要点先行/iu, /簡潔|短く(?:答|まと|返|書)/iu, JA_CHAR_TRIGGER),
      ...right('en', /\b(?:answer|bottom line) first\b/iu, /\b(?:concise|brief|keep it short|TL;DR)\b/iu, EN_CHAR_TRIGGER),
    ],
    // Requests not to shorten or rush an answer are the opposite preference.
    unless: [
      // The negated verb must follow 短く… within a few characters: Japanese has no word
      // spaces, so an open-ended gap would reach a later 「しないで」 (re-inspection, chunk B, M-2).
      // 「短く答えなくていい」「短くまとめようとしないで」 are the opposite request too
      // (second re-inspection of the catalog, L-b).
      ...unless('ja', /急がない|短くしないで|短く(?:答|まと|返|書)[^。！？、]{0,6}?(?:ない|なく(?:て|ても)|ず)|(?:簡潔|短く)(?:に|は)?(?:しない|しなくていい|不要)|(?:結論|要点)(?:を|は)?(?:先|最初)[^。！？]*(?:出さない|置かない|しない|不要)/iu, /(?<![\d０-９.．])[\d０-９]+\s*(?:文字|字)以上/iu),
      ...unless('en', /\b(?:not too (?:short|brief)|no TL;DR|(?:do not|don['’]t|never) (?:be (?:too )?(?:brief|concise)|keep it (?:short|brief)|(?:put (?:the )?)?(?:answer|bottom line) first))\b/iu, /\bat least [\d０-９]+ (?:chars?|characters?|words?|lines?)\b/iu),
    ],
    rule: { en: 'Lead with the answer. Keep explanations within {max_lines} lines{max_chars_clause}, unless the user asks for more detail or for complete code.' },
    mechanisms: ['prompt.compose', 'turn.complete', 'store'],
    params: {
      max_lines: numberParam(12, 3, 200, labels('最大行数', 'Maximum lines'), labels('長い回答として数える行数の上限です。', 'Line limit used to count long answers.')),
      max_chars: numberParam(0, 0, 20000, labels('最大文字数', 'Maximum characters'), labels('回答の文字数の上限です。0なら指定しません。', 'Response character limit; zero leaves it unset.')),
    },
    deriveParams(hits) {
      for (const hit of hits) {
        const text = hit.text.normalize('NFKC')
        if (!/回答|返答|答え|説明|\b(?:answers?|responses?|repl(?:y|ies))\b/iu.test(text)) continue
        const match = JA_CHAR_LIMIT.exec(text) ?? EN_CHAR_LIMIT.exec(text)
        if (match) return { max_chars: Number(match.slice(1).find(Boolean)) }
      }
      return {}
    },
    evidence: conciseEvidence(),
    metrics: ['long_answers'],
  }),
  recipe({
    id: 'accept-typos-as-intent',
    title: labels('誤字を意図として読む', 'Read past typos'),
    summary: labels('誤字や表記の違いを指摘せず、意図を読み取ります。', 'Read intended meaning without pointing out spelling differences.'),
    sections: ['style'],
    triggers: [
      ...right('ja', /誤字|表記揺れ/iu, /訂正しない|ローマ字|未変換/iu),
      ...right('en', /\b(?:typos?|misspell(?:ing|ings|ed)?|romaji)\b/iu, /\b(?:don['’]t|do not|never) correct\b/iu),
    ],
    // Explicit requests for corrections must not become a no-correction rule.
    unless: [
      // Only a negation right after the verb cancels the request (「指摘してほしくない」
      // 「教えてくれなくていい」); an unrelated 「ない」 later in the clause does not (chunk B,
      // MEDIUM-4; re-inspection, chunk B, L-1).
      ...unless('ja', /(?:訂正して(?:ほしい|ください)?|(?:誤字|表記揺れ|ローマ字)[^。！？]*(?:直して|修正して|教えて|知らせて)|(?:誤字|表記揺れ)[^。！？]*指摘して)(?!(?:ほしく)?ない|ないで|なくて|くれ(?:なくて|ない)|もらわ(?:なくて|ない))/iu),
      // "point them out" counts only when the clause is about typos (re-inspection, chunk B, L-1).
      ...unless('en', new RegExp(String.raw`${EN_NOT_BEFORE}\b(?:(?:fix|correct|point out|flag|tell me about|catch) (?:my |the )?(?:typos?|spelling|misspellings?)|(?:typos?|spelling|misspellings?)\b[^.,!?]*${EN_NOT_BEFORE}\bpoint (?:them|it) out|let me know about (?:my )?typos|correct me when I misspell)\b`, 'iu')),
    ],
    rule: { en: 'Treat typos, inconsistent spelling and unconverted romaji as the intended text. Do not point them out or correct them.' },
  }),
  recipe({
    id: 'response-language',
    title: labels('返答する言語', 'Response language'),
    summary: labels('指定された言語で返答します。', 'Respond in the requested language.'),
    sections: ['style', 'boundaries'],
    triggers: LANGUAGE_TRIGGERS,
    // A language explicitly rejected by the line is not a requested language.
    unless: [
      ...unless('ja', /(?:日本語|英語)で(?:は)?(?:返|答|応答)[^。！？]*(?:ない|不要)|(?:日本語|英語)(?:での)?(?:返答|回答|応答)(?:は)?不要/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:always )?(?:respond|reply|answer) in\b/iu, /\b(?:stop|avoid) (?:responding|replying|answering) in\b/iu),
    ],
    // The emitter fills {language} with the name Japanese / English, not a code.
    rule: { en: 'Respond in {language} unless the user explicitly requests another language for the current task.' },
    params: {
      language: {
        type: 'string', default: 'en', options: ['ja', 'en'],
        title: labels('言語', 'Language'),
        description: labels('返答には日本語か英語を使います。', 'Use Japanese or English for responses.'),
      },
    },
    deriveParams: languageParams,
  }),
  recipe({
    id: 'one-next-step',
    title: labels('次の一手を一つ', 'One next step'),
    summary: labels('大きな作業を分け、最後に具体的な次の一手を一つ示します。', 'Split large tasks and finish with one concrete next action.'),
    sections: ['style', 'care', 'weak'],
    triggers: [
      ...right('ja', /次の一手|一つずつ|ひとつずつ/iu, /小さく分け|最初の一歩/iu),
      ...right('en', /\b(?:one next step|one thing at a time|smallest next action)\b/iu, /\b(?:break it down|first small step)\b/iu),
    ],
    // Do not turn a request for the whole task into forced single-step work.
    unless: [
      ...unless('ja', /一つずつ(?:は|に)?(?:しない|不要|やめ)|次の一手(?:だけ|のみ)?(?:は|に)?(?:不要|絞らない)|小さく分け(?:ない|なくて)/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:break it down|give (?:me )?(?:just )?one next step|work (?:on )?one thing at a time)\b/iu, /\b(?:not|avoid) (?:just )?(?:one next step|one thing at a time)\b/iu),
    ],
    rule: { en: 'Break large tasks into small, concrete actions. End with exactly one next action the user can take, unless the user signals a stop or sends a short state fragment.' },
    evidence: conciseEvidence(),
  }),
  recipe({
    id: 'receive-only-fragments',
    title: labels('短い言葉を受け取る', 'Acknowledge short fragments'),
    summary: labels('指定の短い言葉だけの入力には、助言せず短く応じます。', 'Briefly acknowledge a configured short utterance without advice.'),
    sections: ['boundaries', 'care'],
    triggers: [
      ...right('ja', /(?:まず|ただ)受け取(?:る|って)|受け取るだけ/iu, /短文断片|押し返さ/iu),
      ...right('en', /\b(?:just acknowledge|(?:just )?receive it(?: and| without))\b/iu, /\b(?:no advice when I say|don['’]t push back)\b/iu),
    ],
    // A request for advice or pushback must not be reduced to acknowledgement.
    unless: [
      ...unless('ja', /受け取るだけ(?:は|で)?(?:不要|やめ|にしない)|受け取(?:って|ら)ない|短文断片[^。！？]*(?:助言して|提案して)|押し返して/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:just acknowledge|(?:(?:just|only) )?receive it)\b/iu, /\b(?:give (?:me )?advice|push back) when I say\b/iu),
    ],
    template: 'submit-detector',
    mechanisms: ['prompt.submit', 'store'],
    note: { en: 'Acknowledge this short fragment briefly without advice, questions, or pushback.' },
    params: {
      max_chars: numberParam(24, 4, 80, labels('短文の上限', 'Fragment length limit'), labels('この文字数までの入力を対象にします。', 'Detect only inputs up to this character count.')),
      phrases: phrasesParam(['眠い', '疲れた', '落ち込んでる', 'つらい', 'しんどい', 'tired', 'exhausted', 'feeling down'], labels('受け取る言葉', 'Acknowledgement phrases'), labels('入力全体に一致する言葉です。末尾の句読点・空白と6文字までの短い語尾を許容します。', 'Match a whole utterance, allowing only trailing punctuation, whitespace and up to six characters of Japanese particles.')),
    },
    metrics: ['detected'],
  }),
  recipe({
    id: 'respect-stop-signals',
    title: labels('やめる合図を尊重', 'Respect stop signals'),
    summary: labels('やめる合図に短く応じ、次の作業や質問を重ねずに終えます。', 'Acknowledge a stop signal and end without another task or question.'),
    sections: ['boundaries', 'care'],
    triggers: [
      // 「出したら」 needs the signal noun (「あとで出したら見て」 is an ordinary instruction);
      // 「って」 is a quoting particle too (re-inspection, chunk B, L-4).
      // 「あとで」 is also an ordinary adverb (「あとでいったら」「あとで打ったら教えて」), so
      // it needs a closing quote or と/って before the signal verb (second re-inspection, L-d).
      ...right('ja', /(?:一旦やめる|終わり|おわり|一旦ここまで)[」』”"'\s]*(?:を|と|って|の)?\s*(?:シグナル|合図|(?:言|い)ったら|打ったら)|あとで(?:[」』”"']\s*(?:を|と|って|の)?|\s*(?:と|って))\s*(?:シグナル|合図|(?:言|い)ったら|打ったら)|(?:一旦やめる|あとで|終わり|おわり|一旦ここまで)[」』”"'\s]*(?:の|という|って)?\s*(?:シグナル|合図)(?:を)?(?:出したら|送ったら)/iu, /立ち止まり|距離を取/iu),
      ...right('en', /\b(?:stop for now|that['’]s enough)\b/iu, /\b(?:let['’]s stop|wrap up for (?:now|today)|(?:say|type) ["“‘']wrap up(?=["”’']))\b/iu),
    ],
    // Text-processing terms, timer controls, and requests to continue are not stop signals.
    unless: [
      ...unless('ja', /ストップワード|(?:タイマー|時計)(?:を|の)?(?:一時停止|止め|停止)|(?:終わり|一旦やめる|あとで)[^。！？]*(?:続けて|止めない)/iu),
      ...unless('en', /\b(?:stop words?|pause (?:the |my )?timer)\b/iu, /\b(?:do not|don['’]t|never) (?:pause|wrap up|stop for now)\b/iu),
    ],
    template: 'submit-detector',
    mechanisms: ['prompt.submit', 'store'],
    note: { en: 'Acknowledge the stop signal and end the exchange without advice, follow-up questions, or another task.' },
    params: {
      phrases: phrasesParam(['一旦やめる', 'あとで', '終わり', 'おわり', '一旦ここまで', 'stop for now', "that's enough", "let's stop", 'wrap up'], labels('やめる合図', 'Stop phrases'), labels('入力全体への一致を短文への応答より優先します。末尾の句読点・空白と6文字までの短い語尾を許容します。', 'Match a whole utterance with only trailing punctuation, whitespace and up to six characters of Japanese particles, ahead of fragment acknowledgement.')),
    },
    metrics: ['detected'],
  }),
  recipe({
    id: 'no-psych-framing',
    title: labels('言葉どおりの配慮', 'Follow stated preferences'),
    summary: labels('内面を解釈せず、書かれた作業上の希望に沿います。', 'Follow stated working preferences without interpreting the person.'),
    sections: ['boundaries', 'care'],
    triggers: [
      ...right('ja', /心理学的(?:な)?フレーミング|問診/iu, /心理学的に解釈|臨床的(?:な)?助言は不要/iu),
      ...right('en', /\b(?:psychological framing|psychoanaly[sz]e)\b/iu, /\b(?:no medical questions|not my therapist)\b/iu),
    ],
    // Requests to use an interpretive framing are not requests to avoid it.
    unless: [
      ...unless('ja', /(?:心理学的(?:な)?フレーミング|問診|心理学的に解釈)[^。！？]*(?:してほしい|してください|使って|歓迎|必要です)(?![^。！？]*ない)/iu),
      ...unless('en', /\b(?:please (?:use |do )?|do |I (?:want|welcome) )(?:psychological framing|psychoanaly[sz]e|medical questions)\b/iu, /^(?:use psychological framing|psychoanaly[sz]e (?:me|my))\b/iu),
    ],
    rule: { en: "Follow the user's stated working preferences. Avoid psychological interpretations, personal assessments, and unsolicited medical questions." },
  }),
  recipe({
    id: 'publish-guard',
    title: labels('公開前に確認', 'Ask before publishing'),
    summary: labels('対象のBash公開コマンドを期限付き許可まで止めますが、Bash以外のツールや内部でpushするスクリプトは保護できません。', 'Block matching Bash publish commands until a timed grant is set; other tools and scripts that publish internally are outside this guard.'),
    sections: ['boundaries', 'care'],
    priority: 'safety',
    triggers: [
      // Qualifiers such as 非公開 and 公開鍵 exclude only that object, not a later push.
      ...right('ja',
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}[^。！？;；]*前[^。！？;；]*${JA_PUBLISH_ASK}`, 'iu'),
        // 後に・後で・あとで link too (「確認後にpushして」「許可をもらった後でpushして」), unless what follows
        // 後 puts the confirmation off (「後にして」「後でもいいので」「後でいい」, read before に/で is
        // consumed): those are waivers (fourteenth, H-A; fifteenth, H-1; sixteenth; seventeenth, H-2).
        new RegExp(String.raw`${JA_PUBLISH_ASK}[^。！？;；]*(?:前|から|(?<![はもを]${JA_PUTOFF_ADV}?)(?:後|あと)(?!で(?:も)?(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)(?:ので|から)[\s、,]*(?:先に|まず)[\s、,]*(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)(?:を|は|して|する|\s|$|[。、！？]))(?:に|で)|(?<=[はもを]${JA_PUTOFF_ADV}?)(?:後|あと)(?!にして|に回|で\s*(?:も(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)|いい|よい|良い|OK|構わない|かまわない|大丈夫|、|取|もら|済ま|す(?:る|ま)|や(?:る|っ)|回))(?:に|で))[^。！？;；]*${JA_PUBLISH_OBJECT}`, 'iu'),
        // 「レビュー後にpushして」 has its own form, the review ask words needing a suffix (thirteenth, H-1).
        new RegExp(String.raw`(?<!(?:自分で|セルフ)(?:(?!てから|でから|ず|もら|いただ|の(?:レビュー|査読)(?=が通|が済|が終わ|をもら|を受け|してもら))[^。、]){0,8})(?:レビュー|査読)(?:の)?後(?:に|で)?[^。！？;；]*${JA_PUBLISH_OBJECT}|${JA_PUBLISH_OBJECT}[^。！？;；]*(?<!(?:自分で|セルフ)(?:(?!てから|でから|ず|もら|いただ|の(?:レビュー|査読)(?=が通|が済|が終わ|をもら|を受け|してもら))[^。、]){0,8})(?:レビュー|査読)(?:の)?後(?:に|で|なら)`, 'iu'),
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}[^。！？;；]*${JA_PUBLISH_ASK}[^。！？;；]*から`, 'iu'),
        // 「pushは確認後にして」「公開は承認後でもいい」 ask first (seventeenth re-inspection of the matcher, HIGH-1).
        // A bare OK before 後 is the person's OK (「pushはOKの後で」; second confirmation, 低-E).
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}\s*(?:は|を|の)?\s*(?:${JA_PUBLISH_ASK}|(?<![A-Za-z])OK(?![A-Za-z])|オーケー)(?:して|を得て|をもら|を求め|が必要|(?:の)?後(?:に|で|なら))`, 'iu'),
        // 「レビューはPRを作った後にして、pushはその後で」: the publishing comes after that (twenty-first
        // re-inspection of the matcher, Medium-2).
        // The clause that was put off is blanked before the matcher reads this form, so it cannot look
        // back at it; instead a strong permission after その後で (「自由にして」「任せる」) says it is no gate,
        // while 「その後でいい」 accepts the order and keeps the gate (confirmation rounds, 中1, 高-A).
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}\s*(?:は|を)?\s*(?:その|それの)(?:後|あと)(?:で|に)(?![^。！？;；、,]{0,8}(?:自由|好きに|勝手に|任せ))`, 'iu'),
        // 「pushはテストも確認も終わった後にして」: the ask word, a verb, then 後 not put off (eighteenth, H-1).
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}[^。！？;；]*(?:${JA_PUBLISH_ASK}|(?<![A-Za-z])OK(?![A-Za-z])|オーケー)(?:(?!後|あと)[^。！？;；]){0,24}(?<![はもを]${JA_PUTOFF_ADV}?)(?:後|あと)(?:に|で|なら)`, 'iu'),
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}[^。！？;；]*${JA_PERSON}(?:が|の|に)(?!${JA_STATE})[^。！？;；]{0,24}(?:てから|でから|後に|後で|あとで|あとに|まで(?:は)?[^。！？;；]{0,6}(?:待|しない|だめ|ダメ|禁止|NG)|を待)`, 'iu'),
        new RegExp(String.raw`${JA_PERSON}(?:が|の|に)(?!${JA_STATE})[^。！？;；]{0,24}(?:てから|でから|まで(?:は)?)[^。！？;；]*${JA_PUBLISH_OBJECT}`, 'iu'),
        new RegExp(String.raw`${JA_PUBLISH_OBJECT}[^。！？;；]*${JA_PUBLISH_WAIVER}|${JA_PUBLISH_WAIVER}[^。！？;；]*${JA_PUBLISH_OBJECT}`, 'iu')),
      // "push notifications" (also "pushing notifications", "push-notification") is
      // excluded after the verb's suffix, in every trigger, and the ask word of the
      // either-side form must sit in the same sentence (re-inspection, chunk B, M-1).
      ...right('en',
        /\bbefore (?:you )?(?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b/iu,
        /\b(?:ask|check with|confirm with|get (?:my )?(?:ok|approval))(?: me)?(?: first)? before\b[^.!?]*\b(?:push(?:ing|es)?(?![\s-]*notifications?)|publish(?:ing|es)?|(?:creat(?:e|ing)|open(?:ing)?) (?:an? )?(?:PRs?|issues?|releases?))\b/iu,
        // "without" must be followed by an asking word: "never push to main without
        // running the tests" is a workflow rule, not a gate (second re-inspection, L-f).
        // "my" and "me" count only next to an approval word ("without running my tests"
        // is a workflow rule; fourth re-inspection of the catalog, M-2).
        /\b(?:never|don['’]t|do not) (?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b[^.!?;]*\bwithout\b(?=[^.!?;]{0,30}\b(?:ask(?:ing)?(?: me)?|(?<!\b(?:tests?|build|CI|checks?|pipeline) (?:are|is|was|were|have been|has been|being) )confirm\w*|approv\w*|permission|consent|(?:an? )?(?:ok|okay|go-ahead|sign-?off)|(?:let(?:ting)? me|my) (?:review\w*|ok|okay|approval|go-ahead|sign-?off|consent|permission)|me (?:review\w*|check\w*|sign\w* off|look\w* at|see\w*)|(?:let(?:ting)? me|show(?:ing)? me)|(?:an? )?(?:review|look) from me|check(?:ing)? with me|telling me|confirm\w* (?:with|by) (?:me|the user))\b)/iu,
        // "unless asked", "until I've confirmed", "until you hear from me", "until I'm happy
        // with it" (fifth to ninth re-inspections): the gate stays by default and is waived only
        // for a CI, repository or calendar state with no person (EN_PERSON_GATE, EN_STATE).
        new RegExp(String.raw`\b(?:never|don['’]t|do not) (?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b[^.!?;]*\b(?:unless|until|before)\b(?=[^.!?;,]{0,200}?\b(?:${EN_PERSON_GATE})\b|(?![^.!?;,]{0,40}?\b(?:${EN_STATE})\b))`, 'iu'),
        // "Without asking, never push" / "never push ... without asking": the ask word may
        // stand on either side (chunk D, H1).
        // "confirm" counts as a person's confirmation, not a CI state ("confirmed green").
        /\b(?:ask(?:ing)?|confirm(?:ation| (?:with|first|before))|(?:I|you|we|the user) (?:have |has )?confirm\w*|confirm\w* (?:with|by) (?:me|the user)|approv\w*|permission|consent)\b[^.!?;]*\b(?:never|don['’]t|do not) (?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b|\b(?:never|don['’]t|do not) (?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b[^.!?;]*\b(?:ask(?:ing)?|confirm(?:ation| (?:with|first|before))|(?:I|you|we|the user) (?:have |has )?confirm\w*|confirm\w* (?:with|by) (?:me|the user)|approv\w*|permission|consent)\b/iu,
        /\b(?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b[^.!?;]*\b(?:without|with no) (?:asking|confirmation|permission|approval)\b/iu,
        /\bno (?:confirmation|permission|approval) (?:needed|required) (?:before|for) (?:you )?(?:push|publish)(?:ing|es)?(?![\s-]*notifications?)\b/iu),
    ],
    // Waivers are judged by the matcher (publishPolarity): a line opts out only when it
    // grants explicit permission and carries no prohibition; "push notifications" is
    // excluded at the object level above, never the whole line (chunk B, HIGH-1/2).
    unless: [],
    template: 'publish-guard',
    mechanisms: ['tool.call', 'command', 'store'],
    params: {
      allow_minutes: numberParam(30, 1, 720, labels('許可する時間', 'Grant duration'), labels('本人が許可したあとに公開できる分数です。', 'Minutes a publishing grant remains valid.')),
      patterns: phrasesParam([
        String.raw`\bgit\s+(-C\s+\S+\s+)?push\b`,
        String.raw`\bgh\s+(pr|issue)\s+create\b`,
        String.raw`\bgh\s+repo\s+(create|edit|delete)\b`,
        String.raw`\bgh\s+release\s+create\b`,
        String.raw`\bnpm\s+publish\b`,
      ], labels('確認するコマンド', 'Guarded command patterns'), labels('Bashコマンドを調べる正規表現です。', 'Regular expressions checked against Bash commands.')),
    },
    evidence: [{ kind: 'author', ref: "author's kokoro.md y/n gate", note: 'The explicit publishing gate motivates this recipe; protection covers matching Bash commands only.' }],
    metrics: ['denied', 'allowed'],
  }),
  recipe({
    id: 'quiet-confirmations',
    title: labels('必要な確認だけ', 'Keep confirmations focused'),
    summary: labels('必要な確認を保ち、日常の作業で確認を繰り返しません。', 'Avoid repeated routine confirmations while keeping the stated gates.'),
    sections: ['care', 'style'],
    triggers: [
      // Avoid-cell wording names the repetition this recipe removes.
      { lang: 'ja', pattern: /過剰確認|念のため確認/iu, cell: 'left' },
      { lang: 'en', pattern: /\bover-confirm(?:ation|ing)?\b/iu, cell: 'left' },
      ...right('ja', /確認せず(?:に)?(?:即|実行)|即実行|都度確認不要/iu,
        // In a bullet the avoid wording must carry its own verb (the left-cell triggers
        // above read table rows only; final inspection, chunk B, MEDIUM-7), and that verb
        // must not itself be negated (「やめないで」「減らしたりしないで」; re-inspection,
        // chunk B, H-1).
        // The negation must follow the verb directly: 「やめないで」「減らしたりしないで」 are
        // refused, 「やめて構わない」「控えてもらえませんか」 are requests (second
        // re-inspection of the catalog, M-b).
        new RegExp(String.raw`(?:過剰確認|念のため確認|確認(?:の)?質問)[^。！？]*(?:やめ|不要|いらない|要らない|控え|しないで|減らし|減らさ|減らす(?!と(?!(?:助か|うれし|嬉し|ありがた|(?:いい|良い)(?!と(?:まで)?は[^。、]{0,6}(?:思|考|言|限ら)[^。、]{0,4}?(?:ない|ません))))|か)|省[きかいく]|省略)(?!${JA_VERB_NEGATED}|(?:だ)?と(?:まで)?は[^。、]{0,6}(?:思|考|言|限ら)[^。、]{0,4}?(?:ない|ません))`, 'iu')),
      ...right('en', /\b(?:don['’]t ask for confirmation|do not ask for confirmation|just do it)\b/iu, /\b(?:stop checking in|no confirmation (?:needed|required) for (?:edits|routine work))\b/iu,
        // "Never skip the confirmation", "never just skip" are the opposite request
        // (re-inspection, chunk B, H-1; second re-inspection, L-a).
        /(?<!\b(?:never|not|don['’]t|do not)(?:\s+(?:ever|just|simply))?\s)\b(?:stop|avoid|skip|drop|no more) (?:(?:the |these )?(?:routine |extra |unnecessary )?confirmations?|over-confirm\w*|checking in)\b|\bdon['’]t over-confirm\b/iu),
    ],
    // Requiring repeated confirmation is the opposite of reducing it. The negated verb
    // forms are immediate, so 「やめて構わない」 and "don't keep asking" stay requests.
    unless: [
      // The negated verb must share its clause with the confirmation word (「やめて、テストは
      // 省かないで」 keeps the request; fifth re-inspection, M3), and a quoted doubt
      // (「不要だとは思いません」) cancels too (M2).
      // A negated verb in a concessive follow-up clause (「不要だと言われても、やめないで」) cancels
      // too (sixth re-inspection, M-1), as does a doubted 不要 in any verb form (M-2).
      // The concessive follow-up (「不要だと言われても、やめないで」) may not switch to another
      // topic (「…ほしいけど、テストは省かないで」; seventh re-inspection, M-a).
      ...unless('ja', new RegExp(String.raw`都度確認(?:して|が必要)|毎回確認|(?:過剰確認|念のため確認)(?:も|は|が)?(?:必要|してほしい|してください)|確認せず(?:に)?(?:即|実行)[^。！？]*(?:しない|やめ)|(?:過剰確認|念のため確認|確認(?:の)?質問|確認)[^。！？、]*(?:(?:やめ|控え|減らし|減らさ|減らしたり|減らす|省[きかいく]|省略(?:する|し|せ)?|なくす|なくし|不要|控える)${JA_VERB_NEGATED}|不要(?:だ)?とは[^。、]{0,6}(?:思|考|言)[^。、]{0,4}?(?:ない|ません))|(?:過剰確認|念のため確認|確認(?:の)?質問|確認)[^。！？]*(?:ても|けど|けれど|のに|が(?=、))、?\s*(?:(?:確認|それ)(?:は|を|の質問は)?)?(?:やめ|控え|減らさ|減らし|減らす|省[きかいく]|省略(?:する|し|せ)?|なくす|なくし)${JA_VERB_NEGATED}`, 'iu')),
      ...unless('en', /\b(?:do not|don['’]t|never)(?:\s+(?:ever|just|simply))? (?:just do it|stop checking in)\b|(?<!\b(?:don['’]t|do not|never|stop)\s)\b(?:keep|continue) (?:over-confirming|checking in|confirming|asking)\b|\b(?:always ask|ask every time|confirmation is required)\b|\b(?:never|do not|don['’]t)(?:\s+(?:ever|just|simply))? (?:skip|stop|avoid|drop|remove)\b[^.!?]*\bconfirm/iu),
    ],
    rule: { en: "Carry out routine, reversible work without repeated confirmation. Keep confirmation gates for publishing (push, PR, issue, release), deleting files or data, payments, and anything the user's manual lists." },
  }),
  recipe({
    id: 'offer-options',
    title: labels('選択肢を比べる', 'Compare options'),
    summary: labels('複数の選択肢と違いを示してから、おすすめを伝えます。', 'Compare several options before recommending a choice.'),
    sections: ['decision', 'style'],
    triggers: [
      ...right('ja', /(?<![0-9０-９.．])[2-9２-９]\s*[〜～~–-]\s*[2-9２-９]\s*案|複数案/iu, /並列で[^。！？]*案|比較してから/iu),
      ...right('en', /\b(?:two|2|three|3) to (?:four|4|five|5) options\b/iu, /\b(?:give|offer|present|show|compare|list) (?:me )?(?:some )?(?:alternatives|options)\b/iu, /\b(?<![\d.])[2-9]\s*[〜～~–-]\s*[2-9]\s*(?:options?|alternatives|choices)\b/iu, /\bmore than one option\b/iu),
      { lang: 'ja', pattern: /一案だけ|一択/iu, cell: 'left' },
      { lang: 'en', pattern: /\b(?:only one option|a single option)\b/iu, cell: 'left' },
    ],
    // A request for a single choice must not produce a menu of alternatives.
    unless: [
      ...unless('ja', /(?:複数案|[2-9２-９]\s*[〜～~–-]\s*[2-9２-９]\s*案)(?:は|を)?(?:不要|出さない|避け)|比較しない|一案(?:だけ|のみ)にして/iu),
      ...unless('en', /\b(?:(?:no|not) alternatives|(?:give|show|offer|present|want|need|prefer)(?: me)? (?:(?:(?:only|just|exactly) )?one option|a single option)|(?:do not|don['’]t|never) (?:give|offer|present|show|compare|list) (?:me )?(?:(?:some )?(?:alternatives|options)|more than one option))\b/iu),
    ],
    rule: { en: 'Offer {min} to {max} distinct options with concise trade-offs. Compare them before recommending a choice.' },
    params: {
      min: numberParam(2, 2, 4, labels('選択肢の最小数', 'Minimum options'), labels('少なくともこの数の案を示します。', 'Present at least this many options.')),
      max: numberParam(4, 2, 6, labels('選択肢の最大数', 'Maximum options'), labels('この数までの案を示します。', 'Present no more than this many options.')),
    },
    deriveParams: rangeParams,
  }),
  recipe({
    id: 'plain-language',
    title: labels('やさしい言葉', 'Plain language'),
    summary: labels('平易な言葉を使い、必要な専門用語は説明します。', 'Use plain language and explain necessary technical terms.'),
    sections: ['care', 'style'],
    triggers: [
      ...right('ja', /専門用語(?:を)?(?:避け|使わない|言い換え)/iu, /平易|やさしい言葉/iu),
      ...right('en', /\b(?:plain language|avoid jargon)\b/iu, /\b(?:explain (?:technical )?terms|(?:don['’]t|do not) use jargon)\b/iu),
    ],
    // Keeping jargon or declining explanations is not a plain-language request.
    unless: [
      ...unless('ja', /専門用語(?:を)?(?:避けない|使って)|平易(?:な言葉)?(?:に|は)?(?:しない|不要)|言い換え(?:ない|不要)/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:use plain language|avoid jargon|explain (?:technical )?terms)\b|\b(?:no plain language|use jargon instead)\b/iu),
    ],
    rule: { en: 'Use plain language and explain necessary technical terms when they first appear.' },
  }),
  recipe({
    id: 'expert-role-with-evidence',
    title: labels('根拠のある専門的な説明', 'Expert perspective with evidence'),
    summary: labels('求められた専門的な視点で、根拠と反証の条件を示します。', 'Use the requested expert perspective with evidence and ways to test claims.'),
    sections: ['style'],
    triggers: [
      ...right('ja', /専門家ロール|(?:博士|専門家)として/iu, /根拠[^。！？]*反証/iu),
      ...right('en', /\b(?:expert role|as a (?:physicist|professor|specialist))\b/iu, /\bevidence and falsifiability\b/iu),
    ],
    // Rejecting an expert role must not select that role.
    unless: [
      ...unless('ja', /専門家ロール(?:は|を)?(?:不要|使わない|避け)|(?:博士|専門家)として[^。！？]*(?:振る舞わない|答えない|話さない)|(?:根拠|反証)(?:は)?不要/iu),
      // "I'm a professor" is a self-description, not a role request (re-inspection, chunk B, L-2).
      ...unless('en', /\b(?:no expert role|(?:do not|don['’]t|never) (?:(?:use|adopt) an? expert role|act as a (?:physicist|professor|specialist)|(?:provide|use) evidence and falsifiability)|avoid (?:an? )?expert role)\b/iu, /\bI(?:\s+(?:work|am|was)|['’]m)\b(?:\s+as)?\s+an?\s+(?:physicist|professor|specialist)\b/iu),
    ],
    rule: { en: 'Use the requested expert perspective while stating evidence, uncertainty, and what could disprove each claim. Do not claim credentials or authority you do not have.' },
  }),
  recipe({
    id: 'trace-offers',
    title: labels('記録先を提案', 'Offer a place to record'),
    summary: labels('決定や進み具合を残す場所を提案します。', 'Suggest a concrete place to record decisions or progress.'),
    sections: ['style', 'care'],
    triggers: [
      ...right('ja', /痕跡を残す|(?:Issue|memory)\s*化/iu, /worklog|記録(?:に|を)残す提案/iu),
      ...right('en', /\b(?:suggest where to record|offer to file an issue)\b/iu, /\bleave a trace\b/iu),
    ],
    // Declining a record or the offer itself must not create an offer.
    unless: [
      ...unless('ja', /痕跡を残す(?:提案)?(?:は)?(?:不要|な)|(?:Issue|memory)\s*化(?:は|を)?(?:不要|しない)|worklog(?:は)?不要|記録(?:に|を)残す提案(?:は)?不要/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:suggest where to record|offer to file an issue|leave a trace)\b/iu),
    ],
    rule: { en: "Offer a concrete place to record decisions or progress, such as an issue, memory note, or worklog. Ask before recording when the user's stated gates require it." },
  }),
  recipe({
    id: 'running-indicator',
    title: labels('実行中を見えるように', 'Show ongoing work'),
    summary: labels('実行中の時間とツール数を表示し、長い処理を知らせます。', 'Show elapsed time and tool activity, with a notice for long turns.'),
    sections: ['weak', 'care'],
    triggers: [
      ...right('ja', /動いてるかどうか分からない|動いているか/iu, /バックグラウンド継続|(?:進み具合|進捗|状態)が不確実/iu),
      ...right('en', /\bcan['’]t tell (?:if|whether)\b[^.!?]*\b(?:running|working|still|progress)\b/iu, /\b(?:still running|background work|uncertainty about progress)\b/iu),
    ],
    // Declining progress displays or notices must not turn them on.
    unless: [
      ...unless('ja', /動いているか[^。！？]*(?:知らせない|表示不要|通知不要|確認不要)|(?:進捗|稼働)(?:の)?(?:表示|通知)(?:は)?不要/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:show|tell|notify|report|indicate|display|remind)\b[^.!?]*\b(?:still running|background work|progress)\b|\b(?:no|without) (?:running|progress) (?:indicator|updates|notifications)\b/iu),
    ],
    template: 'running-indicator',
    mechanisms: ['turn.start', 'tool.call', 'turn.complete', 'session.start', 'ui.status', 'ui.toast', 'clock', 'store'],
    params: {
      long_turn_seconds: numberParam(120, 10, 3600, labels('長い処理の秒数', 'Long-turn threshold'), labels('この秒数を超えたら知らせます。', 'Seconds before a long-turn notice.')),
    },
    evidence: [
      { kind: 'research', ref: 'arXiv:2609.21254', note: 'Copresence study; background for visible ongoing activity, not validation of this indicator.' },
      { kind: 'prior-art', ref: 'cogsync', note: 'Re-read on every switch motivates visible continuity without storing task text.' },
      { kind: 'prior-art', ref: 'shaheer-00/claude-adhd', note: 'Anti-nag rules motivate the shared toast cooldown.' },
    ],
    metrics: ['long_turns', 'suppressed'],
  }),
  recipe({
    id: 'block-ahead-warning',
    title: labels('止まりそうな手順を予告', 'Warn about upcoming gates'),
    summary: labels('認証や承認が必要な手順を、到達する前に伝えます。', 'Explain upcoming authentication and approval steps before reaching them.'),
    sections: ['weak', 'care'],
    triggers: [
      // A bare 失速 or 手数が増える counts only next to a gate word (「売上が失速」 is not an
      // access gate; re-inspection, chunk B, L-3).
      // 確認 alone is not a gate word (「売上を確認したら失速していた」; second re-inspection, L-c).
      ...right('ja', /(?:認証|\bPAT\b)[^。！？]*(?:煩雑|手数|失速|負担|面倒|止ま)/iu, /(?:承認ダイアログ|許可ダイアログ)[^。！？]*(?:煩雑|手数|失速|負担|面倒|止ま)/iu, /(?:認証|PAT|承認|許可|確認(?:ダイアログ|画面)|ダイアログ|ログイン|トークン(?:の)?(?:入力|発行|再発行|認証))[^。！？]*(?:手数が増え|失速)|(?:手数が増え|失速)[^。！？]*(?:認証|PAT|承認|許可|確認(?:ダイアログ|画面)|ダイアログ|ログイン|トークン(?:の)?(?:入力|発行|再発行|認証))/iu),
      ...right('en', /\b(?:auth prompts|permission dialogs)\b/iu, /\b(?:approval fatigue|too many prompts)\b/iu),
    ],
    // Mentioning an access gate while declining warnings must not enable warnings.
    unless: [
      ...unless('ja', /(?:認証|PAT|承認ダイアログ|手数が増える|失速)[^。！？]*(?:予告不要|事前警告不要|知らせない|予告しない)|(?:予告|事前警告)(?:は)?不要/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:warn|tell|notify|flag)\b[^.!?]*\b(?:auth prompts|permission dialogs|approval fatigue|too many prompts)\b|\bno (?:advance )?warning\b/iu),
    ],
    rule: { en: 'Flag upcoming authentication, access-token requests, and approval dialogs before reaching them. Explain the required steps early and group related requests when possible.' },
  }),
  recipe({
    id: 'session-resume-brief',
    title: labels('前回の日時と回数', 'Brief session history'),
    summary: labels('前回からの日数とターン数だけを、再開時に表示します。', 'On resuming, show only days since the last session and its turn count.'),
    sections: ['about', 'weak'],
    triggers: [
      ...right('ja', /(?:セッション|案件|プロジェクト|タスク|文脈)[^。！？]*(?:切替|切り替え|並行)/iu, /(?:前回|毎回|復帰)[^。！？]*読み直(?:し|す)/iu),
      ...right('en', /\b(?:several projects|context switch(?:es|ing)?)\b/iu, /\b(?:re-read (?:everything|where I was)|pick up where)\b/iu),
    ],
    // Requests not to keep or show session history must not enable a resume log.
    unless: [
      ...unless('ja', /(?:切替|切り替え|読み直(?:し|す)|複数(?:の)?プロジェクト)[^。！？]*(?:要約不要|記録不要|振り返り不要)|(?:再開時|切替時)(?:の)?(?:要約|記録|振り返り)(?:は)?不要/iu),
      ...unless('en', /\b(?:do not|don['’]t|never) (?:log|summari[sz]e|record|show|remind)\b[^.!?]*\b(?:context switch(?:es|ing)?|several projects|re-read|pick up where)\b|\bno (?:resume brief|session history|switch summary)\b/iu),
    ],
    template: 'resume-brief',
    mechanisms: ['turn.complete', 'session.start', 'ui.log', 'store'],
    evidence: [
      { kind: 'prior-art', ref: 'cogsync', note: 'Re-read on every switch is prior art; this recipe retains only time and turn counts.' },
      { kind: 'research', ref: 'arXiv:2609.21254', note: 'Copresence study provides context, not measured benefit for this metadata-only log.' },
    ],
    metrics: ['resumed'],
  }),
  recipe({
    id: 'focus-timer',
    title: labels('休憩の合図', 'Break reminder'),
    summary: labels('作業が進んだ区間だけ、設定した間隔で休憩を知らせます。', 'Offer timed break reminders only after activity since the previous tick.'),
    sections: ['weak', 'style', 'focus'],
    triggers: [
      ...right('ja', /休憩[^。！？]*(?:知らせ|促|リマインド|教え)/iu, /タイマー[^。！？]*(?:入れ|掛け|かけ|使)|時間を忘れ(?!ず)|過集中/iu),
      ...right('en', /\b(?:break reminders?|remind me to (?:take a )?break|hyperfocus)\b/iu, /\b(?:lose track of time|pomodoro)\b/iu),
    ],
    // Timer refusals and timer-stop commands are not requests for reminders.
    unless: [
      ...unless('ja', /リマインド(?:は)?不要|(?:休憩(?:の)?(?:通知|リマインド)?|タイマー)(?:は|が|を)?(?:不要|いらない|使わない)|休憩[^。！？]*(?:知らせない|促さない)|タイマー[^。！？]*(?:やめ|不要)/iu, /(?:話しかけ|割り込(?:ま)?|邪魔し)(?:ないで|ない)/iu),
      ...unless('en', /\b(?:no timer|(?:do not|don['’]t|never) remind|(?:I )?(?:do not|don['’]t) (?:need|want) (?:a |any )?(?:break reminders?|timer)|(?:disable|stop|pause) (?:the |my )?timer|no break reminders?)\b/iu, /\b(?:don['’]t|do not|never) (?:interrupt|disturb)\b/iu),
    ],
    template: 'focus-timer',
    mechanisms: ['session.start', 'turn.complete', 'clock', 'ui.toast', 'command', 'store'],
    params: {
      interval_minutes: numberParam(50, 5, 180, labels('休憩までの分数', 'Break interval'), labels('休憩を知らせる間隔を分で指定します。', 'Minutes between break reminders.')),
    },
    deriveParams(hits) {
      for (const hit of hits) {
        const text = hit.text.normalize('NFKC')
        if (!/休憩|タイマー|ポモドーロ|\b(?:break|remind|timer|pomodoro)\b/iu.test(text)) continue
        const match = /(?<![\d.])(\d+)\s*分\s*(?:ごと|おき|毎|間隔)|\bevery\s+(?<![\d.])(\d+)\s*min(?:ute)?s?\b|(?<![\d.])(\d+)\s*(?:時間|hours?\b)|タイマー(?:を)?\s*(?<![\d.])(\d+)\s*分(?:で|に)?(?:入れ|掛け|かけ|使)/iu.exec(text)
        if (match) return { interval_minutes: Number(match.slice(1).find(Boolean)) * (match[3] === undefined ? 1 : 60) }
      }
      return {}
    },
    evidence: [
      { kind: 'prior-art', ref: 'shaheer-00/claude-adhd', note: 'Anti-nag rules motivate bounded reminders and a shared cooldown.' },
      { kind: 'prior-art', ref: 'ravila4/claude-adhd-skills', note: 'Timed nudges are prior art; counts alone do not show whether a reminder helped.' },
    ],
    metrics: ['ticks', 'suppressed'],
  }),
]

/** Recipe ids in catalog order. @type {string[]} */
export const RECIPE_IDS = RECIPES.map(({ id }) => id)

/** Distinct countable event names, sorted for stable schema generation. @type {string[]} */
export const EVENT_NAMES = [...new Set(RECIPES.flatMap(({ metrics }) => metrics))].sort()

/** Look up a recipe by its frozen id; return undefined for an unknown id. */
export function getRecipe(id) {
  return RECIPES.find(recipe => recipe.id === id)
}
