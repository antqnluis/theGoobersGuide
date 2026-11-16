/** How long a journal prompt takes to leave; keep in step with `.journal-prompt` in journal.css. */
const exitMs = 160

/**
 * Closes a modal dialog and calls `done` once its exit transition has played (a fade under
 * reduced motion). Where a browser cannot transition a closing dialog, `done` runs at once.
 */
export function closeWithExit(dialog: HTMLDialogElement | null, done: () => void) {
  if (!dialog?.open) {
    done()
    return
  }
  dialog.close()
  // matchMedia marks a real browser; jsdom answers CSS.supports but never plays transitions.
  const animates =
    typeof window.matchMedia === 'function' &&
    typeof CSS !== 'undefined' &&
    CSS.supports('transition-behavior: allow-discrete')
  if (animates) window.setTimeout(done, exitMs)
  else done()
}
