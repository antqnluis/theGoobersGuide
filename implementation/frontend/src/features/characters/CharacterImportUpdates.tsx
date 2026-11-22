import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { characterItemsOptions } from './characterQueries'
import type { CharacterSheet, CharacterSummary } from './characterTypes'
import { CharacterUpdateReview } from './CharacterUpdateReview'

/**
 * The owner's entry to Import updates. It reads what the sheet shows, so it is disabled while
 * there are unsaved edits (the review compares against the saved sheet).
 */
export function CharacterImportUpdates({
  character,
  sheet,
  userId,
  unsaved,
  onNotice,
}: {
  character: CharacterSummary
  sheet: CharacterSheet
  userId: string
  unsaved: boolean
  onNotice?: (notice: string) => void
}) {
  const items = useQuery(characterItemsOptions(character.id, userId))
  const [open, setOpen] = useState(false)

  return (
    <div className="sheet-export">
      <button
        className="journal-button journal-button--secondary"
        disabled={unsaved || !items.data}
        onClick={() => setOpen(true)}
        type="button"
      >
        Import updates
      </button>
      {unsaved && <small>Save or cancel your edits first.</small>}
      {!unsaved && items.isError && (
        <small>The inventory could not be loaded for the comparison.</small>
      )}
      {open && items.data && (
        <CharacterUpdateReview
          current={{ character, sheet, items: items.data }}
          onApplied={(count) => {
            setOpen(false)
            onNotice?.(`Update applied: ${count} ${count === 1 ? 'change' : 'changes'} saved.`)
          }}
          onClose={() => setOpen(false)}
          userId={userId}
        />
      )}
    </div>
  )
}
