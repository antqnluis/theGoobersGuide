import type { CharacterItem, CharacterPurse, CharacterSheetBody } from './characterTypes'

/** Derived values are computed here and never stored (M03.3 plan §5.4). */

const round2 = (value: number) => Math.round(value * 100) / 100

/** Standard exchange: 100 cp or 10 sp to the gold piece. */
export function coinValueInGold(purse: CharacterPurse) {
  return round2(purse.cp / 100 + purse.sp / 10 + purse.gp)
}

export function formatGold(value: number) {
  return `≈ ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} gp`
}

/** Total of weight × quantity over items that have a weight. Coins are not counted (D9). */
export function carriedWeight(items: Pick<CharacterItem, 'weight' | 'quantity'>[]) {
  return round2(
    items.reduce(
      (total, item) => total + (item.weight === null ? 0 : item.weight * item.quantity),
      0,
    ),
  )
}

/** Strength score × 15 lb. */
export function carryingCapacity(body: Pick<CharacterSheetBody, 'abilities'>) {
  return body.abilities.str * 15
}

export function formatWeight(value: number) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} lb`
}

export const attunementLimit = 3

export function attunedCount(items: Pick<CharacterItem, 'attuned'>[]) {
  return items.filter((item) => item.attuned).length
}

/** A warning (never a block) above the 5e limit, so homebrew rules still work (D7). */
export function attunementWarning(items: Pick<CharacterItem, 'attuned'>[]) {
  return attunedCount(items) > attunementLimit ? 'More than 3 attuned items' : null
}

/** Equipped first, then by name, then by creation time so the order is stable (D8). */
export function sortItems<T extends Pick<CharacterItem, 'name' | 'equipped' | 'created_at'>>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.equipped) - Number(a.equipped) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
      a.created_at.localeCompare(b.created_at),
  )
}
