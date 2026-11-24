import { hitDieSizes, type ResourceValues, resetRules } from './characterTypes'
import { normalizeCondition } from './resourceRules'

/** Mirrors the database CHECK constraints and RPC bounds (M04 plan §2, §4). */
export const resourceLimits = {
  name: 60,
  maximum: 999,
  resources: 40,
  conditions: 20,
  condition: 40,
  concentration: 80,
  exhaustion: 6,
  hpAmount: 9999,
} as const

// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u001f\u007f-\u009f]/

export type ResourceErrors = Partial<
  Record<'name' | 'slot_level' | 'die' | 'maximum' | 'current' | 'reset', string>
>

const messages = {
  name: 'Enter a name of up to 60 characters.',
  slot_level: 'Spell slot level must be from 1 to 9.',
  die: 'Choose d6, d8, d10, or d12.',
  maximum: 'Maximum must be a whole number from 0 to 999.',
  current: 'Current must be a whole number from 0 up to the maximum.',
  reset: 'Choose when this refills.',
}

/** Per-field errors for a tracker; an empty object means valid. */
export function validateResourceValues(values: ResourceValues): ResourceErrors {
  const errors: ResourceErrors = {}
  const name = values.name?.trim() ?? ''
  const nameOk = name.length >= 1 && name.length <= resourceLimits.name && !controls.test(name)
  if (values.kind === 'tracker' ? !nameOk : name !== '' && !nameOk) errors.name = messages.name
  if (values.kind === 'spell_slots') {
    if (
      values.slot_level === null ||
      !Number.isInteger(values.slot_level) ||
      values.slot_level < 1 ||
      values.slot_level > 9
    ) {
      errors.slot_level = messages.slot_level
    }
  }
  if (values.kind === 'hit_dice') {
    if (!(hitDieSizes as readonly (number | null)[]).includes(values.die)) {
      errors.die = messages.die
    }
  }
  const maximumOk =
    Number.isInteger(values.maximum) &&
    values.maximum >= 0 &&
    values.maximum <= resourceLimits.maximum
  if (!maximumOk) errors.maximum = messages.maximum
  if (
    !Number.isInteger(values.current) ||
    values.current < 0 ||
    (maximumOk && values.current > values.maximum)
  ) {
    errors.current = messages.current
  }
  if (!(resetRules as readonly string[]).includes(values.reset)) errors.reset = messages.reset
  return errors
}

/** Null when the text can be added as a condition, else the reason. */
export function validateCondition(text: string, existing: readonly string[]): string | null {
  const stored = normalizeCondition(text)
  if (stored === '') return 'Enter a condition.'
  if (stored.length > resourceLimits.condition || controls.test(stored)) {
    return 'Conditions can be up to 40 characters.'
  }
  if (existing.some((entry) => entry.toLowerCase() === stored.toLowerCase())) {
    return 'That condition is already on the list.'
  }
  if (existing.length >= resourceLimits.conditions) {
    return 'A character can have up to 20 conditions.'
  }
  return null
}

/** Null when the text can be the concentration spell (empty clears it), else the reason. */
export function validateConcentration(text: string): string | null {
  const value = text.trim()
  if (value.length > resourceLimits.concentration || controls.test(value)) {
    return 'Spell names can be up to 80 characters.'
  }
  return null
}

/** A typed damage, healing, or temporary HP amount, or null when it is not 1 to 9,999. */
export function parseHpAmount(text: string): number | null {
  const value = text.trim()
  if (!/^\d{1,4}$/.test(value)) return null
  const amount = Number(value)
  return amount >= 1 && amount <= resourceLimits.hpAmount ? amount : null
}
