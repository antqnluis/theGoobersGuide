import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { characterAdventureCountOptions } from '../adventures/adventureQueries'
import { CharacterBadges, CharacterMedallion } from './CharacterBadges'
import { CharacterForm } from './CharacterForm'
import { CharacterImportDialog } from './CharacterImportDialog'
import { CharacterPortraitEditor } from './CharacterPortraitEditor'
import { CharacterSheet } from './CharacterSheet'
import { CharacterStatusControls, type CharacterConfirmation } from './CharacterStatusControls'
import { describeCharacter } from './characterDisplay'
import type { CharacterDetails, CharacterStatus, CharacterSummary } from './characterTypes'
import { PixelIcon } from './PixelIcon'
import { sameTentView, tentDirection, turnPage } from './tentTransition'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import type { useCharacterActions } from './useCharacterActions'
import './characters.css'

/** Which screen of the tent is showing. Owned by the workspace so closing the camp resets it. */
export type TentView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'character'; id: string }
  /** Everything editable about a character: details, vitals, and the sheet. */
  | { type: 'edit'; id: string }

type CharacterTentProps = {
  campaignId: string
  userId: string
  status: 'pending' | 'error' | 'success'
  /** Every character the member may see; the tent shows only their own. */
  characters: readonly CharacterSummary[]
  onRetry: () => void
  view: TentView
  onViewChange: (view: TentView) => void
  confirmation: CharacterConfirmation | null
  onConfirmationChange: (confirmation: CharacterConfirmation | null) => void
  actions: ReturnType<typeof useCharacterActions>
  /** A brief confirmation for the player, shown as a toast. */
  onNotice: (notice: string) => void
  /** Reports whether the open form or sheet holds edits that leaving would lose. */
  onDirtyChange?: (dirty: boolean) => void
}

const statusNotice: Record<CharacterStatus, (name: string) => string> = {
  active: (name) => `${name} is active again.`,
  retired: (name) => `${name} retired.`,
  deceased: (name) => `${name} is marked deceased.`,
}

/** The "My characters" destination at the tent: create, edit, sheet, status, party, sharing, delete. */
export function CharacterTent({
  campaignId,
  userId,
  status,
  characters,
  onRetry,
  view,
  onViewChange,
  confirmation,
  onConfirmationChange,
  actions,
  onNotice,
  onDirtyChange,
}: CharacterTentProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const subRef = useRef<HTMLHeadingElement>(null)
  const activeRef = useRef<HTMLHeadingElement>(null)
  const focusNewRef = useRef(false)
  const firstRenderRef = useRef(true)
  // The details form and the sheet editor are separate saves on one screen.
  const [dirtyParts, setDirtyParts] = useState({ form: false, sheet: false })
  const dirty = dirtyParts.form || dirtyParts.sheet
  const [pendingNav, setPendingNav] = useState<TentView | null>(null)
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const mine = characters.filter((character) => character.owner_id === userId)
  const active = mine.find((character) => character.status === 'active')
  const history = mine
    .filter((character) => character.status !== 'active')
    .toSorted((a, b) => b.status_changed_at.localeCompare(a.status_changed_at))
  const selectedId = view.type === 'list' || view.type === 'create' ? null : view.id
  const selected = selectedId ? mine.find((character) => character.id === selectedId) : undefined
  // A character that vanished (deleted elsewhere, owner left) falls back to the list.
  const current: TentView = selectedId && !selected ? { type: 'list' } : view
  const pendingAction = actions.pendingAction
  const busy = pendingAction !== null
  // Deleting a character deletes the adventures only it was in; the count is read once the
  // delete confirmation is open, so the sentence is ready when it shows.
  const adventureCount = useQuery(
    characterAdventureCountOptions(
      selected?.id ?? '',
      userId,
      Boolean(selected) &&
        confirmation?.type === 'delete' &&
        confirmation.characterId === selected?.id,
    ),
  )

  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  const reportDirty = (part: 'form' | 'sheet') => (next: boolean) =>
    setDirtyParts((current) => (current[part] === next ? current : { ...current, [part]: next }))
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])

  // Closing the browser tab with edits open asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Moves focus to the new screen's heading, after the first render.
  const viewKey = `${current.type}:${selectedId ?? ''}`
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    // The forms focus their own first field.
    if (current.type === 'create') return
    const target = focusNewRef.current ? activeRef.current : (subRef.current ?? titleRef.current)
    focusNewRef.current = false
    target?.focus()
    // `current` is derived from `viewKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  /** Goes to another screen; unsaved edits ask first unless the caller just saved or removed them. */
  function go(next: TentView, options: { force?: boolean } = {}) {
    if (dirty && !options.force) {
      setPendingNav(next)
      return
    }
    const apply = () => {
      actions.clearError()
      onConfirmationChange(null)
      onViewChange(next)
    }
    if (sameTentView(current, next)) apply()
    else turnPage(tentDirection(current, next), apply)
  }

  async function create(details: CharacterDetails, inParty: boolean) {
    const ok = await actions.create(details, inParty)
    if (ok) {
      onNotice('Character created.')
      focusNewRef.current = true
      go({ type: 'list' }, { force: true })
    }
    return ok
  }

  async function saveDetails(character: CharacterSummary, details: CharacterDetails) {
    const ok = await actions.saveDetails(character.id, details)
    if (ok) {
      onNotice('Character saved.')
    }
    return ok
  }

  async function changeStatus(character: CharacterSummary, next: CharacterStatus) {
    if (await actions.changeStatus(character.id, next)) {
      onConfirmationChange(null)
      onNotice(statusNotice[next](character.name))
    }
  }

  async function changeParty(character: CharacterSummary, inParty: boolean) {
    if (await actions.changeParty(character.id, inParty)) {
      onNotice(
        inParty ? `${character.name} joined the party.` : `${character.name} left the party.`,
      )
    }
  }

  async function changeVisibility(character: CharacterSummary, visibility: 'private' | 'campaign') {
    if (await actions.changeVisibility(character.id, visibility)) {
      onNotice(
        visibility === 'campaign'
          ? `${character.name}'s sheet is shared with campaign members.`
          : `${character.name}'s sheet is private.`,
      )
    }
  }

  async function remove(character: CharacterSummary) {
    if (await actions.remove(character.id, character.portrait_path)) {
      onNotice('Character deleted.')
      go({ type: 'list' }, { force: true })
    }
  }

  const sheetOpen = status === 'success' && current.type === 'character' && selected
  const editOpen = status === 'success' && current.type === 'edit' && selected
  const errorAlert = actions.error && (
    <p className="journal-alert" role="alert">
      <PixelIcon name="flame" />
      {actions.error}
    </p>
  )

  const controls = selected && {
    adventureCount: adventureCount.data,
    character: selected,
    confirmation,
    onChangeParty: (inParty: boolean) => changeParty(selected, inParty),
    onChangeStatus: (next: CharacterStatus) => changeStatus(selected, next),
    onChangeVisibility: (visibility: 'private' | 'campaign') =>
      changeVisibility(selected, visibility),
    onConfirmationChange,
    onDelete: () => remove(selected),
    pendingAction,
    pendingCharacterId: actions.pendingCharacterId,
  }

  return (
    <div className="character-tent" data-view={current.type}>
      <p className="journal-eyebrow tent-eyebrow">
        <PixelIcon name="tent" />
        The tent
      </p>
      <h2 id="camp-characters-heading" ref={titleRef} tabIndex={-1}>
        My characters
      </h2>

      {!sheetOpen && !editOpen && errorAlert}

      {status === 'pending' && (
        <p className="journal-status" role="status">
          Loading your characters…
        </p>
      )}
      {status === 'error' && (
        <div className="journal-status journal-status--error" role="alert">
          <p>Your characters could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'success' && current.type === 'create' && (
        <section aria-labelledby="character-create-heading" className="tent-form tent-turn">
          <h3 id="character-create-heading" ref={subRef} tabIndex={-1}>
            Create a character
          </h3>
          <p className="tent-form__lede">
            Give your adventurer a name. You can fill in the full sheet once they have a bedroll.
          </p>
          <CharacterForm
            isPending={pendingAction === 'create'}
            mode="create"
            onCancel={() => go({ type: 'list' })}
            onDirtyChange={reportDirty('form')}
            onSubmit={create}
          />
        </section>
      )}

      {sheetOpen && controls && (
        <section aria-labelledby="character-detail-heading" className="folio tent-turn">
          <header className="folio-head">
            <button
              className="journal-button journal-button--ghost folio-head__back"
              disabled={busy}
              onClick={() => go({ type: 'list' })}
              type="button"
            >
              Back to my characters
            </button>
            <div className="folio-head__identity">
              <CharacterMedallion character={selected} size={72} />
              <div className="folio-head__names">
                <h3 id="character-detail-heading" ref={subRef} tabIndex={-1}>
                  {selected.name}
                </h3>
                <p className="folio-head__meta">
                  {describeCharacter(selected)}
                  {selected.background ? ` · ${selected.background}` : ''}
                  {selected.subclass ? ` · ${selected.subclass}` : ''}
                </p>
                <CharacterBadges character={selected} showSharing />
              </div>
            </div>
            <div className="folio-head__tools">
              <button
                className="journal-button journal-button--secondary"
                disabled={busy}
                onClick={() => go({ type: 'edit', id: selected.id })}
                type="button"
              >
                Edit character
              </button>
              <CharacterStatusControls {...controls} part="everyday" />
            </div>
          </header>

          <CharacterSheet
            actions={actions}
            character={selected}
            dock={dock}
            onDirtyChange={reportDirty('sheet')}
            onNotice={onNotice}
            quickHp
            readOnly
            userId={userId}
          />

          <footer className="folio-foot">
            <CharacterStatusControls {...controls} part="lifecycle" />
          </footer>

          <div className="folio-dock">
            {errorAlert}
            <div ref={setDock} />
          </div>
        </section>
      )}

      {editOpen && (
        <section aria-labelledby="character-edit-heading" className="folio tent-turn">
          <header className="folio-head folio-head--edit">
            <button
              className="journal-button journal-button--ghost folio-head__back"
              disabled={busy}
              onClick={() => go({ type: 'character', id: selected.id })}
              type="button"
            >
              Back to character sheet
            </button>
            <div className="folio-head__identity">
              <CharacterMedallion character={selected} size={56} />
              <div className="folio-head__names">
                <h3 id="character-edit-heading" ref={subRef} tabIndex={-1}>
                  Edit {selected.name}
                </h3>
                <p className="folio-head__meta">
                  Details, vitals, abilities, skills, attacks, and notes. Each part saves on its
                  own.
                </p>
              </div>
            </div>
          </header>

          <section aria-labelledby="character-details-heading" className="folio-details">
            <h4 className="journal-section-title" id="character-details-heading">
              <PixelIcon name="quill" />
              Details
            </h4>
            <CharacterPortraitEditor actions={actions} character={selected} onNotice={onNotice} />
            <CharacterForm
              autoFocus={false}
              initial={{
                name: selected.name,
                species: selected.species ?? '',
                class_name: selected.class_name ?? '',
                subclass: selected.subclass ?? '',
                background: selected.background ?? '',
                level: selected.level,
              }}
              isPending={pendingAction === 'details'}
              mode="edit"
              onDirtyChange={reportDirty('form')}
              onSubmit={(details) => saveDetails(selected, details)}
            />
          </section>

          <CharacterSheet
            actions={actions}
            character={selected}
            dock={dock}
            onDirtyChange={reportDirty('sheet')}
            onNotice={onNotice}
            readOnly={false}
            userId={userId}
          />

          <div className="folio-dock">
            {errorAlert}
            <div ref={setDock} />
          </div>
        </section>
      )}

      {status === 'success' && current.type === 'list' && (
        <div className="tent-list tent-turn">
          {mine.length === 0 && (
            <section className="tent-empty">
              <div aria-hidden="true" className="tent-empty__scene">
                <PixelIcon name="flame" scale={5} className="tent-empty__flame" />
                <PixelIcon name="tent" scale={9} className="tent-empty__tent" />
                <PixelIcon name="lantern" scale={5} className="tent-empty__lantern" />
              </div>
              <p className="tent-empty__title">You have no character in this campaign yet.</p>
              <p className="tent-empty__hint">
                Pitch a bedroll: create an adventurer and they can sit with the party at the fire.
              </p>
              <div className="tent-actions">
                <button
                  className="journal-button"
                  onClick={() => go({ type: 'create' })}
                  type="button"
                >
                  <PixelIcon name="quill" />
                  Create a character
                </button>
                <button
                  className="journal-button journal-button--secondary"
                  onClick={() => setImportOpen(true)}
                  type="button"
                >
                  <PixelIcon name="book" />
                  Import a character
                </button>
              </div>
            </section>
          )}

          {active && (
            <section aria-labelledby="character-active-heading" className="tent-card journal-panel">
              <p className="journal-eyebrow">Active character</p>
              <div className="tent-card__body">
                <CharacterMedallion character={active} />
                <div className="tent-card__names">
                  <h3 id="character-active-heading" ref={activeRef} tabIndex={-1}>
                    {active.name}
                  </h3>
                  <p className="tent-card__meta">{describeCharacter(active)}</p>
                  <CharacterBadges character={active} />
                </div>
              </div>
              <button
                className="journal-button"
                onClick={() => go({ type: 'character', id: active.id })}
                type="button"
              >
                Open {active.name}
              </button>
            </section>
          )}

          {active ? (
            <p className="tent-note">
              <PixelIcon name="lock" />
              <span>
                Retire or mark {active.name} deceased before creating or importing another
                character. To bring in later changes instead, open {active.name} and choose{' '}
                <button
                  className="tent-note__link"
                  onClick={() => go({ type: 'character', id: active.id })}
                  type="button"
                >
                  Import updates
                </button>
                .
              </span>
            </p>
          ) : (
            mine.length > 0 && (
              <section className="tent-blank journal-panel">
                <p>Your last adventurer has left the fire. Ready for a new one?</p>
                <div className="tent-actions">
                  <button
                    className="journal-button"
                    onClick={() => go({ type: 'create' })}
                    type="button"
                  >
                    <PixelIcon name="quill" />
                    Create a character
                  </button>
                  <button
                    className="journal-button journal-button--secondary"
                    onClick={() => setImportOpen(true)}
                    type="button"
                  >
                    <PixelIcon name="book" />
                    Import a character
                  </button>
                </div>
              </section>
            )
          )}

          {history.length > 0 && (
            <section aria-labelledby="character-history-heading" className="tent-history">
              <h3 className="journal-section-title" id="character-history-heading">
                <PixelIcon name="book" />
                Previous characters
              </h3>
              <ul>
                {history.map((character) => (
                  <li data-status={character.status} key={character.id}>
                    <CharacterMedallion character={character} size={44} />
                    <div className="tent-history__names">
                      <strong>{character.name}</strong>
                      <small>{describeCharacter(character)}</small>
                      <CharacterBadges character={character} />
                    </div>
                    <button
                      aria-label={`Open ${character.name}`}
                      className="journal-button journal-button--secondary"
                      onClick={() => go({ type: 'character', id: character.id })}
                      type="button"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {importOpen && (
        <CharacterImportDialog
          campaignId={campaignId}
          onClose={() => setImportOpen(false)}
          onImported={(id) => {
            setImportOpen(false)
            onNotice('Character imported.')
            go({ type: 'character', id }, { force: true })
          }}
          userId={userId}
        />
      )}

      {pendingNav && (
        <div data-unsaved-prompt>
          <UnsavedChangesDialog
            discardLabel="Discard and go back"
            message="You have edits that haven't been saved. Going back now will discard them."
            onDiscard={() => {
              const next = pendingNav
              setPendingNav(null)
              go(next, { force: true })
            }}
            onKeep={() => setPendingNav(null)}
          />
        </div>
      )}
    </div>
  )
}
