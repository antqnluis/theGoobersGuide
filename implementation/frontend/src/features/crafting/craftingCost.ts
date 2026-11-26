import type { ItemRarity } from '../characters/characterTypes'
import { formatPurseValue } from '../characters/inventoryRules'
import { gpToCp, rarityGuidelines } from './craftingPack'

/**
 * The arithmetic of a vision's costs (M04 plan W9, W18), in one place. Every amount is whole
 * copper, so sums are exact. Key materials count like every other line.
 */

export type CostLine = {
  /** The value of one unit, in copper. */
  value_cp: number
  /** How many the recipe needs. */
  need: number
  /** How many the character holds now. */
  have: number
}

/** What a line's whole quantity is worth. */
export const lineCost = (line: Pick<CostLine, 'value_cp' | 'need'>) => line.value_cp * line.need

/** How many of a line are still missing (never negative). */
export const missingCount = (line: Pick<CostLine, 'need' | 'have'>) =>
  Math.max(0, line.need - line.have)

/** The value of the materials still to be found. */
export const missingCost = (line: CostLine) => line.value_cp * missingCount(line)

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** The materials' value, key materials included. */
export const materialsSubtotal = (lines: readonly CostLine[]) => sum(lines.map(lineCost))

/** The materials plus the crafting cost. */
export const totalCost = (lines: readonly CostLine[], craftingCostCp: number) =>
  materialsSubtotal(lines) + craftingCostCp

/** The missing materials' value plus the crafting cost. */
export const stillToPay = (lines: readonly CostLine[], craftingCostCp: number) =>
  sum(lines.map(missingCost)) + craftingCostCp

/** Copper as whole coins, "1 gp, 5 sp and 3 cp"; zero reads "0 gp". */
export const formatCopper = (copper: number) => formatPurseValue({ cp: copper, sp: 0, gp: 0 })

export type CostGuideline = { costCp: number; workdays: number }

/**
 * The 2024 DMG crafting guideline for a rarity: consumables cost half and take half the time.
 * Artifacts have none.
 */
export function guidelineFor(rarity: ItemRarity, consumable: boolean): CostGuideline | null {
  const base = rarityGuidelines[rarity]
  if (!base) return null
  return consumable
    ? { costCp: gpToCp(base.costGp) / 2, workdays: Math.ceil(base.workdays / 2) }
    : { costCp: gpToCp(base.costGp), workdays: base.workdays }
}

/** "Guideline for an uncommon item: 200 gp, 10 workdays." */
export function describeGuideline(
  rarity: ItemRarity,
  consumable: boolean,
  rarityLabel: string,
): string | null {
  const guideline = guidelineFor(rarity, consumable)
  if (!guideline) return null
  const days = guideline.workdays === 1 ? '1 workday' : `${guideline.workdays} workdays`
  return `Guideline for ${consumable ? 'a consumable of ' : 'an item of '}${rarityLabel.toLowerCase()} rarity: ${formatCopper(guideline.costCp)}, ${days}.`
}
