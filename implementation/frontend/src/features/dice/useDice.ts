import { useContext, useEffect, type RefObject } from 'react'
import { DiceContext, type DiceScope } from './diceContext'

/** Roll dice from anywhere, and read the tray's state. Safe outside a provider: rolls report unavailable. */
export function useDice() {
  return useContext(DiceContext)
}

/**
 * Binds the dice to a campaign while a component is mounted. Pass a memoised scope; the campaign
 * workspace does. With no scope (or none registered) rolls are private and local, "Not saved".
 */
export function useDiceScope(scope: DiceScope | null) {
  const { setScope } = useDice()
  // A new scope object (names refreshed) replaces the old one without clearing the result; only
  // unmounting unbinds the campaign.
  useEffect(() => {
    setScope(scope)
  }, [scope, setScope])
  useEffect(() => () => setScope(null), [setScope])
}

/**
 * Keeps the dock reachable over a modal dialog: while `active`, the dock renders inside that
 * dialog (everything outside a modal dialog is inert), and returns to the page when it closes.
 */
export function useDiceHost(active: boolean, dialog: RefObject<HTMLElement | null>) {
  const { setHost } = useDice()
  useEffect(() => {
    setHost(active ? dialog.current : null)
    return () => setHost(null)
  }, [active, dialog, setHost])
}
