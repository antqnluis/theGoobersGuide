import { useEffect, useRef } from 'react'
import type { CharacterAction } from './useCharacterActions'
import { PixelIcon } from './PixelIcon'
import type { CharacterStatus, CharacterSummary, SheetVisibility } from './characterTypes'

/** The one inline confirmation open at a time in the tent. */
export type CharacterConfirmation = {
  type: 'status' | 'delete'
  characterId: string
  /** The status a `status` confirmation would apply. */
  status?: CharacterStatus
}

type CharacterStatusControlsProps = {
  character: CharacterSummary
  confirmation: CharacterConfirmation | null
  onConfirmationChange: (confirmation: CharacterConfirmation | null) => void
  pendingAction: CharacterAction | null
  pendingCharacterId: string | null
  onChangeStatus: (status: CharacterStatus) => void
  onChangeParty: (inParty: boolean) => void
  onChangeVisibility: (visibility: SheetVisibility) => void
  onDelete: () => void
  /**
   * `everyday` is sharing and the party; `lifecycle` is retiring, dying, returning, and
   * deleting, with their confirmations. `all` shows both, with a confirmation replacing them.
   */
  part?: 'all' | 'everyday' | 'lifecycle'
}

const statusCopy: Record<
  CharacterStatus,
  { trigger: string; confirm: (name: string) => string; yes: string; busy: string }
> = {
  retired: {
    trigger: 'Retire',
    confirm: (name) =>
      `Retire ${name}? They'll leave the party and be kept as history. You can return them to active later.`,
    yes: 'Yes, retire',
    busy: 'Retiring…',
  },
  deceased: {
    trigger: 'Mark deceased',
    confirm: (name) =>
      `Mark ${name} as deceased? They'll leave the party and be kept as history. You can return them to active later.`,
    yes: 'Yes, mark deceased',
    busy: 'Saving…',
  },
  active: {
    trigger: 'Return to active',
    confirm: (name) => `Return ${name} to active? They won't rejoin the party automatically.`,
    yes: 'Yes, return to active',
    busy: 'Saving…',
  },
}

/** Party, sharing, status, and deletion for one of the player's own characters. */
export function CharacterStatusControls({
  character,
  confirmation,
  onConfirmationChange,
  pendingAction,
  pendingCharacterId,
  onChangeStatus,
  onChangeParty,
  onChangeVisibility,
  onDelete,
  part = 'all',
}: CharacterStatusControlsProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<string | null>(null)
  const busy = pendingAction !== null && pendingCharacterId === character.id
  const open = confirmation?.characterId === character.id ? confirmation : null
  const name = character.name

  // Cancelling returns focus to the control that opened the confirmation.
  useEffect(() => {
    if (open) return
    const key = restoreFocusRef.current
    restoreFocusRef.current = null
    if (key) {
      rootRef.current?.querySelector<HTMLElement>(`[data-character-trigger="${key}"]`)?.focus()
    }
  }, [open])

  function cancel(key: string) {
    restoreFocusRef.current = key
    onConfirmationChange(null)
  }

  function ask(next: CharacterConfirmation) {
    onConfirmationChange(next)
  }

  const statusTargets = (
    {
      active: ['retired', 'deceased'],
      retired: ['active', 'deceased'],
      deceased: ['active', 'retired'],
    } satisfies Record<CharacterStatus, CharacterStatus[]>
  )[character.status]
  const statusLabel = (target: CharacterStatus) =>
    character.status === 'deceased' && target === 'retired'
      ? 'Mark retired'
      : statusCopy[target].trigger

  const showEveryday = part !== 'lifecycle'
  const showLifecycle = part !== 'everyday'

  if (showLifecycle && open?.type === 'status' && open.status) {
    const copy = statusCopy[open.status]
    return (
      <div ref={rootRef}>
        <div
          aria-label={`Confirm: ${statusLabel(open.status)}`}
          className="journal-confirm"
          role="group"
        >
          <p>{renderBold(copy.confirm(name), name)}</p>
          <div className="journal-actions">
            <button
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={busy}
              onClick={() => onChangeStatus(open.status!)}
              type="button"
            >
              {busy ? copy.busy : copy.yes}
            </button>
            <button
              className="journal-button journal-button--secondary"
              disabled={busy}
              onClick={() => cancel(`status-${open.status}`)}
              type="button"
            >
              Keep {name} {character.status}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (showLifecycle && open?.type === 'delete') {
    return (
      <div ref={rootRef}>
        <div aria-label="Confirm character deletion" className="journal-confirm" role="group">
          <p>
            Delete <strong>{name}</strong> permanently? Their sheet will be removed and this can't
            be undone. To keep them as history, retire them instead.
          </p>
          <div className="journal-actions">
            <button
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={busy}
              onClick={onDelete}
              type="button"
            >
              {busy && pendingAction === 'delete' ? 'Deleting…' : 'Yes, delete character'}
            </button>
            <button
              className="journal-button journal-button--secondary"
              disabled={busy}
              onClick={() => cancel('delete')}
              type="button"
            >
              Keep {name}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const everyday = (
    <div className="character-controls__everyday">
      <div className="journal-check">
        <input
          checked={character.sheet_visibility === 'campaign'}
          disabled={busy}
          id={`character-share-${character.id}`}
          onChange={(event) => onChangeVisibility(event.target.checked ? 'campaign' : 'private')}
          type="checkbox"
        />
        <label htmlFor={`character-share-${character.id}`}>Share sheet with campaign members</label>
      </div>
      {character.status === 'active' && (
        <button
          className="journal-button journal-button--secondary"
          disabled={busy}
          onClick={() => onChangeParty(!character.in_party)}
          type="button"
        >
          <PixelIcon name={character.in_party ? 'tent' : 'lantern'} />
          {busy && pendingAction === 'party'
            ? 'Saving…'
            : character.in_party
              ? 'Leave the party'
              : 'Join the party'}
        </button>
      )}
    </div>
  )

  const lifecycle = (
    <div className="character-controls__lifecycle">
      <p className="journal-eyebrow">Chronicle</p>
      <div className="journal-actions">
        {statusTargets.map((target) => (
          <button
            className="journal-button journal-button--secondary"
            data-character-trigger={`status-${target}`}
            disabled={busy}
            key={target}
            onClick={() => ask({ type: 'status', characterId: character.id, status: target })}
            type="button"
          >
            <PixelIcon
              name={target === 'active' ? 'star' : target === 'retired' ? 'flag' : 'grave'}
            />
            {statusLabel(target)}
          </button>
        ))}
        <button
          className="journal-button journal-button--danger"
          data-character-trigger="delete"
          disabled={busy}
          onClick={() => ask({ type: 'delete', characterId: character.id })}
          type="button"
        >
          Delete character
        </button>
      </div>
    </div>
  )

  return (
    <div className="character-controls" data-part={part} ref={rootRef}>
      {showEveryday && everyday}
      {showLifecycle && lifecycle}
    </div>
  )
}

/** Bolds the first occurrence of the character's name in a confirmation sentence. */
function renderBold(sentence: string, name: string) {
  const index = sentence.indexOf(name)
  if (index < 0) return sentence
  return (
    <>
      {sentence.slice(0, index)}
      <strong>{name}</strong>
      {sentence.slice(index + name.length)}
    </>
  )
}
