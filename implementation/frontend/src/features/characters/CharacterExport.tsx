import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { characterItemsOptions } from './characterQueries'
import { toCharacterMarkdown } from './characterMarkdown'
import { downloadMarkdown, markdownFilename } from './characterMarkdownDownload'
import type { CharacterSheet, CharacterSummary } from './characterTypes'

/**
 * Downloads the saved character as Markdown. It reads what the sheet shows, so it is disabled
 * while there are unsaved edits (they would not be in the file).
 */
export function CharacterExport({
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
  const [failed, setFailed] = useState(false)

  function exportMarkdown() {
    if (!items.data) return
    try {
      downloadMarkdown(
        markdownFilename(character.name),
        toCharacterMarkdown(character, sheet, items.data),
      )
      setFailed(false)
      onNotice?.('Markdown downloaded.')
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="sheet-export">
      <button
        className="journal-button journal-button--secondary"
        disabled={unsaved || !items.data}
        onClick={exportMarkdown}
        type="button"
      >
        Export Markdown
      </button>
      {unsaved && <small>Save or cancel your edits first.</small>}
      {!unsaved && items.isError && (
        <small>The inventory could not be loaded for the export.</small>
      )}
      {failed && <small role="alert">The file could not be downloaded. Try again.</small>}
    </div>
  )
}
