import { basename } from 'node:path'
import { DEFAULT_MAX_ENABLED, PLUGIN_NAME_MAX_CHARS, PLUGIN_NAME_PATTERN, TOOL_NAME, TOOL_VERSION } from './constants.mjs'
import { RECIPES } from './catalog/index.mjs'

const CONFIDENCE = { low: 0, medium: 1, high: 2 }
const CANDIDATE_KINDS = new Set(['bullet', 'row', 'text'])

// Appendix A's English list, also recognizing its punctuation after slugging. The three
// abbreviations that are ordinary words or names (ADD, OD, DAN) are left out: a slug is
// lower-case, so they could only be rejected as words (final inspection, chunk D, L9).
const FORBIDDEN_SLUG_TERM = /(?<![a-z0-9])(?:ASD|HSP|IQ|ADHD|FSIQ|DSM|PTSD|ICD-?1[01]|F[0-9]{2}[.-][0-9A-Z]{1,4}|autism|autistic|dyslexia|dyslexic|bipolar|schizophrenia|schizophrenic|OCD|personality[\s-]+disorder|depressive[\s-]+disorder|major[\s-]+depression|anxiety[\s-]+disorder|panic[\s-]+disorder|eating[\s-]+disorder|asperger)(?![a-z0-9])/iu
// The longer terms are also refused inside a word ("adhdtools"); the three-letter ones
// are not, since they occur inside ordinary words (re-inspection, chunk D, L-1).
const FORBIDDEN_SLUG_SUBSTRING = /adhd|fsiq|ptsd|icd-?1[01]|f[0-9]{2}[.-][0-9a-z]{1,4}|autism|autistic|dyslexi|bipolar|schizophreni|asperger/iu

// The Japanese concessives けど・けれど・ですが・だが end a clause like "but" does, with or without
// a 、 (「レビューは後でいいけど公開は私がチェックしてから」; fifteenth re-inspection, High-1).
const JA_BUT = String.raw`けど|けれど(?:も)?|ですが|だが`
// Only these adverbs, or the publishing act itself (「確認はpush後でいい」「レビューはPRを出した後で
// いい」: the confirmation comes after publishing, so no gate before it), may stand between
// the particle and 後 in a put-off waiver (「確認は一旦後にして」); a verb of the confirmation
// there (「確認も終わった後にして」) asks first (eighteenth and nineteenth re-inspections, H-1).
const JA_PUTOFF_ADV = String.raw`(?:一旦|いったん|とりあえず|ひとまず|まず|もう少し|もう|また|もっと|全部|すべて|全て|基本的に|基本|原則|いつも|毎回|今は|今回は|当面|しばらく|なるべく|できれば|(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)(?:を(?:出し|作っ|作成し|立て|切っ)(?:た|て))?(?:作成|した|して)?の?)`
// A waiver's asking words cannot also be counted as a request for confirmation.
const PUBLISH_WAIVER = new RegExp([
  String.raw`(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読)(?:を)?(?:せず(?:に)?|なし(?:で|に)?|(?:(?:は|も|を)${JA_PUTOFF_ADV}?(?:後|あと)(?:で(?:も)?(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)|にして|回し|に回(?=[しすさせ]))|(?<!(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)\s*(?:[はをの]、?[^。！？;；、,]{0,16})?(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読))(?:後|あと)で(?:も)?(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)(?:ので|から)(?=[\s、,]*(?:先に|まず)[\s、,]*(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)(?:を|は|して|する|\s|$|[。、！？])))|しなくて(?:も)?(?:いい|よい|良い)|しない|(?:は|が)?(?:不要|必要(?:は|が)?ない|いらない))`,
  String.raw`\b(?:without|with\s+no)\s+(?:asking(?:\s+(?:me|us))?(?:\s+for\s+(?:confirmation|permission|approval|consent))?|(?:any\s+)?(?:confirmation|permission|approval|consent))\b`,
  String.raw`\bno\s+(?:confirmation|permission|approval|consent)(?:\s+(?:is\s+)?(?:needed|required|necessary))?\b`,
  String.raw`\b(?:confirmation|permission|approval|consent)\s+(?:is\s+)?(?:not\s+(?:needed|required|necessary)|unnecessary|optional)\b`,
  String.raw`\b(?:do\s+not|don['’]t|never|no\s+need\s+to|need\s+not|needn['’]t)\s+(?:ask(?:\s+(?:me|us))?(?:\s+for\s+(?:confirmation|permission|approval|consent))?|confirm|check\s+with\s+me|get\s+(?:my\s+)?(?:approval|permission|consent|ok))\b`,
  String.raw`\b(?:do\s+not|don['’]t)\s+(?:need|want)\s+(?:any\s+)?(?:confirmation|permission|approval|consent)\b`,
].join('|'), 'giu')
// Once a sentence's waiver clauses are blanked, what remains asks for the gate when it still
// matches one of the recipe's triggers and is more than a bare time clause, so no second
// asking vocabulary is kept here: 「pushは、私がいいと言ってから、イシューは確認なしで立てていい」
// and "Wait for my go-ahead before pushing, but you can open new issues without asking"
// keep their gate, "Before you push, push without asking." stays a waiver (tenth and
// eleventh re-inspections of the matcher).
const CLAUSE_PARTS = new RegExp(String.raw`([.!?;,\n。！？、;；—–()]|\b(?:but|however|and)\b|${JA_BUT})`, 'iu')
// The tight clause also ends at "and": an imperative or an explicit waiver must end it ("Just
// push without asking and I'll check it afterwards" is a waiver), the publishing object is
// looked for in it, and a first person beyond the "and" is not the waiver's habit; permission,
// question and reported speech keep the wider clause (fourteenth re-inspection, High-1, Low-1).
const CLAUSE_SPLIT_TIGHT = new RegExp(String.raw`[.!?;,\n。！？、;；—–()]|\b(?:but|however|and)\b|${JA_BUT}`, 'iu')
// A waiver that stands before "and" takes its publishing object from the clause the "and"
// opens when that clause is the order itself ("Don't ask me and just push.", "No confirmation
// needed and push freely."; fifteenth re-inspection, Medium-1).
// A noun phrase ("publishing notes is up to you") is not the order (sixteenth, low-2).
const AND_PUSH_CLAUSE = /^\s*and\s+((?:just\s+|simply\s+|then\s+|go\s+ahead\s+and\s+)?(?:push|publish)(?:ing\b(?!\s+(?:\w+\s+){1,3}(?:is|are)\s+(?:up\s+to|fine|ok|okay|optional|your|allowed|welcome)\b)|(?!ing\b)\w*\b)[^.!?;,]*)/iu
// でから is the voiced てから (「済んでから」), kept beside it in the catalog's say-so forms too.
const BARE_TIME_CLAUSE = /^(?:(?:before|after|when|once|until|unless|whenever)\s+(?:you\s+|we\s+|I\s+)?(?:push|publish)\w*|(?:push|プッシュ|公開|PR|プルリク|issues?|イシュー|リリース)(?:する|して|を出す|を出して|を作る|の)?(?:前に|前|後に|後|てから|でから|てからで|まで|の前|の後)?)$/iu
const CLAUSE_EDGE = /^[\s.!?;,。！？、;；—–()]+|[\s.!?;,。！？、;；—–()]+$/gu
// A Japanese order to publish after a 、 (「確認後でいいので、先にpushして」) lends its object the
// same way (twenty-first re-inspection of the catalog, 中1).
const JA_ORDER_CLAUSE = /^[\s、,]*((?:先に|まず|そのまま)?[\s、,]*(?:push|プッシュ|公開|publish|PR|プルリク|リリース|イシュー|issue)[^。！？]*)/u
function asksBeyondWaivers(sentence, triggers) {
  if (exec(PUBLISH_WAIVER, sentence) === null) return triggers.some(trigger => exec(trigger.pattern, sentence) !== null)
  // The waiver phrases are found on the whole sentence (a phrase may look past its clause,
  // 「確認後でいいので、先にpushして」), then the clause that holds each one is blanked.
  const starts = [...sentence.matchAll(new RegExp(PUBLISH_WAIVER.source, PUBLISH_WAIVER.flags))].map(found => found.index)
  let offset = 0
  const remainder = sentence.split(CLAUSE_PARTS).map(part => {
    const begin = offset
    offset += part.length
    return starts.some(start => start >= begin && start < begin + part.length) ? ' '.repeat(part.length) : part
  }).join('')
  const core = remainder.replace(CLAUSE_EDGE, '')
  if (core === '' || BARE_TIME_CLAUSE.test(core)) return false
  return triggers.some(trigger => exec(trigger.pattern, remainder) !== null)
}
// レビュー and 査読 are waiver words but not asking words here: 「PRのレビューは後で私がする」
// beside a waiver is not a request for the gate (twelfth re-inspection, M-1); the catalog's
// triggers (a review received or awaited) decide the asking side.
const PUBLISH_ASK = /確認|許可|承認|承諾|了承|同意|相談|尋ね|聞(?:い|く)|合図|ゴーサイン|OK(?:をもら|を得|が出)|\b(?:ask(?:ing|ed|s)?|confirm(?:s|ed|ing)?|check\s+with\s+me|(?:get|obtain|seek|request)\s+(?:my\s+)?(?:approval|permission|consent|ok)|(?:confirmation|permission|approval|consent)\s+(?:(?:is\s+)?(?:needed|required|necessary)|before))\b/iu
// The object a waiver must be about: a waiver in a clause that names no publishing
// action (「テストは確認なしで回してOK」) says nothing about the gate (re-inspection, chunk D, M-1).
// "issue" is a publishing object only as something filed (fourth re-inspection, Low-1).
// "open issues" is a noun phrase ("close open issues"), so "open" needs an article or "new".
const PUBLISH_OBJECT = /\bpush(?:es|ed|ing)?\b(?![\s-]*(?:通知|notifications?))|プッシュ(?!\s*通知)|(?<!非)公開(?!鍵)|\bpublish(?:ing|es)?\b|\bPRs?\b|プルリク|\b(?:open(?:ing)?\s+(?:an?\s+|the\s+|new\s+)(?:new\s+)?|(?:fil(?:e|es|ed|ing)|creat(?:e|es|ed|ing)|rais(?:e|es|ed|ing)|post\w*|submit\w*)\s+(?:an?\s+|the\s+)?(?:new\s+)?)issues?\b|(?:\bissues?|イシュー)\s*(?:化|作成|起票|を(?:出|投|開|立|作|切(?!り分)))|(?:\bissues?|イシュー)(?:は|も)[^。、！？]{0,12}?(?:立て|作(?:成|っ|り|る)|出し|起票|開(?:い|け|く)|投(?:げ|稿)|切(?:っ|る|り)(?!分))|リリース|\breleases?\b/iu
// A waiver (opting out of confirmation) is recognised only when its clause grants
// permission explicitly and its sentence carries no prohibition; everything else that
// mentions publishing together with asking or a negation is a request for the gate
// (DESIGN §5.4a; final inspection, chunks B and D). Being wrong here costs the person a
// safety mod, so the uncertain side falls towards proposing it.
// Bare 不要/要らない are not permission words here: 「確認なしのpushは不要」 refuses pushes
// (the prefixed forms 「確認は不要」 are explicit waivers below); OK needs ASCII bounds so
// "token" grants nothing (re-inspection, chunk D, M-2); 「勝手に」 is usually a complaint
// (「勝手にpushされるのがつらい」) and is not permission; "you can't" / "you may not" are
// not "you can" (second re-inspection of the matcher, F2 and F4).
// いい/よい count only as a predicate (「していい。」「いいです」), not inside かわいい or
// つよい (third re-inspection of the matcher, L2).
// 「〜ほうがいい」 is advice, not permission, and the common adjectives ending in いい are
// excluded by their stems (fourth re-inspection of the matcher, High-1, L2).
const PERMISSION = /(?<!(?:ほう|方)が)(?<!か[わゆ]|ちい|おお|つよ|よわ|きたな|うま|あつ|さむ|やす|わる|あたらし|ふる|かっこ|きもち|気持ち)(?:いい|よい|良い)(?=\s*(?:[。、！？]|$|と|です(?!か)|でしょ(?!うか)|よ|ね|んじゃ|わけ|ので|から|けど|けれど))|(?<![A-Za-z])(?:OK|ＯＫ)(?![A-Za-z])|構わない|かまわない|構いません|大丈夫|自由に|しなくて(?:も)?(?:いい|よい)|\b(?:fine|ok|okay|allowed|go ahead|feel free|you (?:can|may)(?!n['’]t|\s+not\b|not\b|\s+no longer\b)|not (?:needed|required|necessary)|unnecessary|optional|no need)\b/iu
// An imperative to publish without asking is itself the permission (「確認せずにpushする」,
// "Publish without confirmation."); it is read on the clause, must be the verb itself
// (a gerund subject, "Pushing without asking has burned me", is not an order) and must
// end the clause (re-inspection, chunk D, H-4).
// The plain form 「pushする」 is a habit as often as an order (「いつも確認せずにpushする。」),
// so only 「pushして(ください)」 is an imperative (second re-inspection of the matcher, F4).
// Both forms are anchored to the end of the trimmed clause (「pushしてよく事故る」 is not an
// order; third re-inspection of the matcher, H3).
// 「確認は後にしてpushして」「確認は後でいいので先にpushして」 put the confirmation off and order the
// push (sixteenth re-inspection of the catalog, High-1); the particle は/も is what puts it off,
// 「確認後にして」 asks for the confirmation first (seventeenth re-inspection of the matcher, HIGH-1).
const IMPERATIVE_WAIVER = new RegExp(String.raw`(?:せず|なし|(?<=(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読)(?:は|も|を)${JA_PUTOFF_ADV}?)(?:後|あと)(?:にして|回しで|回しにして|に回して|に回すので|で(?:も)?(?:いい|よい|OK)(?:ので|から))|(?<=(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読))(?:後|あと)で(?:も)?(?:いい|よい|OK)(?:ので|から)(?=[\s、,]*(?:先に|まず)))(?:に|で)?[\s、,]*(?:先に|まず|そのまま)?[\s、,]*(?:push|プッシュ|公開|publish)して(?:ください|ね|よ)?\s*[。！]?\s*$|^\s*(?:please\s+|just\s+|simply\s+)?(?:publish|push)\s+(?:it\s+)?(?:without|with\s+no)\s+(?:asking|confirmation|permission|approval)(?:\s+(?:me|first|please))?\s*[.!]?\s*$`, 'iu')
// A waiver phrase that states the opt-out itself as a predicate ("do not ask before",
// 「確認は不要」「pushは確認しない。」) needs no further permission word. It is tested on
// the clause, so the end-of-phrase lookahead sees the real next character: 「確認なしの
// push」 and 「確認せずにpushしてしまう」 are not predicates (re-inspection, chunk D, H-1).
// Each predicate must end its clause (「確認不要のpushが怖い」「確認せず pushして」 are not
// predicates), and the English forms must be complete ("no confirmation needed", "don't
// want confirmation"; "no confirmation broke prod" and "I don't want you to push" are not
// waivers) (second re-inspection of the matcher, F1 and F3).
// A question (「確認不要ですか？」) and 「だと」「だった」 are not predicates either (M1, M3).
const EXPLICIT_WAIVER = new RegExp(String.raw`(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読)(?:は|を|が|も)?\s*(?:不要|必要(?:は|が)?ない|いらない|要らない|しなくて(?:も)?(?:いい|よい|良い)|求めない|${JA_PUTOFF_ADV}?(?<=[はもを]${JA_PUTOFF_ADV}?)(?:後|あと)(?:で(?:も)?(?:いい|よい|良い|OK|構わない|かまわない|大丈夫)|にして|回し|に回(?=[しすさせ])))(?=\s*(?:[。、！]|$|です(?!か)|だ(?=\s*(?:[。、！]|$|よ|ね))|で(?:す(?!か)|いい|OK|構わない|\s*$)))|(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読)(?:は|を|が|も)?(?:し|せ)?(?:ない|ず)(?:で(?:も)?(?:いい|よい|良い))?(?=\s*(?:[。、！]|$))|(?:確認|許可|承認|承諾|了承|同意|合図|ゴーサイン|レビュー|査読)(?:は|が)?なし(?=\s*(?:[。、！]|$))|\b(?:do\s+not|don['’]t|never|no\s+need\s+to|need\s+not|needn['’]t)\s+(?:ask|confirm|check\s+with\s+me|get\s+(?:my\s+)?(?:approval|permission|consent|ok))\b|\bno\s+(?:confirmation|permission|approval|consent)\s+(?:is\s+)?(?:needed|required|necessary)\b|\b(?:confirmation|permission|approval|consent)\s+(?:is\s+)?(?:not\s+(?:needed|required|necessary)|unnecessary|optional)\b|\b(?:do\s+not|don['’]t)\s+(?:need|want)\s+(?:any\s+)?(?:confirmation|permission|approval|consent)\b`, 'iu')
// Prohibitions include a negated permission (「大丈夫じゃない」 "isn't ok"; re-inspection,
// chunk D, H-2) and are searched in the whole sentence, not the clause, so 「確認せずに
// pushするのは、絶対にやめて」 keeps its gate (H-3).
// Polite negations (「思いません」「ではありません」), an adverb between a negation and
// "ok" ("isn't really OK"), and a bare "don't" in the sentence are prohibitions too; the
// waiver phrases themselves are removed from the sentence before this test, so "don't
// ask, push" keeps its own "don't ask" (third re-inspection of the matcher, H1, H2, M2).
// Advice against (「しない方がいい」「避けたほうがいい」), outer negations ("nobody said",
// 「なんてことはない」), "no longer", and up to two adverbs of any kind between a negation
// and its word are prohibitions too (fourth re-inspection of the matcher, High-1, High-2, Medium-2).
// A negated put-off (「後回しにしなくていい」「後に回さなくていい」) keeps the confirmation; it is read on
// the raw sentence, since the put-off itself is blanked as a waiver phrase (twenty-first
// re-inspection of the matcher, Medium-1).
// Colloquial forms without に or with は/も count (「後回ししなくていい」「後回しにはしなくていい」), the
// hiragana あと and the potential (「後回しにできない」「後に回せない」) too, and all of them only after
// an ask word and its particle, so 「バグは後回しせず」 or 「テストはCIに回さなくていい」 beside a waiver
// is not a prohibition (confirmation rounds, M-1, L-1, 中-1, 中-2, 低-1).
const NEGATED_PUTOFF = new RegExp(String.raw`(?<=(?:確認|許可|承認|承諾|了承|同意|相談|合図|ゴーサイン|レビュー|査読)(?:は|も|を)[^。、]{0,8})(?:(?:後|あと)回し(?:に)?(?:は|も)?(?:し|せ)(?:ない|なく|ず)|(?:後|あと)に?(?:は)?回さ(?:ない|なく|ず)|(?:(?:後|あと)回し(?:に)?|(?:後|あと)に?回)(?:でき|せ)(?:ない|ず)|に回さ(?:ない|なく|ず))`, 'u')
const PROHIBITION = /やめ|ダメ|だめ|(?<![A-Za-z])(?:NG|ＮＧ)(?![A-Za-z])|厳禁|禁止|禁じ|いけない|いけません|許さ|困る|困ります|なりません|しないで|しないこと|するな|せぬ|ない(?:ほう|方)が|(?:避け|控え)|べきで(?:は)?(?:ない|ありません)|じゃない|ではない|(?:では|じゃ)ありません|とは(?:思わない|思えない|言えない|限らない|思いません|思えません|言えません)|思わない|思えない|思いません|思えません|(?:よく|良く)(?:ない|ありません)|まずい|よろしくない|わけ(?:が|は|では|じゃ)?(?:ない|ありません)|(?:なんて)?ことは(?:ない|ありません)|はず(?:が|は)?ない|言って(?:い)?ない|言って(?:い)?ません|され(?:る|て|た)|\b(?:forbid\w*|prohibit\w*|avoid|stop|must(?:n['’]t| not)|should(?:n['’]t| not)|never|hardly|barely|(?:can|may|is|are|was|were)\s+no\s+longer|nobody|no\s+one|not\s+true|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|is\s+not|are\s+not|can['’]?t|cannot|may\s+not|won['’]t|do\s+not|don['’]t|didn['’]t|(?:isn['’]t|aren['’]t|wasn['’]t|is not|are not|not)\s+(?:(?:\w+ly|ever|so|that|at all|no longer)\s+){0,2}(?:ok|okay|allowed|fine|acceptable|right|good|safe))\b/iu
// A comma or 、 ends a clause, so permission is read inside the comma clause of the waiver;
// "Before you push, push without asking." therefore stays a waiver ("before" alone is
// not an asking word) and "Without asking, never push" a request.
// Permission is read up to but/however only: "You can open issues and PRs without asking"
// grants before the "and" (thirteenth re-inspection of the matcher, H-a); the blanking for
// the asking side (CLAUSE_PARTS) does split at "and", so "Wait for my go-ahead before
// pushing and feel free to open new issues without asking" keeps its gate (twelfth, H-1).
const CLAUSE_SPLIT = new RegExp(String.raw`[.!?;,\n。！？、;；—–()]|\b(?:but|however)\b|${JA_BUT}`, 'iu')
const SENTENCE_SPLIT = /[.!?\n。！？]/u
// A first-person habit (「私はpushの前に確認しない。」 "I never ask before pushing") is not an
// opt-out addressed to the assistant (third re-inspection of the matcher, M4); a stated
// wish ("I don't want confirmation", 「私は確認は不要」) is.
const FIRST_PERSON = /^\s*(?:私|僕|俺|自分|わたし|ぼく)(?:は|も|が)|\b(?:I|we)\b/iu
const WISH = /\b(?:want|need)\b|不要|要らない|いらない|必要(?:は|が)?ない|求めない/iu
// Polite and casual question endings count without a question mark (sixth re-inspection, M-2),
// so do 「だろうか」, a bare 「か」, a 「かどうか」 in predicate position and a "whether" before the
// waiver (eighth and ninth re-inspections; "push without asking whether I've reviewed it" is
// a waiver).
const QUESTION = /[?？]\s*$|(?:ですか|でしょうか|ますか|だろうか|かな|かしら|のか|か)(?:ね|な|ねえ|なあ|よ)?\s*$|かどうか(?=\s*(?:[。、！？]|$|迷|分か|わか|決め|聞|確認|教え|判断|知|考|検討))/u
const WHETHER = /\bwhether\b/iu
// A clause followed by 「という人がいる」「と言われた」 is reported speech, and so is a
// clause that itself says 「って言う人」「と言われ」 "some people say" (fourth re-inspection
// of the matcher, Medium-1); neither states an opt-out or a permission. Both forms need a
// speaker: 「、という方針です」「、と頼みます」「って言ってる」 are the person's own words
// (fifth and sixth re-inspections, High-1).
// The speaker is written positively, with its predicate of existence (「という人がいる」
// 「と言う方が多い」「という声がある」), so 「という方向で」「という方式」 are the person's
// own words (seventh re-inspection of the matcher, H-A).
// Person nouns (同僚・上司・メンバー…) are speakers too (eighth re-inspection, Medium-1).
const SPEAKER = String.raw`(?:(?:人|方|の|同僚|上司|先輩|後輩|メンバー|チーム|仲間|友人|知人|みんな|皆|者|人たち|社員)(?:が|も|は)?(?:いる|いた|いて|います|いました|多い|多く)|(?:声|話|噂|意見)(?:が|も)?(?:ある|あった|あります|多い|多く))`
const REPORTED = new RegExp(String.raw`^(?:(?:という|と言(?:う|って(?:い)?る)|って(?:いう|言(?:う|って(?:い)?る)))${SPEAKER}|(?:と|って)言われ)`, 'u')
// Only speech with a speaker is reported (「って言う人がいる」「と言われた」 "people say");
// 「という方針にします」 states a policy (fifth re-inspection of the matcher, High-1).
const REPORTED_IN = new RegExp(String.raw`(?:(?:という|と言(?:う|って(?:い)?る)|って(?:いう|言(?:う|って(?:い)?る)))${SPEAKER}|(?:と|って)(?:言われ(?:た|て|る)|聞い)|\b(?:people say|some say|they say|said that|says that|is said to|told me)\b)`, 'iu')

function around(text, index, length, splitter) {
  return text.slice(0, index).split(splitter).at(-1) + text.slice(index, index + length) + text.slice(index + length).split(splitter)[0]
}

/**
 * Judge whether a line (or table cell) opts out of the publishing gate. Exported for the
 * tests, which pin each ruling rather than only the proposal it leads to.
 * @param {string} text A line or cell.
 * @param {Array<{pattern: RegExp}>} [triggers] The recipe's triggers for the profile language:
 *   a sentence of the cell that carries no waiver phrase and still matches one of them asks
 *   for the gate ("Never push unless confirmed. Feel free to file issues without asking."
 *   keeps its gate), so the asking vocabulary cannot drift away from the catalog's (ninth
 *   re-inspection of the matcher, H-1).
 * @returns {{unlessText: string, waiver: boolean, asking: boolean, conflict: boolean}}
 *   `waiver`: an explicit opt-out was found; `asking`: a request (or a negated waiver) was
 *   found; `conflict`: both. The gate is dropped only when `waiver && !asking`.
 */
export function publishPolarity(text, triggers = []) {
  let waiver = false
  let negatedWaiver = false
  const unlessText = text.replace(PUBLISH_WAIVER, (matched, index) => {
    const clause = around(text, index, matched.length, CLAUSE_SPLIT)
    const tight = around(text, index, matched.length, CLAUSE_SPLIT_TIGHT).trim()
    // Only a waiver that is the whole of its clause borrows the object ("Feel free to run the
    // linter without asking and push when it passes" keeps its own verb and waives nothing).
    const bareWaiver = /^(?:please|just|simply|then|ok|okay)?\s*$/iu.test(tight.replace(matched, '').trim())
    const andPush = bareWaiver ? (AND_PUSH_CLAUSE.exec(text.slice(index + matched.length)) ?? JA_ORDER_CLAUSE.exec(text.slice(index + matched.length))) : null
    const objectScope = !PUBLISH_OBJECT.test(tight) && andPush ? `${tight} and ${andPush[1]}` : tight
    // A waiver about something other than publishing says nothing about the gate.
    if (!PUBLISH_OBJECT.test(objectScope)) return ' '.repeat(matched.length)
    const sentence = around(text, index, matched.length, SENTENCE_SPLIT)
    const trimmed = clause.trim()
    const rest = text.slice(index + matched.length)
    const clauseEnd = rest.search(CLAUSE_SPLIT)
    const following = clauseEnd < 0 ? '' : rest.slice(clauseEnd).replace(/^[\s、,。！？!?;；—–()]+/u, '')
    // The clause splitter swallows the question mark, so it is read from the terminator;
    // a sentence that ends with one ("…, right?") makes every clause in it a question.
    const sentenceTerminator = rest.match(/[.!?\n。！？]/u)?.[0] ?? ''
    // "…, OK?" after an order is the order's tag, not a question (fifth re-inspection, Medium-2).
    const okTag = /[,、]\s*(?:ok|okay|alright|ＯＫ|オーケー)\s*$/iu.test(sentence) && IMPERATIVE_WAIVER.test(tight)
    const question = QUESTION.test(trimmed) || WHETHER.test(text.slice(0, index).split(CLAUSE_SPLIT).at(-1))
      || (clauseEnd >= 0 && /[?？]/u.test(rest[clauseEnd])) || (/[?？]/u.test(sentenceTerminator) && !okTag)
    const habit = FIRST_PERSON.test(tight) && !WISH.test(tight)
    const reported = REPORTED.test(following) || REPORTED_IN.test(trimmed)
    const stated = !habit && !question && !reported && (EXPLICIT_WAIVER.test(tight) || IMPERATIVE_WAIVER.test(tight))
    const permitted = stated || (!question && !reported && PERMISSION.test(clause))
    const prohibited = PROHIBITION.test(sentence.replace(PUBLISH_WAIVER, ' ')) || NEGATED_PUTOFF.test(sentence)
    if (permitted && !prohibited) waiver = true
    else negatedWaiver = true
    return ' '.repeat(matched.length)
  })
  const asksByTrigger = triggers.length > 0 && text.split(SENTENCE_SPLIT).some(sentence => asksBeyondWaivers(sentence, triggers))
  const asking = negatedWaiver || PUBLISH_ASK.test(unlessText) || asksByTrigger
  return { unlessText, waiver, asking, conflict: waiver && asking }
}

function exec(pattern, text) {
  // Cloning prevents global/sticky expressions from carrying state between calls.
  return new RegExp(pattern.source, pattern.flags).exec(text)
}

function cellsFor(line, cell = 'any') {
  // An avoid-column trigger reads table rows only; in a bullet 「一案だけ出して」 is a
  // request for the thing itself (final inspection, chunk B, MEDIUM-7).
  if (line.kind !== 'row') return cell === 'left' ? [] : [line.text]
  if (cell === 'left') return [line.left ?? '']
  if (cell === 'right') return [line.right ?? '']
  return [line.left ?? '', line.right ?? '']
}

function hitFor(line, recipe, language) {
  for (const trigger of recipe.triggers) {
    if (trigger.lang !== 'any' && trigger.lang !== language) continue
    for (const text of cellsFor(line, trigger.cell)) {
      const match = exec(trigger.pattern, text)
      if (match && match[0].length > 0) {
        // Unless reads exactly this cell/text, regardless of its informational lang.
        if (recipe.unless.some(({ pattern }) => exec(pattern, text) !== null)) continue
        const guard = recipe.id === 'publish-guard'
          ? publishPolarity(text, recipe.triggers.filter(candidate => candidate.lang === 'any' || candidate.lang === language))
          : null
        // A genuine waiver with no request in the same text opts out of the gate.
        if (guard && guard.waiver && !guard.asking) continue
        if (typeof line.quote !== 'string') throw new TypeError(`${TOOL_NAME}: a profile line has no quote (line ${line.line})`)
        return { ...line, matched: match[0], publishConflict: guard?.conflict ?? false }
      }
    }
  }
  return null
}

function confidenceFor(line, recipe, profile) {
  if (line.section === 'unknown') return 'low'
  if (!line.publishConflict && (profile.format === 'kokoro' || profile.format === 'torisetsu') && recipe.sections.includes(line.section)) return 'high'
  return 'medium'
}

function derivedParamsFor(recipe, hits, profile, defaults) {
  const derived = recipe.deriveParams?.(hits, profile) ?? {}
  const overrides = {}
  for (const [name, spec] of Object.entries(recipe.params)) {
    if (!Object.hasOwn(derived, name)) continue
    const value = derived[name]
    // Only bounded numbers and enumerated strings may travel from the manual to a mod.
    if (spec.type === 'number' && Number.isFinite(value) && Number.isFinite(spec.min) && Number.isFinite(spec.max) && spec.min <= spec.max) {
      overrides[name] = Math.min(spec.max, Math.max(spec.min, Math.round(value)))
    } else if (spec.type === 'string' && !spec.multiple && typeof value === 'string' && spec.options?.includes(value)) {
      overrides[name] = value
    }
  }
  // Reject inverted ranges before clamping can hide the inversion, and afterwards.
  if ((Number.isFinite(derived.min) && Number.isFinite(derived.max) && derived.min > derived.max)
    || (overrides.min ?? defaults.min) > (overrides.max ?? defaults.max)) {
    delete overrides.min
    delete overrides.max
  }
  return overrides
}

function paramsFor(recipe, hits, profile, confidenceHit) {
  const defaults = Object.fromEntries(Object.entries(recipe.params).map(([name, spec]) => [name, structuredClone(spec.default)]))
  const derived = derivedParamsFor(recipe, hits, profile, defaults)
  const pending = new Set(Object.keys(derived))
  const sources = new Set([confidenceHit])
  // Source-ordered prefixes locate the first hit contributing each accepted value
  // without changing deriveParams' public return type or dropping default-valued overrides.
  for (let end = 1; end <= hits.length && pending.size; end++) {
    const prefix = end === hits.length ? derived : derivedParamsFor(recipe, hits.slice(0, end), profile, defaults)
    for (const name of pending) {
      if (Object.hasOwn(prefix, name) && Object.is(prefix[name], derived[name])) {
        sources.add(hits[end - 1])
        pending.delete(name)
      }
    }
  }
  const evidenceHits = hits.slice(0, 3)
  for (const hit of sources) {
    if (evidenceHits.includes(hit)) continue
    const index = evidenceHits.findLastIndex(candidate => !sources.has(candidate))
    if (index < 0) throw new Error(`Too many evidence source lines for ${recipe.id}`)
    evidenceHits[index] = hit
  }
  return {
    params: { ...defaults, ...derived },
    evidence: evidenceHits.sort((a, b) => a.line - b.line)
      .map(({ line, section, quote, matched }) => ({ line, section, quote, matched })),
  }
}

/**
 * Match a Profile to ranked proposals without modifying the profile or catalog.
 * deriveParams receives all hits in line order, with the source line fields plus
 * quote and matched; recipe derivations keep the first explicit value per param.
 * It is also called on source-ordered prefixes to retain parameter source evidence.
 * @param {object} profile A Profile as defined in DESIGN §5.1.
 * @param {object[]} [recipes=RECIPES] Recipes in catalog order.
 * @param {{maxEnabled?: number}} [options] Maximum initially enabled proposals.
 * @returns {object[]} Proposals with one to three source evidence entries.
 */
export function matchRecipes(profile, recipes = RECIPES, { maxEnabled = DEFAULT_MAX_ENABLED } = {}) {
  if (maxEnabled !== Infinity && (!Number.isInteger(maxEnabled) || maxEnabled < 0)) {
    throw new TypeError('maxEnabled must be a non-negative integer or Infinity')
  }
  const lines = profile.lines
    .filter(line => CANDIDATE_KINDS.has(line.kind) && !line.inExample && line.section !== 'history' && line.raw.length > 0)
    .sort((a, b) => a.line - b.line)
  const ranked = []
  recipes.forEach((recipe, catalogIndex) => {
    const hits = lines.map(line => hitFor(line, recipe, profile.language)).filter(Boolean)
    if (hits.length === 0) return
    // Keep the first hit at the strongest confidence as a required citation.
    const confidenceHit = hits.reduce((best, hit) =>
      CONFIDENCE[confidenceFor(hit, recipe, profile)] > CONFIDENCE[confidenceFor(best, recipe, profile)] ? hit : best)
    const confidence = confidenceFor(confidenceHit, recipe, profile)
    ranked.push({
      catalogIndex,
      safety: recipe.priority === 'safety',
      proposal: {
        recipeId: recipe.id,
        confidence,
        ...paramsFor(recipe, hits, profile, confidenceHit),
        enabledByDefault: false,
      },
    })
  })
  ranked.sort((a, b) =>
    Number(b.safety) - Number(a.safety)
    || CONFIDENCE[b.proposal.confidence] - CONFIDENCE[a.proposal.confidence]
    || b.proposal.evidence.length - a.proposal.evidence.length
    || a.catalogIndex - b.catalogIndex,
  )
  return ranked.map(({ proposal }, index) => ({ ...proposal, enabledByDefault: index < maxEnabled }))
}

/**
 * Package proposals as given with deterministic profile metadata and sorted paths.
 * @param {object} profile A Profile.
 * @param {object[]} proposals Proposals whose order and values are retained.
 * @param {{file: string, sha256: string, pluginName: string, files?: string[], recipes?: object[]}} options Output metadata and catalog.
 * @returns {object} A Bundle as defined in DESIGN §5.4.
 */
export function buildBundle(profile, proposals, { file, sha256, pluginName, files = [], recipes = RECIPES }) {
  const ids = new Set(recipes.map(({ id }) => id))
  // An unknown id is an internal defect; the message names its position, never the value.
  proposals.forEach(({ recipeId }, index) => {
    if (!ids.has(recipeId)) throw new Error(`proposals[${index}].recipeId: unknown recipe id`)
  })
  const matched = new Set(proposals.map(({ recipeId }) => recipeId))
  // The frontmatter version is the only manual value copied into the bundle; it is kept
  // only when it looks like a version (re-inspection, chunk D, M-4).
  const version = profile.frontmatter?.version
  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    profile: {
      file: basename(file.replaceAll('\\', '/')),
      format: profile.format,
      language: profile.language,
      // Only numbers and the usual pre-release tags: a free suffix could carry a word
      // from the manual (second re-inspection of the matcher, F5).
      version: typeof version === 'string' && /^\d+(?:\.\d+){0,3}(?:-(?:alpha|beta|rc|dev|pre)(?:\.?\d+)?)?$/u.test(version) ? version : null,
      sha256,
    },
    pluginName,
    proposals,
    notMatched: [...ids].filter(id => !matched.has(id)).sort(),
    files: [...files].sort(),
  }
}

function slugChoice(profile, { name } = {}) {
  // The plugin name enters the distributable and every export, so it never derives
  // from the manual (its title, name or alias may carry a person's name). Only an
  // explicit --name is used; otherwise the name is `profile` (final inspection,
  // chunks C and E). A rejected --name is reported, not silently replaced.
  if (name === undefined || name === null) return { slug: 'profile', source: 'fallback' }
  const normalized = String(name).normalize('NFKC').toLowerCase()
  const ascii = normalized.replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  const slug = ascii.slice(0, 40).replace(/-+$/u, '')
  // An empty name was given and is refused, not silently replaced (re-inspection, chunk D, L-2).
  if (slug && ![normalized, ascii, slug].some(text => FORBIDDEN_SLUG_TERM.test(text) || FORBIDDEN_SLUG_SUBSTRING.test(text))) return { slug, source: 'option' }
  return { slug: 'profile', source: 'rejected' }
}

/**
 * The plugin slug: an explicit --name (NFKC, lower-case, ascii letters/digits/hyphens,
 * at most 40 characters, no Appendix A term) or 'profile'. Never derived from the manual.
 * @param {object} profile A Profile (unused since the slug no longer reads it; kept for the call shape).
 * @param {{name?: string}} [options] The explicit name.
 * @returns {string} A kebab-case slug of at most 40 characters, or 'profile'.
 */
export function slugFor(profile, options = {}) {
  return slugChoice(profile, options).slug
}

/** @returns {'option'|'fallback'|'rejected'} Where the slug came from; 'rejected' means a --name was given but unusable. */
export function slugSource(profile, options = {}) {
  return slugChoice(profile, options).source
}

/**
 * Whether a plugin name is `kokoro-mods-` plus a slug that `--name` would accept as it
 * stands: the shape of PLUGIN_NAME_PATTERN and no forbidden term. The emitter and the
 * export validator both use it, so a name built before the slug rule (or by hand) with
 * a diagnosis term in it is refused everywhere (re-inspection, chunk D/E, F1).
 * @param {unknown} name A candidate plugin name.
 * @returns {boolean}
 */
export function isPluginName(name) {
  if (typeof name !== 'string' || name.length > PLUGIN_NAME_MAX_CHARS || !PLUGIN_NAME_PATTERN.test(name)) return false
  const slug = name.slice(TOOL_NAME.length + 1)
  const choice = slugChoice(null, { name: slug })
  return choice.source === 'option' && choice.slug === slug
}
