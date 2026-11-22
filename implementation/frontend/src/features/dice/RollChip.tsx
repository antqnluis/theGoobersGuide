import { D20Icon } from './DiceIcons'
import { RollButton } from './RollButton'
import type { RollSpec } from './diceTypes'

/** Dice notation inside a line of text, as a button that rolls it as yourself (D6). */
export function RollChip({
  text,
  spec,
  context,
  characterId,
}: {
  /** The notation exactly as written, `2d6 + 3`. */
  text: string
  spec: RollSpec
  /** What the text belongs to ("Fireball", an item or an adventure), so the log reads as a story. */
  context?: string
  /** Set only on your own sheet's text; other text rolls as you with no character. */
  characterId?: string | null
}) {
  const normalised = text.replace(/\s+/g, ' ').trim()
  return (
    <RollButton
      ariaLabel={`Roll ${normalised}${context ? ` for ${context}` : ''}`}
      roll={{
        label: context ? `${context} — ${normalised}` : normalised,
        spec,
        source: 'text',
        characterId: characterId ?? null,
      }}
      variant="chip"
    >
      <D20Icon size={13} />
      {text}
    </RollButton>
  )
}
