import { posix } from 'node:path'
import { configKey, metricEvents } from './manifest.mjs'

function inert(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function plain(text) {
  return inert(text).replace(/[\\`*_[\]{}()#!|~:.]/g, '\\$&')
}

function fenced(text) {
  const safe = String(text)
  const runs = safe.match(/`+/g) ?? []
  const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)))
  return `${fence}text\n${safe}\n${fence}`
}

const WORDS = {
  en: {
    title: 'kokoro-mods proposals',
    about: 'kokoro-mods turns requests in your own AI manual into optional Claude Code mods.',
    install: 'Install',
    on: 'On by default', off: 'Off by default',
    lines: 'Lines from the manual', does: 'What this mod does', keys: 'userConfig keys',
    counts: 'What it counts', none: 'None', references: 'Evidence references', unmatched: 'Not matched',
    escaping: 'Quotations are kept verbatim inside fenced code blocks; PROPOSALS.json also keeps the original lines.',
    limits: 'Counts are proxies for hook activity, not measurements of how a person feels. publish-guard protects Bash only; other tools and scripts that publish internally are not protected. session-resume-brief stores only a time and a count per working directory.',
    events: {
      long_answers: 'answers over the line limit', detected: 'matched fragments or stop signals',
      denied: 'publishing calls denied', allowed: 'publishing calls allowed by a grant',
      long_turns: 'turns that reached the reminder time', resumed: 'resume notices shown',
      ticks: 'timer ticks after a completed turn', suppressed: 'toasts held back by the shared cooldown',
    },
  },
  ja: {
    title: 'kokoro-mods の提案',
    about: 'kokoro-mods は、自分で書いた AI への取扱説明書から、選んで使える Claude Code の mod を提案します。',
    install: 'インストール',
    on: '初期設定でオン', off: '初期設定でオフ',
    lines: '取扱説明書の引用', does: 'この mod がすること', keys: 'userConfig の設定キー',
    counts: '数えること', none: 'なし', references: '根拠の参照先', unmatched: '一致しなかった項目',
    escaping: '引用はコードブロックの中にそのまま載せています。元の行は PROPOSALS.json にも残しています。',
    limits: '回数はフックが動いた目安で、本人の気持ちを測るものではありません。publish-guard が守るのは Bash だけです。ほかのツールや、内部で公開するスクリプトは守れません。session-resume-brief が作業フォルダーごとに保存するのは、時刻と回数だけです。',
    events: {
      long_answers: '行数の上限を超えた回答', detected: '見つかった短い言葉や停止の合図',
      denied: '公開を止めた回数', allowed: '許可により公開を通した回数',
      long_turns: 'お知らせの時間に達したターン', resumed: '再開のお知らせ',
      ticks: 'ターン完了後に動いたタイマー', suppressed: '共通の間隔制限で見送った通知',
    },
  },
}

/** Render the private reports; this is the only template that receives evidence. */
export function renderProposals({ bundle, recipes, lang = 'en', outDirName = '.' }) {
  const words = WORDS[lang] ?? WORDS.en
  const localized = text => text[lang] ?? text.en
  // Invocation path prefixes are local details, even for relative paths.
  const directory = posix.basename(outDirName.replaceAll('\\', '/').replace(/\/+$/, '')) || '.'
  const pluginPath = `${directory}/plugin`
  const installPath = /^[A-Za-z0-9_./-]+$/.test(pluginPath) ? pluginPath : JSON.stringify(pluginPath)
  const parts = [
    `# ${words.title}`, words.about,
    `## ${words.install}`,
    fenced(`/plugin marketplace add ${installPath}\n/plugin install ${bundle.pluginName}`),
    words.escaping,
  ]
  for (const proposal of bundle.proposals) {
    const recipe = recipes[proposal.recipeId]
    parts.push(`## ${plain(localized(recipe.title))}`, proposal.enabledByDefault ? words.on : words.off)
    parts.push(`### ${words.lines}`)
    for (const evidence of proposal.evidence) {
      parts.push(`line ${evidence.line} (§${plain(evidence.section)})`, fenced(evidence.quote))
    }
    const keys = [configKey(proposal.recipeId), ...Object.keys(recipe.params).sort().map(name => configKey(proposal.recipeId, name))]
    const events = metricEvents(recipe)
    parts.push(`${words.does}: ${plain(localized(recipe.summary))}`)
    parts.push(`${words.keys}: ${keys.map(key => '`' + key + '`').join(', ')}`)
    parts.push(`${words.counts}: ${events.length ? events.map(event => '`' + event + '` — ' + plain(words.events[event] ?? event)).join('; ') : words.none}`)
    parts.push(`${words.references}:`)
    const references = recipe.evidence.map(evidence => `- ${plain(evidence.kind)}: ${plain(evidence.ref)} — ${plain(evidence.note)}`)
    parts.push(references.length ? references.join('\n') : words.none)
  }
  parts.push(`## ${words.unmatched}`)
  parts.push(bundle.notMatched.length ? [...bundle.notMatched].sort().map(id => `- ${plain(id)}`).join('\n') : words.none)
  parts.push(words.limits)
  return new Map([
    ['PROPOSALS.md', parts.join('\n\n') + '\n'],
    ['PROPOSALS.json', JSON.stringify(bundle, null, 2) + '\n'],
  ])
}
