import type { PackImportResult } from './craftingTypes'

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
