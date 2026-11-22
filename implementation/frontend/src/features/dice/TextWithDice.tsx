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
}: {
  text: string
  context?: string
  characterId?: string | null
}) {
  const segments = useMemo(() => splitDice(text), [text])
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
