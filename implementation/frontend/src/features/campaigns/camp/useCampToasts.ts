import { useCallback, useRef, useState } from 'react'

export type CampToast = { id: number; message: string }

/** How long a toast stays, and how many may stack. */
export const toastMs = 5000
const maxToasts = 3

/** Transient confirmations for the camp. Messages are plain text; errors stay inline. */
export function useCampToasts() {
  const [toasts, setToasts] = useState<CampToast[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string) => {
    nextId.current += 1
    const id = nextId.current
    setToasts((current) => [...current.slice(-(maxToasts - 1)), { id, message }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return { toasts, push, dismiss }
}
