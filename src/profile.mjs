import {
  SECTION_BY_NUMBER,
  HEADING_KEYWORDS,
  EXAMPLE_HEADING_MARKERS,
} from './constants.mjs'

/**
 * Detect Japanese when CJK code points are at least 20% of non-space text.
 * @param {string} text
 * @returns {'ja'|'en'}
 */
export function detectLanguage(text) {
  let total = 0
  let cjk = 0
  // Evidence may contain emoji; counting UTF-16 halves would distort the ratio.
  for (const character of text) {
    if (/\s/u.test(character)) continue
    total += 1
    if (/[\u3040-\u30ff\p{Unified_Ideograph}]/u.test(character)) cjk += 1
  }
  return total > 0 && cjk / total >= 0.2 ? 'ja' : 'en'
}

/**
 * Resolve a heading using the frozen number map or the first keyword match.
 * @param {string} heading
 * @param {number|null} [number]
 * @returns {keyof typeof HEADING_KEYWORDS|'unknown'}
 */
export function sectionKeyForHeading(heading, number = null) {
  if (number !== null && number !== undefined && Object.hasOwn(SECTION_BY_NUMBER, number)) {
    return SECTION_BY_NUMBER[number]
  }
  const lower = heading.normalize('NFKC').toLowerCase()
  for (const [key, keywords] of Object.entries(HEADING_KEYWORDS)) {
    if (keywords.some(keyword => lower.includes(keyword.toLowerCase()))) return key
  }
  return 'unknown'
}

function readFrontmatter(rawLines) {
  const fence = /^---[ \t]*$/u
  if (!fence.test((rawLines[0] ?? '').replace(/^\uFEFF/u, ''))) return null
  const end = rawLines.findIndex((raw, index) => index > 0 && fence.test(raw))
  if (end === -1 || end >= 40) return null
  const entries = []
  for (const raw of rawLines.slice(1, end)) {
    if (/^[ \t]*(?:#.*)?$/u.test(raw)) continue
    const colon = raw.indexOf(':')
    if (colon === -1) return null
    const key = raw.slice(0, colon).trim()
    if (!key) return null
    const value = raw.slice(colon + 1).trim()
    const quoted = /^(["'])(.*)\1$/u.exec(value)
    entries.push([key, quoted ? quoted[2] : value])
  }
  // Metadata keys are data, including __proto__; never invoke object setters.
  return { values: Object.fromEntries(entries), end }
}

function stripComments(raw, open) {
  let comment = open
  let text = ''
  let quote = ''
  let gap = open
  const append = value => {
    text += value
    // Collapse only spaces touching a removed comment; retain other inner spaces.
    if (gap) {
      value = value.replace(/^ +/u, quote.endsWith(' ') ? '' : ' ')
      gap = !/[^ ]/u.test(value)
    }
    quote += value
  }
  let offset = 0
  while (offset < raw.length) {
    if (open) {
      const end = raw.indexOf('-->', offset)
      if (end === -1) return { text, quote, comment, open }
      open = false
      offset = end + 3
    } else if (raw.startsWith('<!--', offset)) {
      comment = true
      open = true
      quote = quote.replace(/ +$/u, ' ')
      gap = true
      offset += 4
    } else if (raw[offset] === '`') {
      // Only a matching backtick run encloses code; an unmatched run is literal.
      const ticks = /^`+/u.exec(raw.slice(offset))[0]
      const start = offset
      offset += ticks.length
      let end = raw.indexOf(ticks, offset)
      while (end !== -1 && (raw[end - 1] === '`' || raw[end + ticks.length] === '`')) {
        end = raw.indexOf(ticks, end + ticks.length)
      }
      if (end !== -1) offset = end + ticks.length
      append(raw.slice(start, offset))
    } else {
      append(raw[offset])
      offset += 1
    }
  }
  return { text, quote, comment, open }
}

function tableCells(text) {
  const cells = []
  let cell = ''
  let slashes = 0
  for (const character of text) {
    if (character === '|' && slashes % 2 === 0) {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
    slashes = character === '\\' ? slashes + 1 : 0
  }
  if (!cells.length) return null
  cells.push(cell)
  if (cells[0] === '') cells.shift()
  if (cells.at(-1) === '') cells.pop()
  return cells.length ? cells.map(value => value.trim()) : null
}

/**
 * Parse the frozen Profile shape (DESIGN.md §5.1), preserving evidence lines.
 * @param {string} text
 * @returns {object} A Profile with inclusive section ranges and verbatim raw lines.
 */
export function parseProfile(text) {
  const rawLines = text.split(/\r\n|\n|\r/u)
  // A final newline terminates a real line; it does not create another one.
  if (rawLines.at(-1) === '') rawLines.pop()
  const metadata = readFrontmatter(rawLines)
  const frontmatter = metadata?.values ?? null
  const frontmatterEnd = metadata?.end ?? -1
  const declaredFormat = (frontmatter?.format || frontmatter?.format_version || '').toLowerCase()
  const format = declaredFormat === 'kokoro' || declaredFormat.startsWith('kokoro/') ? 'kokoro'
    : declaredFormat === 'torisetsu' || declaredFormat.startsWith('torisetsu/') ? 'torisetsu' : 'generic'
  const declaredLanguage = (frontmatter?.language ?? '').toLowerCase().replace(/_/gu, '-')
  const language = declaredLanguage === 'ja' || declaredLanguage === 'ja-jp' ? 'ja'
    : /^en(?:-(?:us|gb))?$/u.test(declaredLanguage) ? 'en' : detectLanguage(text)
  const sections = []
  const lines = []
  let title = null
  let section = 'unknown'
  let sectionIndex = -1
  let inExample = false
  let inComment = false
  let inTable = false
  let codeFence = null

  for (const [index, raw] of rawLines.entries()) {
    const inline = stripComments(raw, false)
    const entry = {
      line: index + 1, section, sectionIndex, kind: 'text', raw, quote: inline.quote,
      text: raw.trim(), depth: 0, inExample,
    }
    lines.push(entry)
    const source = index === 0 ? raw.replace(/^\uFEFF/u, '') : raw
    if (index <= frontmatterEnd) {
      entry.kind = 'frontmatter'
      entry.text = ''
      continue
    }
    const fence = /^[ \t]*(`{3,}|~{3,})(.*)$/u.exec(source)
    if (codeFence || (!inComment && fence && (fence[1][0] === '~' || !fence[2].includes('`')))) {
      entry.kind = 'code'
      entry.text = ''
      inTable = false
      if (codeFence) {
        if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length
          && fence[2].trim() === '') codeFence = null
      } else {
        codeFence = fence[1]
      }
      continue
    }
    const comment = inComment ? stripComments(raw, true) : inline
    inComment = comment.open
    entry.quote = comment.quote
    const visible = index === 0 ? comment.text.replace(/^\uFEFF/u, '') : comment.text
    if (comment.comment && visible.trim() === '') {
      entry.kind = 'comment'
      entry.text = ''
      entry.quote = ''
      inTable = false
    } else if (visible.trim() === '') {
      entry.kind = 'blank'
      entry.text = ''
      inTable = false
    } else {
      const headingMatch = /^(#{1,3})[ \t]+(.*)$/u.exec(visible)
      if (headingMatch) {
        const label = headingMatch[2].replace(/[ \t]+#+[ \t]*$/u, '').trim()
        const numbered = /^([0-9０-９]+)[.．][ \t]*(.*)$/u.exec(label)
        let heading = (numbered ? numbered[2] : label).trim()
        const num = numbered ? Number(numbered[1].normalize('NFKC')) : null
        const level = headingMatch[1].length
        if (level === 1) heading = heading.replace(/^(\*\*|__)(.*)\1$/u, '$2').trim()
        if (level === 2) {
          if (sections.length) sections.at(-1).endLine = index
          const keyword = sectionKeyForHeading(heading)
          section = format === 'generic' && keyword !== 'unknown' ? keyword : sectionKeyForHeading(heading, num)
          sectionIndex = sections.length
          sections.push({ num, key: section, heading, startLine: index + 1, endLine: rawLines.length })
          inExample = false
        } else if (level === 3) {
          inExample = EXAMPLE_HEADING_MARKERS.some(marker =>
            heading.normalize('NFKC').toLowerCase().includes(marker.toLowerCase()))
        } else if (title === null) {
          title = heading
        }
        Object.assign(entry, { kind: 'heading', text: heading, section, sectionIndex, inExample })
        inTable = false
      } else {
        // A quote is a container: retain indentation after its one optional space.
        const content = visible.replace(/^(?: *>[ \t]?)+/u, '')
        entry.text = content.trim()
        const bullet = /^([ \t]*)(?:[-*+]|\d+\.)[ \t]+(.*)$/u.exec(content)
        const cells = tableCells(entry.text)
        const outerPipes = entry.text.startsWith('|') && /(?<!\\)(?:\\\\)*\|$/u.test(entry.text)
        const nextVisible = stripComments(rawLines[index + 1] ?? '', inComment).text
        const nextCells = tableCells(nextVisible.replace(/^(?: *>[ \t]?)+/u, '').trim())
        const startsTable = outerPipes || nextCells?.every(cell => /^:?-+:?$/u.test(cell))
        if (bullet) {
          entry.kind = 'bullet'
          entry.depth = Math.floor(bullet[1].replace(/\t/gu, '  ').length / 2)
          entry.text = bullet[2].trim()
          inTable = false
        } else if (cells && (inTable || startsTable)) {
          const separator = cells.every(cell => /^:?-+:?$/u.test(cell))
          // Headers and separators remain text entries to preserve every source line.
          if (inTable && !separator) {
            entry.kind = 'row'
            entry.cells = cells
            entry.left = cells[0]
            entry.right = cells[1] ?? ''
            entry.text = cells.join(' | ')
          }
          inTable = true
        } else {
          inTable = false
        }
      }
    }
  }
  return { format, language, frontmatter, title, sections, lines }
}
