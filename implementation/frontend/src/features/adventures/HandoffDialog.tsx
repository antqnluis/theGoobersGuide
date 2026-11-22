import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { closeWithExit } from '../characters/dialogExit'
import { maxDocumentBytes } from '../characters/importText'
import { UnsavedChangesDialog } from '../characters/UnsavedChangesDialog'
import type { CharacterSummary } from '../characters/characterTypes'
import { adventureStatusLabels, adventureTypeLabels } from './adventureRules'
import {
  adventureStatuses,
  type AdventureDetail,
  type AdventureStatus,
  type AdventureType,
} from './adventureTypes'
import {
  buildAttachRequest,
  buildNewRequest,
  defaultSelection,
  selectedChanges,
} from './handoffChanges'
import { blankTarget, handoffTargetFrom, parseHandoff } from './handoffDocument'
import { handoffPrompt } from './handoffPrompt'
import { HandoffReview } from './HandoffReview'
import { maxSourceBytes, newSourceAudience, sourceAudience } from './handoffRules'
import { useHandoffApply } from './useHandoffApply'
import { useHandoffCreate } from './useHandoffCreate'

const labelLimit = 120
// eslint-disable-next-line no-control-regex
const labelControls = /[\u0000-\u001f\u007f-\u009f]/
// Newlines and tabs are allowed in a source; every other control character is not.
// eslint-disable-next-line no-control-regex
const sourceControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

const encoder = new TextEncoder()

function sourceProblem(text: string) {
  if (text.trim() === '') return null
  if (encoder.encode(text).length > maxSourceBytes) return 'Keep the handoff under 64 KB.'
  if (sourceControls.test(text)) return 'This text has characters that can’t be kept.'
  return null
}

/** What starting a new adventure needs to know about the campaign and the player (new mode). */
export type HandoffCreateTarget = {
  campaignId: string
  /** The player's own characters, whatever their status (D3). */
  characters: readonly Pick<CharacterSummary, 'id' | 'name' | 'status'>[]
  /** The player's active character, if any. */
  defaultCharacterId: string | null
}

type Props = {
  userId: string
  onClose: () => void
} & (
  | {
      /** Attach mode: the adventure as it is now. The review is built from it and checked on apply. */
      adventure: AdventureDetail
      create?: undefined
      /** Called with the number of applied changes once the handoff has been saved. */
      onApplied: (count: number) => void
      onCreated?: undefined
    }
  | {
      adventure?: undefined
      /** New mode: start a new adventure from the handoff. */
      create: HandoffCreateTarget
      onApplied?: undefined
      /** Called with the new adventure and the number of changes it was created with. */
      onCreated: (adventure: AdventureDetail, count: number) => void
    }
)

const typeOrder: AdventureType[] = ['personal', 'side', 'main']
const hintLimit = 120

/**
 * Bring a DM handoff into an adventure (M03.9 §5.1): paste the handoff, copy one prompt, paste
 * the JSON back, review each proposed change, and apply the chosen ones with the source kept.
 * Attaching can also keep the source alone, which needs no prompt. New mode starts a new
 * adventure instead, with every valid proposal selected except the status (H6). Nothing is
 * saved until the player applies.
 */
export function HandoffDialog(props: Props) {
  const { userId, onClose } = props
  const initial = props.adventure
  const create = props.create
  const isNew = create !== undefined
  const ref = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const sourceId = useId()
  const jsonId = useId()
  const labelId = useId()
  const fileId = useId()
  const typeId = useId()
  const applier = useHandoffApply(initial?.id ?? '', userId)
  const creator = useHandoffCreate(create?.campaignId ?? '', userId)
  const [adventure, setAdventure] = useState(initial)
  const [type, setType] = useState<AdventureType>('personal')
  const [characterId, setCharacterId] = useState(create?.defaultCharacterId ?? '')
  const [hint, setHint] = useState('')
  const [status, setStatus] = useState<AdventureStatus>('pending')
  const [sourceText, setSourceText] = useState('')
  const [label, setLabel] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // null means the default for the mode (H6): nothing when attaching, the valid proposals when new.
  const [chosenKeys, setSelected] = useState<ReadonlySet<string> | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const target = useMemo(
    () => (adventure ? handoffTargetFrom(adventure) : blankTarget(type)),
    [adventure, type],
  )
  const sourceError = sourceProblem(sourceText)
  const hasSource = sourceText.trim() !== '' && !sourceError
  const trimmedHint = hint.trim().replace(/\s+/g, ' ')
  const hintError =
    trimmedHint.length > hintLimit || labelControls.test(hint.replace(/[\r\n\t]/g, ' '))
      ? 'Use a short description of up to 120 characters.'
      : null
  const prompt = useMemo(
    () =>
      hasSource
        ? handoffPrompt(
            adventure
              ? { sourceText, current: target }
              : { sourceText, hint: hintError ? '' : trimmedHint },
          )
        : '',
    [hasSource, sourceText, target, adventure, trimmedHint, hintError],
  )
  const parsed = useMemo(
    () => (jsonText.trim() === '' ? null : parseHandoff(jsonText, target)),
    [jsonText, target],
  )
  const changes = parsed?.kind === 'parsed' ? parsed.changes : []
  // In new mode the status is the player's own pick (H6), so it is not a row in the review.
  const reviewed = isNew ? changes.filter((change) => change.field !== 'status') : changes
  const selected = chosenKeys ?? defaultSelection(changes, isNew ? 'new' : 'attach')
  const chosen = selectedChanges(reviewed, selected)
  const proposedStatus = changes.find((change) => change.field === 'status')

  const trimmedLabel = label.trim()
  const labelError =
    trimmedLabel.length > labelLimit || labelControls.test(trimmedLabel)
      ? 'Use a source label of up to 120 characters.'
      : null
  const pending = applier.isPending || creator.isPending
  const failure = applier.error ?? creator.error
  const canSave = hasSource && !labelError && !pending

  const characters = create?.characters ?? []
  const needsCharacter = isNew && type !== 'main'
  const noCharacters = needsCharacter && characters.length === 0
  const characterOk = !needsCharacter || characters.some((entry) => entry.id === characterId)
  const newRequest = isNew ? buildNewRequest(reviewed, selected, status) : null
  const canApply = isNew
    ? canSave && !hintError && characterOk && newRequest?.ok === true
    : canSave && chosen.length > 0

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  useEffect(() => headingRef.current?.focus(), [])

  function changeJson(next: string) {
    setJsonText(next)
    setSelected(isNew ? null : new Set())
    setReason(null)
    setConflict(null)
    applier.clearError()
    creator.clearError()
  }

  function requestClose() {
    if (pending) return
    if (sourceText.trim() !== '' || jsonText.trim() !== '') setConfirmClose(true)
    else leave(onClose)
  }

  /** The dialog eases out before the screen behind it changes. */
  function leave(done: () => void) {
    closeWithExit(ref.current, done)
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    setFileError(null)
    if (file.size >= maxDocumentBytes || file.size > maxSourceBytes) {
      setFileError('This file is too large. Keep the handoff under 64 KB.')
      return
    }
    try {
      setSourceText(await file.text())
      setLabel(file.name.slice(0, labelLimit))
      changeJson('')
    } catch {
      setFileError('That file could not be read. Paste its text instead.')
    }
  }

  async function save(withChanges: boolean) {
    if (!canSave || !adventure || props.create) return
    setReason(null)
    let outcome
    if (withChanges) {
      const request = buildAttachRequest(changes, selected, {
        adventureUpdatedAt: adventure.updated_at,
        objectiveUpdatedAt: Object.fromEntries(
          adventure.objectives.map((objective) => [objective.id, objective.updated_at]),
        ),
      })
      if (!request.ok) {
        setReason(request.reason)
        return
      }
      outcome = await applier.apply(
        request.expected,
        request.changes,
        sourceText,
        trimmedLabel || null,
      )
    } else {
      outcome = await applier.apply({}, {}, sourceText, trimmedLabel || null)
    }

    if (outcome.kind === 'applied') {
      const count = withChanges ? chosen.length : 0
      leave(() => props.onApplied?.(count))
    } else if (outcome.kind === 'unavailable') {
      leave(onClose)
    } else if (outcome.kind === 'conflict') {
      // The adventure changed during review: start again from the latest version.
      setSelected(new Set())
      setConflict(outcome.message)
      if (outcome.current) setAdventure(outcome.current)
    }
  }

  async function start() {
    if (!canSave || !create || !newRequest) return
    setReason(null)
    if (!newRequest.ok) {
      setReason(newRequest.reason)
      return
    }
    const outcome = await creator.create(
      type,
      type === 'main' ? null : characterId,
      newRequest.changes,
      sourceText,
      trimmedLabel || null,
    )
    if (outcome.kind === 'created') {
      leave(() => props.onCreated?.(outcome.adventure, newRequest.count))
    }
  }

  const audience = adventure ? sourceAudience(adventure) : newSourceAudience(type)
  const title = adventure ? adventure.title : 'a new adventure'

  return (
    <>
      <dialog
        aria-labelledby={titleId}
        className="journal-prompt handoff-dialog"
        onCancel={(event) => {
          event.preventDefault()
          requestClose()
        }}
        ref={ref}
      >
        <h3 id={titleId} ref={headingRef} tabIndex={-1}>
          {isNew ? 'Start from a handoff' : 'Import handoff'}
        </h3>
        <p className="handoff-dialog__lede">
          {isNew
            ? 'Start a new adventure from a DM’s recap. The text is kept as its source, and every proposed part is shown for you to keep or drop. Nothing is created until you confirm.'
            : `Bring a DM’s recap into ${title}. The text is kept as a source, and every proposed change is shown against the adventure as it is now. Nothing is saved until you apply.`}
        </p>

        {isNew && (
          <>
            <fieldset className="adventure-form__types" disabled={pending}>
              <legend className="journal-label">What kind of adventure</legend>
              {typeOrder.map((option) => (
                <div className="journal-check" key={option}>
                  <input
                    checked={type === option}
                    id={`${typeId}-${option}`}
                    name={`${typeId}-type`}
                    onChange={() => setType(option)}
                    type="radio"
                  />
                  <label htmlFor={`${typeId}-${option}`}>{adventureTypeLabels[option]}</label>
                </div>
              ))}
            </fieldset>

            {needsCharacter && !noCharacters && (
              <div className="journal-field">
                <label htmlFor={`${typeId}-character`}>For which character</label>
                <select
                  className="journal-select"
                  disabled={pending}
                  id={`${typeId}-character`}
                  onChange={(event) => setCharacterId(event.target.value)}
                  value={characterId}
                >
                  <option value="">Choose a character</option>
                  {characters
                    .toSorted((a, b) => a.name.localeCompare(b.name))
                    .map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.status === 'active'
                          ? character.name
                          : `${character.name} (${character.status})`}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {noCharacters && (
              <p className="journal-status">
                A personal or side adventure belongs to one of your characters, and you don’t have
                one in this campaign yet. Make one in the tent (My characters), or start a main
                adventure.
              </p>
            )}

            <div className="journal-field">
              <label htmlFor={`${typeId}-hint`}>
                What is this about? <span>(optional)</span>
              </label>
              <input
                aria-describedby={hintError ? `${typeId}-hint-error` : undefined}
                aria-invalid={hintError ? 'true' : undefined}
                autoComplete="off"
                className="journal-input"
                disabled={pending}
                id={`${typeId}-hint`}
                onChange={(event) => setHint(event.target.value)}
                placeholder="One thread, for example “the missing bell”"
                value={hint}
              />
              {hintError && (
                <p className="journal-error" id={`${typeId}-hint-error`}>
                  {hintError}
                </p>
              )}
            </div>
          </>
        )}

        <div className="journal-field">
          <label htmlFor={sourceId}>1. The handoff text</label>
          <textarea
            aria-describedby={`${sourceId}-hint`}
            aria-invalid={sourceError ? 'true' : undefined}
            className="journal-input handoff-dialog__text"
            disabled={pending}
            id={sourceId}
            onChange={(event) => {
              setSourceText(event.target.value)
              changeJson('')
            }}
            rows={7}
            spellCheck={false}
            value={sourceText}
          />
          <p className="handoff-dialog__hint" id={`${sourceId}-hint`}>
            Paste the recap, or choose a file under 64 KB. It is shown here as plain text and kept
            exactly as written. {audience}
          </p>
          {sourceError && (
            <p className="journal-error" role="alert">
              {sourceError}
            </p>
          )}
        </div>

        <div className="handoff-dialog__row">
          <div className="journal-field">
            <label htmlFor={fileId}>Or upload a file</label>
            <input
              accept=".md,.txt,text/plain,text/markdown"
              className="journal-input"
              disabled={pending}
              id={fileId}
              onChange={(event) => {
                void readFile(event.target.files?.[0])
                event.target.value = ''
              }}
              type="file"
            />
            {fileError && (
              <p className="journal-error" role="alert">
                {fileError}
              </p>
            )}
          </div>
          <div className="journal-field">
            <label htmlFor={labelId}>
              Source label <span>(optional)</span>
            </label>
            <input
              aria-describedby={labelError ? `${labelId}-error` : undefined}
              aria-invalid={labelError ? 'true' : undefined}
              autoComplete="off"
              className="journal-input"
              disabled={pending}
              id={labelId}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="For example, Session 4 recap"
              value={label}
            />
            {labelError && (
              <p className="journal-error" id={`${labelId}-error`}>
                {labelError}
              </p>
            )}
          </div>
        </div>

        {hasSource && (
          <details className="handoff-dialog__prompt">
            <summary>2. Copy the prompt</summary>
            <p>
              {isNew
                ? 'Give this prompt to a writing assistant and paste the JSON it returns below. It holds your handoff, so the assistant can propose the new adventure. The app never sends it anywhere.'
                : 'Give this prompt to a writing assistant and paste the JSON it returns below. It holds your handoff and this adventure’s current values, so the assistant can name exactly what changed. The app never sends it anywhere.'}
            </p>
            <div className="handoff-dialog__prompt-actions">
              <button
                className="journal-button journal-button--secondary"
                onClick={() => void copyPrompt()}
                type="button"
              >
                Copy handoff prompt
              </button>
              <span className="handoff-dialog__copied" role="status">
                {copyState === 'copied' && 'Copied'}
                {copyState === 'failed' && 'Couldn’t copy. Select the prompt below and copy it.'}
              </span>
            </div>
            <label className="handoff-review__sr" htmlFor={`${jsonId}-prompt`}>
              Handoff prompt
            </label>
            <textarea
              className="journal-input handoff-dialog__text"
              id={`${jsonId}-prompt`}
              readOnly
              rows={6}
              value={prompt}
            />
          </details>
        )}

        <div className="journal-field">
          <label htmlFor={jsonId}>3. The assistant’s answer (JSON)</label>
          <textarea
            aria-describedby={`${jsonId}-hint`}
            className="journal-input handoff-dialog__text"
            disabled={pending || !hasSource}
            id={jsonId}
            onChange={(event) => changeJson(event.target.value)}
            placeholder='{ "format": "the-goobers-guide-adventure-handoff", "version": 1, … }'
            rows={6}
            spellCheck={false}
            value={jsonText}
          />
          <p className="handoff-dialog__hint" id={`${jsonId}-hint`}>
            {!hasSource
              ? 'Add the handoff text first.'
              : isNew
                ? 'Paste the document the assistant returned.'
                : 'Paste the document the assistant returned. Or skip this and keep the source only.'}
          </p>
        </div>

        {conflict && (
          <p className="journal-alert" role="alert">
            {conflict}
          </p>
        )}
        {parsed?.kind === 'rejected' && (
          <p className="journal-alert" role="alert">
            {parsed.message}
          </p>
        )}
        {parsed?.kind === 'parsed' && (
          <>
            <HandoffReview
              changes={reviewed}
              disabled={pending}
              ignored={parsed.ignored}
              notes={parsed.notes}
              onSelect={(next) => {
                setSelected(next)
                setReason(null)
              }}
              selected={selected}
            />
            {isNew && (
              <div className="journal-field adventure-status">
                <label htmlFor={`${typeId}-status`}>Status of the new adventure</label>
                <select
                  className="journal-select"
                  disabled={pending}
                  id={`${typeId}-status`}
                  onChange={(event) => setStatus(event.target.value as AdventureStatus)}
                  value={status}
                >
                  {adventureStatuses.map((option) => (
                    <option key={option} value={option}>
                      {adventureStatusLabels[option]}
                    </option>
                  ))}
                </select>
                {proposedStatus?.state === 'ok' && (
                  <p className="handoff-dialog__hint">
                    The handoff proposes{' '}
                    {adventureStatusLabels[proposedStatus.proposed as AdventureStatus]}.
                    {proposedStatus.suggestsCompletion &&
                      ' The handoff suggests this. Only you decide it’s done.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {isNew && parsed?.kind === 'parsed' && newRequest && !newRequest.ok && (
          <p className="journal-error" role="status">
            {newRequest.reason} Select the title, or generate the document again.
          </p>
        )}
        {reason && (
          <p className="journal-alert" role="alert">
            {reason}
          </p>
        )}
        {failure && (
          <p className="journal-alert" role="alert">
            {failure}
          </p>
        )}

        <div className="journal-prompt__actions handoff-dialog__actions">
          <button
            aria-busy={pending || undefined}
            className="journal-button"
            disabled={!canApply}
            onClick={() => void (isNew ? start() : save(true))}
            type="button"
          >
            {pending
              ? 'Saving…'
              : isNew
                ? newRequest?.ok
                  ? `Create adventure with ${newRequest.count} ${newRequest.count === 1 ? 'change' : 'changes'}`
                  : 'Create adventure'
                : chosen.length > 0
                  ? `Apply ${chosen.length} ${chosen.length === 1 ? 'change' : 'changes'}`
                  : 'Apply changes'}
          </button>
          {!isNew && (
            <button
              className="journal-button journal-button--secondary"
              disabled={!canSave}
              onClick={() => void save(false)}
              type="button"
            >
              Keep as source only
            </button>
          )}
          <button
            className="journal-button journal-button--ghost"
            disabled={pending}
            onClick={requestClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </dialog>

      {confirmClose && (
        <UnsavedChangesDialog
          discardLabel="Discard handoff"
          message="You pasted a handoff that hasn't been saved. Closing now will discard it."
          onDiscard={() => leave(onClose)}
          onKeep={() => setConfirmClose(false)}
          title="Discard this handoff?"
        />
      )}
    </>
  )
}
