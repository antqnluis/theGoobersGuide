import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DiceFailureNotice, NaturalChip } from './DiceResult'
import { DiceTray } from './DiceTray'
import { DiceTrayButton } from './DiceTrayButton'
import { rollTitle } from './diceRules'
import { useDice } from './useDice'
import { useDiceLayout } from './useDiceLayout'
import './dice.css'

const peekMs = 6000

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
  )
}

/**
 * The dice control that is always on screen: a button, a brief peek at your latest roll while the
 * tray is shut, and the tray. While a journal is open it renders inside that modal dialog (the rest
 * of the page is inert behind it), otherwise onto the page.
 */
export function DiceDock() {
  const dice = useDice()
  const { open, setOpen, result, resultSeq, failure } = dice
  const buttonRef = useRef<HTMLButtonElement>(null)
  const restoredPin = useRef(false)
  const restoreFocus = useRef(false)
  const focusPanel = useRef(false)
  const [seenSeq, setSeenSeq] = useState(0)
  const [held, setHeld] = useState(false)
  const arrangement = useDiceLayout({ open, host: dice.host })
  const { pinned, setPinned } = arrangement

  const openTray = useCallback(() => {
    focusPanel.current = true
    setOpen(true)
  }, [setOpen])

  // Closing the tray by hand also unpins it, so a pin never outlives the tray it kept open.
  const closeTray = useCallback(() => {
    restoreFocus.current = true
    setSeenSeq(resultSeq)
    setPinned(false)
    setOpen(false)
  }, [resultSeq, setOpen, setPinned])

  // Escape leaves a pinned tray open and hands focus back to the button.
  const escapeTray = useCallback(() => {
    if (pinned) buttonRef.current?.focus()
    else closeTray()
  }, [closeTray, pinned])

  // A pinned tray is open again when the page loads.
  useEffect(() => {
    if (!pinned || restoredPin.current) return
    restoredPin.current = true
    setOpen(true)
  }, [pinned, setOpen])

  useEffect(() => {
    if (open && focusPanel.current) {
      focusPanel.current = false
      document.getElementById('dice-tray')?.focus({ preventScroll: true })
    } else if (!open && restoreFocus.current) {
      restoreFocus.current = false
      buttonRef.current?.focus()
    }
  }, [open])

  // R opens and closes the tray from anywhere that isn't a text field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() !== 'r' || isTypingTarget(event.target)) return
      event.preventDefault()
      if (open && pinned) document.getElementById('dice-tray')?.focus({ preventScroll: true })
      else if (open) closeTray()
      else openTray()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeTray, open, openTray, pinned])

  const peeking = !open && Boolean(result) && resultSeq > seenSeq
  useEffect(() => {
    if (!peeking || held) return
    const timer = window.setTimeout(() => setSeenSeq(resultSeq), peekMs)
    return () => window.clearTimeout(timer)
  }, [held, peeking, resultSeq])

  const target = dice.host ?? document.body

  return createPortal(
    <div
      className="dice-dock"
      data-dragging={arrangement.dragging ? '' : undefined}
      data-host={dice.host ? 'journal' : 'page'}
      data-open={open ? '' : undefined}
    >
      <p aria-live="polite" className="dice-sr" role="status">
        {dice.announcement}
      </p>

      {!open && failure && (
        <div className="dice-peek dice-peek--failure">
          <DiceFailureNotice
            canRollLocally={failure.canRollLocally}
            message={failure.message}
            onDismiss={dice.dismissFailure}
            onRetry={dice.retry}
            onRollLocally={dice.rollLocally}
          />
        </div>
      )}

      {peeking && result && !failure && (
        <div
          className="dice-peek"
          onBlur={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
        >
          <button className="dice-peek__open" onClick={openTray} type="button">
            <span className="dice-peek__title">{rollTitle(result)}</span>
            <span className="dice-peek__total">{result.total}</span>
            <NaturalChip roll={result} />
          </button>
          {dice.critical && (
            <button
              className="dice-peek__critical"
              onClick={() => {
                setSeenSeq(resultSeq)
                void dice.rollCritical()
              }}
              type="button"
            >
              Roll critical damage
            </button>
          )}
        </div>
      )}

      {open && <DiceTray arrangement={arrangement} onClose={closeTray} onEscape={escapeTray} />}

      <DiceTrayButton
        onClick={open ? closeTray : openTray}
        open={open}
        ref={buttonRef}
        unseen={dice.unseen}
      />
    </div>,
    target,
  )
}
