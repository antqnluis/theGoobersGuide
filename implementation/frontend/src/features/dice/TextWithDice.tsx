import { useMemo } from 'react'
import { splitDice } from './diceText'
import { RollChip } from './RollChip'

/**
 * Text with its dice notation turned into roll chips (M03.7 §5.3). The words are untouched and
 * nothing is rewritten in storage: `2d6 fire` reads the same, with `2d6` now a button.
 */
export function DiceText({
  text,
  context,
  characterId,
  rollable = true,
}: {
  text: string
  context?: string
  characterId?: string | null
  /** False on text you may read but not roll from (another player's sheet): plain words. */
  rollable?: boolean
}) {
  const segments = useMemo(() => splitDice(text), [text])
  if (!rollable) return <>{text}</>
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <RollChip
            characterId={characterId}
            context={context}
            key={index}
            spec={segment.spec}
            text={segment.text}
          />
        ),
      )}
    </>
  )
}
