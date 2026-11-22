import type { CharacterStatus, CharacterSummary } from './characterTypes'

/** "Level 3 Elf Fighter", leaving out whatever is unset. */
export function describeCharacter(
  character: Pick<CharacterSummary, 'level' | 'species' | 'class_name'>,
) {
  return [`Level ${character.level}`, character.species, character.class_name]
    .filter(Boolean)
    .join(' ')
}

const statusVerb: Record<CharacterStatus, string> = {
  active: 'Active since',
  retired: 'Retired',
  deceased: 'Died',
}

/** "Retired 12 Mar", adding the year when it is not the current one. */
export function describeStatusDate(
  character: Pick<CharacterSummary, 'status' | 'status_changed_at'>,
  now = new Date(),
) {
  const date = new Date(character.status_changed_at)
  const sameYear = date.getFullYear() === now.getFullYear()
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
  return `${statusVerb[character.status]} ${formatted}`
}

/** The lifecycle badge text: "Active", or "Retired 12 Mar" for a character in the chronicle. */
export function describeLifecycle(
  character: Pick<CharacterSummary, 'status' | 'status_changed_at'>,
  now = new Date(),
) {
  return character.status === 'active' ? 'Active' : describeStatusDate(character, now)
}
