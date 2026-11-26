import type { LibrarySnapshot } from './craftingPack'
import type { LibraryContent, LibraryItem, LibraryRecipe } from './craftingTypes'

/** What a library holds now, in the shape the pack parser checks against. */
export function snapshotOf(content: LibraryContent): LibrarySnapshot {
  const slugOf = new Map(content.items.map((item) => [item.id, item.slug]))
  const slugFor = (id: string) => slugOf.get(id) ?? id
  return {
    items: new Map(content.items.map((item) => [item.slug, item.name])),
    recipes: new Map(
      content.recipes.map((recipe) => [
        recipe.slug,
        [slugFor(recipe.output_item_id), ...recipe.lines.map((line) => slugFor(line.item_id))],
      ]),
    ),
  }
}

export type LibraryIndex = {
  byId: ReadonlyMap<string, LibraryItem>
  /** Item ids that some recipe makes. */
  made: ReadonlySet<string>
}

export function indexLibrary(content: LibraryContent): LibraryIndex {
  return {
    byId: new Map(content.items.map((item) => [item.id, item])),
    made: new Set(content.recipes.map((recipe) => recipe.output_item_id)),
  }
}

/**
 * Key materials of a recipe that nothing explains: no recipe makes them and they have no harvest
 * data. A pack typo can leave a recipe that nobody could ever reveal (plan §11), so the browser
 * flags it for the DM.
 */
export function unsourcedKeyMaterials(recipe: LibraryRecipe, index: LibraryIndex): LibraryItem[] {
  return recipe.lines
    .filter((line) => line.role === 'key')
    .map((line) => index.byId.get(line.item_id))
    .filter((item): item is LibraryItem => item !== undefined)
    .filter((item) => !index.made.has(item.id) && item.harvest === null)
}

export type BrowserFilters = { query: string; category: string; rarity: string; tag: string }

export const noFilters: BrowserFilters = { query: '', category: '', rarity: '', tag: '' }

const matches = (text: string, query: string) => text.toLowerCase().includes(query)

export function filterItems(items: readonly LibraryItem[], filters: BrowserFilters) {
  const query = filters.query.trim().toLowerCase()
  return items.filter(
    (item) =>
      (!filters.category || item.category === filters.category) &&
      (!filters.rarity || item.rarity === filters.rarity) &&
      (!filters.tag || item.tags.includes(filters.tag)) &&
      (!query ||
        matches(item.name, query) ||
        matches(item.slug, query) ||
        item.tags.some((tag) => matches(tag, query))),
  )
}

/** Recipes by their output's name, category, rarity, and tags, or by any material's name. */
export function filterRecipes(
  recipes: readonly LibraryRecipe[],
  index: LibraryIndex,
  filters: BrowserFilters,
) {
  const query = filters.query.trim().toLowerCase()
  return recipes.filter((recipe) => {
    const output = index.byId.get(recipe.output_item_id)
    if (!output) return false
    if (filters.category && output.category !== filters.category) return false
    if (filters.rarity && output.rarity !== filters.rarity) return false
    if (filters.tag && !output.tags.includes(filters.tag)) return false
    if (!query) return true
    return (
      matches(output.name, query) ||
      matches(recipe.slug, query) ||
      recipe.lines.some((line) => {
        const material = index.byId.get(line.item_id)
        return material ? matches(material.name, query) : false
      })
    )
  })
}

export const byName = <T extends { name: string }>(rows: readonly T[]) =>
  rows.toSorted((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

/** Every tag used in the library, sorted. */
export const allTags = (items: readonly LibraryItem[]) =>
  [...new Set(items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b))
