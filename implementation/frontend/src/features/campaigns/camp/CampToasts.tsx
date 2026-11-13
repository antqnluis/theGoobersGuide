import { useEffect, useRef, useState } from 'react'
import { toastMs, type CampToast } from './useCampToasts'

function Toast({ toast, onDismiss }: { toast: CampToast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })

  // Hovering or focusing a toast holds it, so it can be read and dismissed.
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => dismiss.current(toast.id), toastMs)
    return () => window.clearTimeout(timer)
  }, [paused, toast.id])

  return (
    <li
      className="journal-toast"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span className="journal-toast__mark" aria-hidden="true" />
      <span className="journal-toast__text">{toast.message}</span>
      <button
        aria-label="Dismiss notification"
        className="journal-toast__close"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  )
}

/** The live region stays mounted so a screen reader announces each toast as it appears. */
export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: readonly CampToast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="journal-toasts">
      <ul aria-label="Notifications" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <Toast key={toast.id} onDismiss={onDismiss} toast={toast} />
        ))}
      </ul>
    </div>
  )
}
