import { isDeepStrictEqual } from 'node:util'

const FIELD_ORDER = ['params', 'evidence', 'enabledByDefault', 'confidence']

function valueFor(proposal, field) {
  // Moving a quoted line does not change its meaning; quote order still matters.
  return field === 'evidence' ? proposal.evidence.map(({ quote }) => quote) : proposal[field]
}

function indexProposals(proposals, side) {
  const indexed = new Map()
  for (const proposal of proposals) {
    if (indexed.has(proposal.recipeId)) throw new Error(`Duplicate recipeId in ${side}: ${proposal.recipeId}`)
    indexed.set(proposal.recipeId, proposal)
  }
  return indexed
}

/**
 * Compare bundles by recipe id, ignoring metadata and evidence line renumbering.
 * Duplicate ids in either input are rejected rather than silently overwritten.
 * @param {{proposals: object[]}} before A Bundle or a proposals-only wrapper.
 * @param {{proposals: object[]}} after A Bundle or a proposals-only wrapper.
 * @returns {{added: string[], removed: string[], changed: {recipeId: string, fields: string[]}[], same: string[], hasChanges: boolean}} Sorted changes.
 */
export function diffProposals(before, after) {
  const oldById = indexProposals(before.proposals, 'before')
  const newById = indexProposals(after.proposals, 'after')
  const added = []
  const removed = []
  const changed = []
  const same = []
  for (const recipeId of [...new Set([...oldById.keys(), ...newById.keys()])].sort()) {
    if (!oldById.has(recipeId)) added.push(recipeId)
    else if (!newById.has(recipeId)) removed.push(recipeId)
    else {
      const previous = oldById.get(recipeId)
      const next = newById.get(recipeId)
      const fields = FIELD_ORDER.filter(field => !isDeepStrictEqual(valueFor(previous, field), valueFor(next, field)))
      if (fields.length) changed.push({ recipeId, fields })
      else same.push(recipeId)
    }
  }
  return { added, removed, changed, same, hasChanges: added.length + removed.length + changed.length > 0 }
}

/**
 * Render a proposal diff in four CLI lines, mentioning each recipe id once.
 * @param {ReturnType<typeof diffProposals>} diff A proposal diff.
 * @param {{lang?: 'ja'|'en'}} [options] Display language, defaulting to English.
 * @returns {string} Human-readable added, removed, changed, and unchanged lists.
 */
export function formatDiff(diff, { lang = 'en' } = {}) {
  const labels = lang === 'ja'
    ? { added: '追加', removed: '削除', changed: '変更', same: '変更なし', none: 'なし', params: '設定', evidence: '引用', enabledByDefault: '初期の有効状態', confidence: '確かさ', defaultOnly: '（既定の ON/OFF のみ）' }
    : { added: 'Added', removed: 'Removed', changed: 'Changed', same: 'Same', none: 'none', params: 'params', evidence: 'evidence', enabledByDefault: 'enabledByDefault', confidence: 'confidence', defaultOnly: '(default toggle only)' }
  const list = values => values.join(', ') || labels.none
  const change = ({ recipeId, fields }) => {
    const suffix = fields.length === 1 && fields[0] === 'enabledByDefault' ? ` ${labels.defaultOnly}` : ''
    return `${recipeId} [${fields.map(field => labels[field]).join(', ')}]${suffix}`
  }
  return [
    `${labels.added}: ${list(diff.added)}`,
    `${labels.removed}: ${list(diff.removed)}`,
    `${labels.changed}: ${list(diff.changed.map(change))}`,
    `${labels.same}: ${list(diff.same)}`,
  ].join('\n')
}
