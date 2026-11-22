import { d20Spec } from '../dice/diceSpecs'
import type { SheetRoll } from '../dice/RollButton'
import { attackRollSpec, damageSpec } from '../dice/diceText'
import {
  abilityLabels,
  abilityModifier,
  initiativeBonus,
  savingThrowBonus,
  skillBonus,
  skillLabels,
} from './characterSheetRules'
import type { AbilityKey, CharacterAttack, CharacterSheetBody, SkillKey } from './characterTypes'

/** What each number on a sheet rolls (M03.7 §6.2). The modifiers come from the sheet's own rules. */

export function abilityCheckRoll(
  body: CharacterSheetBody,
  ability: AbilityKey,
  characterId: string,
): SheetRoll {
  return {
    label: `${abilityLabels[ability]} check`,
    spec: d20Spec(abilityModifier(body.abilities[ability])),
    source: 'ability',
    characterId,
  }
}

export function savingThrowRoll(
  body: CharacterSheetBody,
  level: number,
  ability: AbilityKey,
  characterId: string,
): SheetRoll {
  return {
    label: `${abilityLabels[ability]} save`,
    spec: d20Spec(savingThrowBonus(body, level, ability)),
    source: 'save',
    characterId,
  }
}

export function skillRoll(
  body: CharacterSheetBody,
  level: number,
  skill: SkillKey,
  characterId: string,
): SheetRoll {
  return {
    label: `${skillLabels[skill]} check`,
    spec: d20Spec(skillBonus(body, level, skill)),
    source: 'skill',
    characterId,
  }
}

export function initiativeRoll(body: CharacterSheetBody, characterId: string): SheetRoll {
  return {
    label: 'Initiative',
    spec: d20Spec(initiativeBonus(body)),
    source: 'initiative',
    characterId,
  }
}

/** "Longsword attack", or just "Attack" for an unnamed one. */
const named = (attack: CharacterAttack, noun: string) =>
  attack.name.trim() ? `${attack.name.trim()} ${noun}` : `${noun[0].toUpperCase()}${noun.slice(1)}`

/** The damage of an attack, labelled with what it is ("Longsword damage — slashing + fire"), or null. */
export function attackDamageRoll(attack: CharacterAttack, characterId: string): SheetRoll | null {
  const damage = damageSpec(attack.damage)
  if (!damage) return null
  const kinds = damage.segments.map((segment) => segment.label).filter(Boolean)
  const detail = kinds.length > 0 ? ` — ${kinds.join(' + ')}` : ''
  return {
    label: `${named(attack, 'damage')}${detail}`,
    spec: damage.spec,
    source: 'damage',
    characterId,
  }
}

/**
 * The to-hit roll of an attack, or null when its bonus isn't a plain number. With damage it
 * carries that damage, so a natural 20 can offer critical damage (D9).
 */
export function attackHitRoll(attack: CharacterAttack, characterId: string): SheetRoll | null {
  const spec = attackRollSpec(attack.bonus)
  if (!spec) return null
  const damage = attackDamageRoll(attack, characterId)
  return {
    label: named(attack, 'attack'),
    spec,
    source: 'attack',
    characterId,
    critical: damage ? { label: damage.label, spec: damage.spec } : undefined,
  }
}
