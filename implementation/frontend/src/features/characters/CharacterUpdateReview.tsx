import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toCharacterDocument } from './characterDocument'
import { updatePrompt } from './characterPrompts'
import {
  parseCharacterUpdate,
  resolveUpdate,
  toUpdatePayload,
  type CurrentCharacter,
  type UpdateChange,
  type UpdateSection,
} from './characterUpdateDocument'
import { closeWithExit } from './dialogExit'
import { maxDocumentBytes } from './importText'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import { useCharacterUpdate } from './useCharacterUpdate'

const labelLimit = 120
// eslint-disable-next-line no-control-regex
const labelControls = /[\u0000-\u001f\u007f-\u009f]/

const sectionTitles: readonly (readonly [UpdateSection, string])[] = [
  ['details', 'Character'],
  ['vitals', 'Vitals'],
  ['abilities', 'Abilities'],
  ['saving_throws', 'Saving throws'],
  ['skills', 'Skills'],
  ['attacks', 'Attacks'],
  ['inventory', 'Inventory'],
  ['currency', 'Coins'],
  ['text', 'Features, spells, and notes'],
]

type Props = {
  userId: string
  /** The character as it is now. The review is built from this and checked again on apply. */
  current: CurrentCharacter
  /** Closes the dialog without applying anything. */
  onClose: () => void
  /** Called with the number of applied changes once the update has been saved. */
  onApplied: (count: number) => void
}

/** Paste or upload an update document, review each change against the sheet, apply the chosen ones. */
export function CharacterUpdateReview({ userId, current: initial, onClose, onApplied }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const textId = useId()
  const labelId = useId()
  const fileId = useId()
  const updater = useCharacterUpdate(initial.character, userId)
  const [current, setCurrent] = useState(initial)
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [problems, setProblems] = useState<string[]>([])
  const [conflict, setConflict] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const prompt = useMemo(
    () =>
      updatePrompt(
        toCharacterDocument(current.character, current.sheet, current.items, { withIds: true }),
      ),
    [current],
  )
  const parsed = useMemo(() => (text.trim() === '' ? null : parseCharacterUpdate(text)), [text])
  const resolved = useMemo(
    () => (parsed?.kind === 'parsed' ? resolveUpdate(parsed.update, current) : null),
    [parsed, current],
  )
  const changes = resolved?.changes ?? []
  const valid = changes.filter((change) => !change.error)
  const chosen = changes.filter((change) => selected.has(change.key))

  const trimmedLabel = label.trim()
  const labelError =
    trimmedLabel.length > labelLimit || labelControls.test(trimmedLabel)
      ? 'Use a source label of up to 120 characters.'
      : null
  const pending = updater.isPending

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  useEffect(() => headingRef.current?.focus(), [])

  function changeText(next: string) {
    setText(next)
    setSelected(new Set())
    setProblems([])
    setConflict(null)
    updater.clearError()
  }

  function requestClose() {
    if (pending) return
    if (text.trim() !== '') setConfirmClose(true)
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
    if (file.size >= maxDocumentBytes) {
      setFileError('This file is too large. Use a document under 1 MB.')
      return
    }
    try {
      changeText(await file.text())
      setLabel(file.name.slice(0, labelLimit))
    } catch {
      setFileError('That file could not be read. Paste its text instead.')
    }
  }

  function toggle(change: UpdateChange) {
    if (change.error || pending) return
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(change.key)) next.delete(change.key)
      else next.add(change.key)
      return next
    })
    setProblems([])
  }

  async function apply() {
    if (pending || chosen.length === 0 || labelError) return
    const result = toUpdatePayload(chosen, current)
    if (!result.ok) {
      setProblems(result.errors)
      return
    }
    setProblems([])
    const outcome = await updater.apply(result.expected, result.changes, trimmedLabel || null)
    if (outcome.kind === 'applied') {
      leave(() => onApplied(chosen.length))
    } else if (outcome.kind === 'conflict') {
      // The character changed during review: start again from the latest version.
      setSelected(new Set())
      setConflict(outcome.message)
      if (outcome.current) setCurrent(outcome.current)
    }
  }

  const blocked = resolved?.blocked ?? null
  const canApply = chosen.length > 0 && !labelError && !pending

  return (
    <>
      <dialog
        aria-labelledby={titleId}
        className="journal-prompt import-dialog"
        onCancel={(event) => {
          event.preventDefault()
          requestClose()
        }}
        ref={ref}
      >
        <h3 id={titleId} ref={headingRef} tabIndex={-1}>
          Import updates
        </h3>
        <p className="import-dialog__lede">
          Bring in later changes to {current.character.name}. Every change is shown against the
          sheet as it is now, and nothing is saved until you choose changes and apply them.
        </p>

        <details className="import-dialog__prompt">
          <summary>How do I make an update?</summary>
          <p>
            Copy this prompt, give it and your new handoff or sheet to a writing assistant, and
            paste the JSON it returns below. The prompt holds {current.character.name}’s current
            sheet so the assistant can name exactly what changed. The app never sends it anywhere.
          </p>
          <div className="import-dialog__prompt-actions">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void copyPrompt()}
              type="button"
            >
              Copy update prompt
            </button>
            <span className="import-dialog__copied" role="status">
              {copyState === 'copied' && 'Copied'}
              {copyState === 'failed' && 'Couldn’t copy. Select the prompt below and copy it.'}
            </span>
          </div>
          <label className="import-dialog__sr" htmlFor={`${textId}-prompt`}>
            Update prompt
          </label>
          <textarea
            className="journal-input import-dialog__prompt-text"
            id={`${textId}-prompt`}
            readOnly
            rows={6}
            value={prompt}
          />
        </details>

        <div className="journal-field">
          <label htmlFor={textId}>Update document (JSON)</label>
          <textarea
            aria-describedby={`${textId}-hint`}
            className="journal-input import-dialog__text"
            disabled={pending}
            id={textId}
            onChange={(event) => changeText(event.target.value)}
            placeholder='{ "format": "the-goobers-guide-character-update", "version": 2, … }'
            rows={7}
            spellCheck={false}
            value={text}
          />
          <p className="import-dialog__hint" id={`${textId}-hint`}>
            Paste the document or choose a file under 1 MB.
          </p>
        </div>

        <div className="import-dialog__row">
          <div className="journal-field">
            <label htmlFor={fileId}>Or upload a file</label>
            <input
              accept=".json,.txt,.md,application/json,text/plain"
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
              Source <span>(optional)</span>
            </label>
            <input
              aria-describedby={labelError ? `${labelId}-error` : undefined}
              aria-invalid={labelError ? 'true' : undefined}
              autoComplete="off"
              className="journal-input"
              disabled={pending}
              id={labelId}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="For example, the file name"
              value={label}
            />
            {labelError && (
              <p className="journal-error" id={`${labelId}-error`}>
                {labelError}
              </p>
            )}
          </div>
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
        {blocked && (
          <p className="journal-alert" role="alert">
            {blocked}
          </p>
        )}
        {parsed?.kind === 'parsed' && !blocked && (
          <section aria-label="Review" className="import-review">
            {changes.length === 0 ? (
              <p className="import-review__summary" role="status">
                Nothing in this document differs from the current sheet.
              </p>
            ) : (
              <>
                <div className="update-review__bar">
                  <p className="import-review__summary" role="status">
                    {chosen.length} of {changes.length}{' '}
                    {changes.length === 1 ? 'change' : 'changes'} selected.
                    {valid.length < changes.length &&
                      ` ${changes.length - valid.length} can’t be applied.`}
                  </p>
                  <div className="update-review__bulk">
                    <button
                      className="journal-button journal-button--secondary"
                      disabled={pending || valid.length === 0 || chosen.length === valid.length}
                      onClick={() => setSelected(new Set(valid.map((change) => change.key)))}
                      type="button"
                    >
                      Select all valid
                    </button>
                    <button
                      className="journal-button journal-button--secondary"
                      disabled={pending || chosen.length === 0}
                      onClick={() => setSelected(new Set())}
                      type="button"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
                {sectionTitles.map(([section, title]) => {
                  const inSection = changes.filter((change) => change.section === section)
                  if (inSection.length === 0) return null
                  return (
                    <section
                      aria-labelledby={`update-review-${section}`}
                      className="import-review__section"
                      key={section}
                    >
                      <h4 id={`update-review-${section}`}>{title}</h4>
                      <ul className="update-review__list">
                        {inSection.map((change) => (
                          <ChangeRow
                            change={change}
                            checked={selected.has(change.key)}
                            disabled={pending}
                            key={change.key}
                            onToggle={() => toggle(change)}
                          />
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </>
            )}
            {parsed.ignored.length > 0 && (
              <details className="import-review__ignored">
                <summary>Not imported ({parsed.ignored.length})</summary>
                <p>These parts aren’t part of the format, so they were left out.</p>
                <ul>
                  {parsed.ignored.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {problems.length > 0 && (
          <div className="journal-alert" role="alert">
            <p>These changes can’t be applied together:</p>
            <ul className="import-review__issues">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        {updater.error && (
          <p className="journal-alert" role="alert">
            {updater.error}
          </p>
        )}

        <div className="journal-prompt__actions import-dialog__actions">
          <button
            aria-busy={pending || undefined}
            className="journal-button"
            disabled={!canApply}
            onClick={() => void apply()}
            type="button"
          >
            {pending
              ? 'Applying…'
              : chosen.length > 0
                ? `Apply ${chosen.length} ${chosen.length === 1 ? 'change' : 'changes'}`
                : 'Apply changes'}
          </button>
          <button
            className="journal-button journal-button--secondary"
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
          discardLabel="Discard update"
          message="You pasted an update that hasn't been applied. Closing now will discard it."
          onDiscard={() => leave(onClose)}
          onKeep={() => setConfirmClose(false)}
          title="Discard this update?"
        />
      )}
    </>
  )
}

function ChangeRow({
  change,
  checked,
  disabled,
  onToggle,
}: {
  change: UpdateChange
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <li className="update-review__change" data-invalid={change.error ? true : undefined}>
      <input
        aria-describedby={change.error ? errorId : `${id}-values`}
        checked={checked}
        disabled={disabled || Boolean(change.error)}
        id={id}
        onChange={onToggle}
        type="checkbox"
      />
      <label htmlFor={id}>{change.label}</label>
      <p className="update-review__values" id={`${id}-values`}>
        <span className="update-review__before">
          <span className="import-dialog__sr">Now: </span>
          {change.before}
        </span>
        <span aria-hidden="true"> → </span>
        <span className="import-dialog__sr"> becomes: </span>
        <span className="update-review__after">{change.after}</span>
      </p>
      {change.error && (
        <p className="journal-error" id={errorId}>
          {change.error}
        </p>
      )}
    </li>
  )
}
