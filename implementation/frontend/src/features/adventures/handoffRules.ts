import type { AdventureDetail, AdventureType } from './adventureTypes'
import { acceptedParticipants } from './adventureRules'
import { detailLabels, type DetailField } from './handoffDocument'
import type { HandoffRecord } from './handoffService'

/** The source is stored verbatim, so its size limit is the database's (H11). */
export const maxSourceBytes = 65_536

/** What the player is told about who will read the source they keep (H3, §11 risks). */
export function sourceAudience(adventure: AdventureDetail) {
  if (adventure.type === 'main') {
    return 'Everyone in this campaign can read sources on the main adventure.'
  }
  const sharing =
    adventure.visibility === 'party'
      ? ' The party can read it too while this adventure is shared.'
      : ''
  return acceptedParticipants(adventure).length > 1
    ? `Everyone in this adventure can read the source.${sharing}`
    : `Only you can read the source.${sharing}`
}

/** What a source changed, in words: "Changed: status, next step. 2 objectives added." */
export function appliedSummary(record: Pick<HandoffRecord, 'applied' | 'change_count'>) {
  const { applied } = record
  if (record.change_count === 0) return 'Kept as a source only. No changes applied.'
  const parts: string[] = []
  if (applied.fields.length > 0) {
    parts.push(
      `Changed ${applied.fields
        .map((field) => (detailLabels[field as DetailField] ?? field).toLowerCase())
        .join(', ')}.`,
    )
  }
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
  if (applied.objectives_added > 0) {
    parts.push(`${plural(applied.objectives_added, 'objective')} added.`)
  }
  if (applied.objectives_changed > 0) {
    parts.push(`${plural(applied.objectives_changed, 'objective')} changed.`)
  }
  if (applied.update) parts.push('1 progress update posted.')
  return parts.join(' ')
}

/** Who will read the source of an adventure that does not exist yet (new mode). */
export function newSourceAudience(type: AdventureType) {
  return type === 'main'
    ? 'Everyone in this campaign can read sources on the main adventure.'
    : 'Only you can read the source. A new personal or side adventure starts private.'
}
