import { useId, useLayoutEffect, useRef } from 'react'

/**
 * A modal question over the journal: leave and lose edits, or keep editing. A native
 * modal dialog, so focus is trapped and Escape means "keep editing".
 */
export function UnsavedChangesDialog({
  title = 'Leave without saving?',
  message,
  discardLabel,
  onKeep,
  onDiscard,
}: {
  title?: string
  message: string
  discardLabel: string
  onKeep: () => void
  onDiscard: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageId = useId()

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      aria-describedby={messageId}
      aria-labelledby={titleId}
      className="journal-prompt"
      onCancel={(event) => {
        event.preventDefault()
        onKeep()
      }}
      ref={ref}
      role="alertdialog"
    >
      <h3 id={titleId}>{title}</h3>
      <p id={messageId}>{message}</p>
      <div className="journal-prompt__actions">
        <button autoFocus className="journal-button" onClick={onKeep} type="button">
          Keep editing
        </button>
        <button className="journal-button journal-button--danger" onClick={onDiscard} type="button">
          {discardLabel}
        </button>
      </div>
    </dialog>
  )
}
