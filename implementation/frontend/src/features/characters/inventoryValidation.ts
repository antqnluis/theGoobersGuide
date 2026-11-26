import {
  denominations,
  type CharacterItemInput,
  type CharacterItemValues,
  type CharacterPurse,
  type Denomination,
} from './characterTypes'

/** Mirrors the database CHECK constraints and RPC bounds (M03.3 plan §2.1, §2.2, §4, §5.2). */
export const inventoryLimits = {
  name: 80,
  description: 2000,
  quantityMax: 9999,
  weightMax: 99_999.99,
  items: 200,
  coinMax: 9_999_999,
} as const

// eslint-disable-next-line no-control-regex
const nameControls = /[\u0000-\u001f\u007f-\u009f]/
// Newlines, tabs, and carriage returns are allowed in descriptions; other controls are not.
// eslint-disable-next-line no-control-regex
const descriptionControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export type ItemErrors = Partial<Record<'name' | 'quantity' | 'weight' | 'description', string>>

const messages = {
  name: 'Enter a name of up to 80 characters.',
  quantity: 'Quantity must be a whole number from 0 to 9,999.',
  weight: 'Weight must be a number from 0 to 99,999.99 with at most two decimals, or empty.',
  description: 'Descriptions can be up to 2,000 characters.',
}

// Digits with at most two decimals; the leading digits are optional so ".5" works.
const weightPattern = /^(\d{1,5})?(\.\d{1,2})?$/

/** The weight as a number, null when empty, or undefined when it cannot be one. */
function parseWeight(text: string): number | null | undefined {
  const value = text.trim()
  if (value === '') return null
  if (!weightPattern.test(value) || value === '.') return undefined
  const weight = Number(value)
  return weight <= inventoryLimits.weightMax ? weight : undefined
}

/** Per-field errors for the item form; an empty object means valid. */
export function validateItemInput(input: CharacterItemInput): ItemErrors {
  const errors: ItemErrors = {}
  const name = input.name.trim()
  if (name.length < 1 || name.length > inventoryLimits.name || nameControls.test(name)) {
    errors.name = messages.name
  }
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 0 ||
    input.quantity > inventoryLimits.quantityMax
  ) {
    errors.quantity = messages.quantity
  }
  if (parseWeight(input.weight) === undefined) errors.weight = messages.weight
  const description = input.description.trim()
  if (description.length > inventoryLimits.description || descriptionControls.test(description)) {
    errors.description = messages.description
  }
  return errors
}

/** Trims text and stores empty weight and description as null, as the database expects. */
export function normalizeItemInput(input: CharacterItemInput): CharacterItemValues {
  return {
    name: input.name.trim(),
    quantity: input.quantity,
    weight: parseWeight(input.weight) ?? null,
    description: input.description.trim() || null,
    rarity: input.rarity,
    equipped: input.equipped,
    attuned: input.attuned,
    ...(input.crafting_item_id === undefined ? {} : { crafting_item_id: input.crafting_item_id }),
  }
}

export type CoinInput = Partial<Record<Denomination, string>>
export type CoinErrors = Partial<Record<Denomination, string>> & { form?: string }

/**
 * Reads the three coin fields (blank counts as zero). Each must be a whole number up to
 * 9,999,999 and at least one must be above zero. `amounts` is only meaningful when
 * `errors` is empty.
 */
export function parseCoinInput(input: CoinInput): { amounts: CharacterPurse; errors: CoinErrors } {
  const amounts: CharacterPurse = { cp: 0, sp: 0, gp: 0 }
  const errors: CoinErrors = {}
  for (const coin of denominations) {
    const text = (input[coin] ?? '').trim()
    if (text === '') continue
    const value = /^\d{1,7}$/.test(text) ? Number(text) : NaN
    if (Number.isNaN(value) || value > inventoryLimits.coinMax) {
      errors[coin] = 'Enter a whole number up to 9,999,999.'
    } else {
      amounts[coin] = value
    }
  }
  if (Object.keys(errors).length === 0 && denominations.every((coin) => amounts[coin] === 0)) {
    errors.form = 'Enter an amount for at least one coin.'
  }
  return { amounts, errors }
}
