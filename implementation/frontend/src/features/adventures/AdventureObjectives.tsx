import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { objectiveDoneLabel, objectiveProgress } from './adventureRules'
import type { AdventureObjective } from './adventureTypes'
import { handoffTag, noHandoffLabels } from './handoffLabels'
import { validateObjectiveTitle } from './adventureValidation'
import type { AdventureAction, AdventureResult } from './useAdventureActions'

/**
 * The adventure's checklist, in creation order. Any editor adds, renames, ticks, and deletes
 * (D10); a ticked objective shows who ticked it. Read-only once the adventure is archived.
 */
export function AdventureObjectives({
  editable,
  objectives,
  readOnly = false,
  onAdd,
  onRemove,
  onRename,
  onToggle,
  pendingAction,
  pendingId,
  roster,
  userId,
  handoffLabels = noHandoffLabels,
}: {
  editable: boolean
  objectives: readonly AdventureObjective[]
  /** A list with done marks instead of checkboxes: the party's view of a shared adventure (D7). */
  readOnly?: boolean
  onAdd: (title: string) => Promise<AdventureResult<unknown>>
  onRemove: (objectiveId: string) => Promise<AdventureResult<unknown>>
  onRename: (objectiveId: string, title: string) => Promise<AdventureResult<unknown>>
  onToggle: (objectiveId: string, done: boolean) => Promise<AdventureResult<unknown>>
  pendingAction: AdventureAction | null
  pendingId: string | null
  roster: readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]
  userId: string
  /** Source labels by handoff id, for "From handoff" on the rows a handoff created. */
  handoffLabels?: ReadonlyMap<string, string | null>
}) {
  const base = useId()
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<string | null>(null)
  const now = new Date()
  const progress = objectiveProgress(objectives)
  const busy = pendingAction?.startsWith('objective') ?? false

  useEffect(() => {
    if (editingId) renameRef.current?.focus()
  }, [editingId])

  // Closing the rename field returns focus to the objective's own control.
  useEffect(() => {
    if (editingId === null && restoreRef.current) {
      const target = document.querySelector<HTMLElement>(
        `[data-objective-id="${restoreRef.current}"] [data-objective-action="rename"]`,
      )
      restoreRef.current = null
      target?.focus()
    }
  }, [editingId])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const problem = validateObjectiveTitle(draft)
    setDraftError(problem)
    if (problem) {
      addRef.current?.focus()
      return
    }
    const result = await onAdd(draft.trim())
    if (result.ok) setDraft('')
    addRef.current?.focus()
  }

  async function rename(event: FormEvent, objective: AdventureObjective) {
    event.preventDefault()
    if (busy) return
    const problem = validateObjectiveTitle(renameText)
    setRenameError(problem)
    if (problem) {
      renameRef.current?.focus()
      return
    }
    if (renameText.trim() === objective.title) {
      restoreRef.current = objective.id
      setEditingId(null)
      return
    }
    const result = await onRename(objective.id, renameText.trim())
    if (result.ok || result.reason === 'unavailable') {
      restoreRef.current = result.ok ? objective.id : null
      setEditingId(null)
    }
  }

  return (
    <section aria-labelledby={`${base}-heading`} className="adventure-block">
      <h4 className="journal-section-title" id={`${base}-heading`}>
        <PixelIcon name="flag" />
        Objectives
        {progress.total > 0 && (
          <span className="adventure-block__count">
            {' '}
            {progress.done} of {progress.total} done
          </span>
        )}
      </h4>

      {objectives.length === 0 ? (
        <p className="adventure-block__empty">
          {editable ? 'No objectives yet. Add the first step.' : 'No objectives.'}
        </p>
      ) : (
        <ul className="objective-list">
          {objectives.map((objective) => {
            const rowBusy = busy && pendingId === objective.id
            const doneBy = objectiveDoneLabel(objective, userId, roster, now)
            const tag = handoffTag(objective.handoff_id, handoffLabels)
            return (
              <li
                className="objective-row"
                data-done={objective.done || undefined}
                data-objective-id={objective.id}
                key={objective.id}
              >
                {readOnly ? (
                  <>
                    <p className="objective-row__plain">
                      <PixelIcon name={objective.done ? 'star' : 'flag'} />
                      <span>{objective.title}</span>
                      <span className="objective-row__state">
                        {objective.done ? '(done)' : '(not done)'}
                      </span>
                    </p>
                    {doneBy && <p className="objective-row__meta">{doneBy}</p>}
                    {tag && <p className="handoff-tag">{tag}</p>}
                  </>
                ) : editingId === objective.id ? (
                  <form
                    aria-label={`Rename ${objective.title}`}
                    className="objective-row__edit"
                    noValidate
                    onSubmit={(event) => void rename(event, objective)}
                  >
                    <label className="objective-row__label" htmlFor={`${base}-rename`}>
                      Objective
                    </label>
                    <input
                      aria-describedby={renameError ? `${base}-rename-error` : undefined}
                      aria-invalid={renameError ? 'true' : undefined}
                      autoComplete="off"
                      className="journal-input"
                      disabled={rowBusy}
                      id={`${base}-rename`}
                      onChange={(event) => {
                        setRenameText(event.target.value)
                        setRenameError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.stopPropagation()
                          restoreRef.current = objective.id
                          setEditingId(null)
                        }
                      }}
                      ref={renameRef}
                      value={renameText}
                    />
                    {renameError && (
                      <p className="journal-error" id={`${base}-rename-error`}>
                        {renameError}
                      </p>
                    )}
                    <div className="journal-actions">
                      <button
                        aria-busy={rowBusy || undefined}
                        className="journal-button"
                        disabled={busy}
                        type="submit"
                      >
                        {rowBusy ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="journal-button journal-button--ghost"
                        disabled={rowBusy}
                        onClick={() => {
                          restoreRef.current = objective.id
                          setEditingId(null)
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="journal-check objective-row__check">
                      <input
                        checked={objective.done}
                        disabled={!editable || busy}
                        id={`${base}-${objective.id}`}
                        onChange={(event) => void onToggle(objective.id, event.target.checked)}
                        type="checkbox"
                      />
                      <label htmlFor={`${base}-${objective.id}`}>{objective.title}</label>
                    </div>
                    {doneBy && <p className="objective-row__meta">{doneBy}</p>}
                    {tag && <p className="handoff-tag">{tag}</p>}
                    {editable && (
                      <div className="objective-row__tools">
                        <button
                          aria-label={`Rename ${objective.title}`}
                          className="journal-button journal-button--ghost"
                          data-objective-action="rename"
                          disabled={busy}
                          onClick={() => {
                            setRenameText(objective.title)
                            setRenameError(null)
                            setEditingId(objective.id)
                          }}
                          type="button"
                        >
                          Rename
                        </button>
                        <button
                          aria-busy={(rowBusy && pendingAction === 'objective-delete') || undefined}
                          aria-label={`Delete ${objective.title}`}
                          className="journal-button journal-button--danger"
                          disabled={busy}
                          onClick={async () => {
                            const result = await onRemove(objective.id)
                            if (result.ok) addRef.current?.focus()
                          }}
                          type="button"
                        >
                          {rowBusy && pendingAction === 'objective-delete' ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editable && (
        <form className="objective-add" noValidate onSubmit={(event) => void add(event)}>
          <div className="journal-field">
            <label htmlFor={`${base}-new`}>Add an objective</label>
            <input
              aria-describedby={draftError ? `${base}-new-error` : undefined}
              aria-invalid={draftError ? 'true' : undefined}
              autoComplete="off"
              className="journal-input"
              id={`${base}-new`}
              onChange={(event) => {
                setDraft(event.target.value)
                setDraftError(null)
              }}
              readOnly={pendingAction === 'objective-add'}
              ref={addRef}
              value={draft}
            />
            {draftError && (
              <p className="journal-error" id={`${base}-new-error`}>
                {draftError}
              </p>
            )}
          </div>
          <button
            aria-busy={pendingAction === 'objective-add' || undefined}
            className="journal-button journal-button--secondary"
            disabled={busy}
            type="submit"
          >
            {pendingAction === 'objective-add' ? 'Adding…' : 'Add objective'}
          </button>
        </form>
      )}
    </section>
  )
}
