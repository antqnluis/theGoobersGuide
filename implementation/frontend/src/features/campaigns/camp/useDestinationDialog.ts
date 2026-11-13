import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { resolveLocation, type CampLocation, type CampLocationId } from './campLayout'

/** Rendered and not `visibility: hidden`, so it can take focus. */
const isShown = (element: HTMLElement) => element.checkVisibility({ checkVisibilityCSS: true })

/**
 * Owns which destination is open and the modal dialog's focus handling:
 * focus moves to the close button on open, and returns to the opener (or an
 * equivalent visible control, or the first Places button) on close.
 */
export function useDestinationDialog({
  isOwner,
  isDeleting,
  cancelDelete,
  scope,
}: {
  isOwner: boolean
  isDeleting: boolean
  cancelDelete: () => void
  /** Element that contains every control carrying `data-location`. */
  scope: RefObject<HTMLElement | null>
}) {
  const [selectedId, setSelectedId] = useState<CampLocationId | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const active: CampLocation | null = resolveLocation(selectedId, isOwner)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (active && !dialog.open) {
      dialog.showModal()
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      closeRef.current?.focus()
    } else if (!active && dialog.open) {
      dialog.close()
      const opener = openerRef.current
      const locationId = opener?.dataset.location
      const equivalent = Array.from(
        scope.current?.querySelectorAll<HTMLButtonElement>('button[data-location]') ?? [],
      ).find((button) => button.dataset.location === locationId && isShown(button))
      if (opener?.isConnected && isShown(opener)) opener.focus()
      else if (equivalent) equivalent.focus()
      else scope.current?.querySelector<HTMLElement>('.camp-directory button')?.focus()
    }
  }, [active, scope])

  function open(location: CampLocation, opener: HTMLButtonElement) {
    openerRef.current = opener
    setSelectedId(location.id)
  }

  function close() {
    if (isDeleting) return
    cancelDelete()
    setSelectedId(null)
  }

  return { active, bodyRef, close, closeRef, dialogRef, open }
}
