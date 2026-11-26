import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { closeWithExit } from '../characters/dialogExit'
import { maxDocumentBytes } from '../characters/importText'
import { UnsavedChangesDialog } from '../characters/UnsavedChangesDialog'
import { craftingLimits, parseCraftingPack } from './craftingPack'
import { craftingPackPrompt } from './craftingPackPrompt'
import { snapshotOf } from './craftingLibrary'
import { libraryContentOptions } from './craftingQueries'
import { plural } from './craftingText'
import type { CraftingLibrary, PackImportResult } from './craftingTypes'
import type { CraftingActions } from './useCraftingActions'
import './crafting.css'

const shownIssues = 20

/**
 * Bring a crafting pack into a library (M04 plan §6.1): copy the prompt, paste or choose the
 * pack, read the path-level problems or the review counts, and import all of it or none of it.
 * The pack is checked against the library as it stands, so references, names, and removals are
 * caught before anything is sent. Nothing is saved until the DM imports.
 */
export function PackImportDialog({
  library,
  userId,
  actions,
  onClose,
  onImported,
}: {
  library: CraftingLibrary
  userId: string
  actions: CraftingActions
  onClose: () => void
  /** Called with the result once the pack has been imported. */
  onImported: (result: PackImportResult) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const jsonId = useId()
  const fileId = useId()
  const labelId = useId()
  const content = useQuery(libraryContentOptions(library.id, userId))
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirmClose, setConfirmClose] = useState(false)

  const snapshot = useMemo(() => (content.data ? snapshotOf(content.data) : null), [content.data])
  const parsed = useMemo(
    () => (text.trim() === '' || !snapshot ? null : parseCraftingPack(text, snapshot)),
    [text, snapshot],
  )
  const prompt = useMemo(
    () => craftingPackPrompt(content.data ? content.data.items.map((item) => item.slug) : []),
    [content.data],
  )

  const trimmedLabel = label.trim()
  // eslint-disable-next-line no-control-regex
  const labelError = /[\u0000-\u001f\u007f-\u009f]/.test(trimmedLabel)
    ? 'That label has characters that can’t be kept.'
    : trimmedLabel.length > craftingLimits.importLabel
      ? `Use a source label of up to ${craftingLimits.importLabel} characters.`
      : null
  const pack = parsed?.kind === 'parsed' ? parsed.pack : null
  const review = parsed?.kind === 'parsed' ? parsed.review : null
  const pending = actions.isPending
  const canImport = pack !== null && !labelError && !pending

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  useEffect(() => headingRef.current?.focus(), [])
  // The error belongs to this dialog's attempt; it starts clean.
  const { clearError } = actions
  useEffect(() => clearError(), [clearError])

  function leave(done: () => void) {
    closeWithExit(ref.current, done)
  }

  function requestClose() {
    if (pending) return
    if (text.trim() !== '') setConfirmClose(true)
    else leave(onClose)
  }

  function change(next: string) {
    setText(next)
    clearError()
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
      setFileError('This file is too large. Use a pack under 1 MB.')
      return
    }
    try {
      change(await file.text())
      setLabel(file.name.slice(0, craftingLimits.importLabel))
    } catch {
      setFileError('That file could not be read. Paste its text instead.')
    }
  }

  async function submit() {
    if (!canImport || !pack) return
    const result = await actions.importPack(library.id, pack, trimmedLabel || null)
    if (result) leave(() => onImported(result))
  }

  const issues = parsed?.kind === 'parsed' ? parsed.issues : []

  return (
    <>
      <dialog
        aria-labelledby={titleId}
        className="journal-prompt handoff-dialog pack-dialog"
        onCancel={(event) => {
          event.preventDefault()
          requestClose()
        }}
        ref={ref}
      >
        <h3 id={titleId} ref={headingRef} tabIndex={-1}>
          Import a pack into {library.name}
        </h3>
        <p className="handoff-dialog__lede">
          A pack adds items and recipes to this library, or updates the ones with the same id.
          Nothing changes until you import, and an import is all or nothing.
        </p>

        <details className="handoff-dialog__prompt">
          <summary>1. Copy the pack prompt</summary>
          <p>
            Give this prompt to a writing assistant together with your book pages or notes, and
            paste the JSON it returns below.
            {content.data && content.data.items.length > 0
              ? ' It lists the items already in this library, so new recipes can use them.'
              : ''}{' '}
            The app never sends it anywhere.
          </p>
          <div className="handoff-dialog__prompt-actions">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void copyPrompt()}
              type="button"
            >
              Copy pack prompt
            </button>
            <span className="handoff-dialog__copied" role="status">
              {copyState === 'copied' && 'Copied'}
              {copyState === 'failed' && 'Couldn’t copy. Select the prompt below and copy it.'}
            </span>
          </div>
          <label className="handoff-review__sr" htmlFor={`${jsonId}-prompt`}>
            Pack prompt
          </label>
          <textarea
            className="journal-input handoff-dialog__text"
            id={`${jsonId}-prompt`}
            readOnly
            rows={6}
            value={prompt}
          />
        </details>

        <div className="journal-field">
          <label htmlFor={jsonId}>2. The pack (JSON)</label>
          <textarea
            aria-describedby={`${jsonId}-hint`}
            className="journal-input handoff-dialog__text"
            disabled={pending}
            id={jsonId}
            onChange={(event) => change(event.target.value)}
            placeholder='{ "format": "the-goobers-guide-crafting-pack", "version": 1, … }'
            rows={8}
            spellCheck={false}
            value={text}
          />
          <p className="handoff-dialog__hint" id={`${jsonId}-hint`}>
            Paste the pack, or choose a file under 1 MB. It is checked here first, then again by the
            database.
          </p>
        </div>

        <div className="handoff-dialog__row">
          <div className="journal-field">
            <label htmlFor={fileId}>Or upload a file</label>
            <input
              accept=".json,.txt,application/json,text/plain"
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
              placeholder="For example, wyvern-pack.json"
              value={label}
            />
            {labelError && (
              <p className="journal-error" id={`${labelId}-error`}>
                {labelError}
              </p>
            )}
          </div>
        </div>

        {content.isPending && (
          <p className="journal-status" role="status">
            Reading the library to check the pack against…
          </p>
        )}
        {content.isError && (
          <div className="journal-status journal-status--error" role="alert">
            <p>The library couldn’t be read, so the pack can’t be checked.</p>
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void content.refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {parsed?.kind === 'rejected' && (
          <p className="journal-alert" role="alert">
            {parsed.message}
          </p>
        )}
        {issues.length > 0 && (
          <div className="journal-alert pack-dialog__issues" role="alert">
            <p>
              {plural(issues.length, 'problem')} to fix before this pack can be imported. Fix them
              in the file, or ask the assistant to correct them, and paste it again.
            </p>
            <ul>
              {issues.slice(0, shownIssues).map((issue, index) => (
                <li key={`${issue.path}-${index}`}>
                  {issue.path && <code>{issue.path}</code>} {issue.message}
                </li>
              ))}
            </ul>
            {issues.length > shownIssues && <p>…and {issues.length - shownIssues} more.</p>}
          </div>
        )}
        {parsed?.kind === 'parsed' && parsed.ignored.length > 0 && (
          <details className="handoff-review__ignored">
            <summary>Not imported ({parsed.ignored.length})</summary>
            <p>These keys aren’t part of the format, so they are left out:</p>
            <ul>
              {parsed.ignored.slice(0, shownIssues).map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
            {parsed.ignored.length > shownIssues && (
              <p>…and {parsed.ignored.length - shownIssues} more.</p>
            )}
          </details>
        )}

        {review && (
          <div className="pack-dialog__review" role="status">
            <h4>
              Ready to import: {review.name}
              {review.source ? ` (${review.source})` : ''}
            </h4>
            <dl>
              <div>
                <dt>Items</dt>
                <dd>
                  {review.itemsAdded} new, {review.itemsUpdated} updated
                </dd>
              </div>
              <div>
                <dt>Recipes</dt>
                <dd>
                  {review.recipesAdded} new, {review.recipesUpdated} updated
                </dd>
              </div>
              {(review.itemsRemoved > 0 || review.recipesRemoved > 0) && (
                <div>
                  <dt>Removed</dt>
                  <dd>
                    {plural(review.itemsRemoved, 'item')}, {plural(review.recipesRemoved, 'recipe')}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {actions.error && (
          <p className="journal-alert" role="alert">
            {actions.error}
          </p>
        )}

        <div className="journal-prompt__actions handoff-dialog__actions">
          <button
            aria-busy={pending || undefined}
            className="journal-button"
            disabled={!canImport}
            onClick={() => void submit()}
            type="button"
          >
            {pending ? 'Importing…' : 'Import pack'}
          </button>
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
          discardLabel="Discard pack"
          message="You pasted a pack that hasn't been imported. Closing now will discard it."
          onDiscard={() => leave(onClose)}
          onKeep={() => setConfirmClose(false)}
          title="Discard this pack?"
        />
      )}
    </>
  )
}
