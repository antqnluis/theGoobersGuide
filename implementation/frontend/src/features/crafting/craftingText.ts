import type { LongRestResult, PackImportResult } from './craftingTypes'

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`

/** What an import did, as the toast says it. */
export function describeImport(result: PackImportResult, libraryName: string) {
  const parts = [
    result.items_added + result.items_updated > 0 &&
      plural(result.items_added + result.items_updated, 'item'),
    result.recipes_added + result.recipes_updated > 0 &&
      plural(result.recipes_added + result.recipes_updated, 'recipe'),
    result.items_removed + result.recipes_removed > 0 &&
      `${plural(result.items_removed + result.recipes_removed, 'removal')}`,
  ].filter(Boolean) as string[]
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
      : (parts[0] ?? 'nothing')
  return `Imported ${list} into ${libraryName}`
}

/** The toast after a long rest. The count is of characters covered, never of anything they hold. */
export function describeRest(result: Pick<LongRestResult, 'character_count' | 'library_count'>) {
  if (result.library_count === 0) {
    return 'The party rests, but no library is turned on, so nothing stirs.'
  }
  if (result.character_count === 0)
    return 'The party rests. No active characters to receive visions.'
  return `The party rests. Visions come to ${plural(result.character_count, 'character')}.`
}

/** "Nov 26, 2026, 9:04 PM", the way the guide dates a rest. */
export function formatRestTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
