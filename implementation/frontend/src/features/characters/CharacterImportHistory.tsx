import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { characterImportsOptions } from './characterQueries'

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * A character's import history (M03.8 D10): when it was imported, as new or as an update,
 * from what source, and how many changes. It is read only where the sheet is readable, and is
 * fetched when the section is first opened.
 */
export function CharacterImportHistory({
  characterId,
  userId,
}: {
  characterId: string
  userId: string
}) {
  const [opened, setOpened] = useState(false)
  const query = useQuery(characterImportsOptions(characterId, userId, opened))

  return (
    <details
      className="import-history"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) setOpened(true)
      }}
    >
      <summary>Import history</summary>
      {query.isPending && opened && (
        <p className="journal-status" role="status">
          Loading import history…
        </p>
      )}
      {query.isError && (
        <div className="journal-status journal-status--error" role="alert">
          <p>The import history could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={() => query.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {query.isSuccess && query.data.length === 0 && (
        <p className="import-history__empty">Never imported.</p>
      )}
      {query.isSuccess && query.data.length > 0 && (
        <ul className="import-history__list">
          {query.data.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.kind === 'new' ? 'Imported as new' : 'Updated from import'}</strong>
              <small>
                <time dateTime={entry.imported_at}>
                  {dateFormat.format(new Date(entry.imported_at))}
                </time>
                {' · '}
                {entry.source_label ?? 'Pasted text'}
                {' · '}
                {entry.change_count} {entry.change_count === 1 ? 'change' : 'changes'}
              </small>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
