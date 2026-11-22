import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { applyMode } from './diceNotation'
import type { DiceSource, DiceVisibility } from './diceRules'
import type { RollMode, RollSpec } from './diceTypes'
import { useDice } from './useDice'

/** What a roll source asks the dice for. `critical` is the damage an attack doubles on a natural 20. */
export type SheetRoll = {
  label: string
  spec: RollSpec
  source: DiceSource
  characterId?: string | null
  critical?: { label: string; spec: RollSpec }
}

const holdMs = 450
const menuWidth = 224
const menuRow = 44

type MenuPlace = { target: HTMLElement; left: number; top?: number; bottom?: number }

type MenuItem = { label: string; mode: RollMode; visibility: DiceVisibility }

/**
 * A number that rolls. A press rolls normally; Shift-click rolls with advantage and Alt-click with
 * disadvantage (on a single d20); a long press, right-click, or the context-menu key opens a small
 * menu with those and "Roll privately". The result shows in the dice tray or its peek.
 */
export function RollButton({
  roll,
  children,
  ariaLabel,
  variant = 'key',
}: {
  roll: SheetRoll
  children: ReactNode
  ariaLabel?: string
  /** `chip` sits inside a line of text; `key` is the sheet's 44px button. */
  variant?: 'key' | 'chip'
}) {
  const dice = useDice()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const holdTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const [menu, setMenu] = useState<MenuPlace | null>(null)

  const canMode = applyMode(roll.spec, 'advantage').ok
  const hasMenu = canMode || dice.inCampaign

  function run(mode: RollMode, visibility: DiceVisibility = 'campaign') {
    void dice.roll({
      spec: roll.spec,
      label: roll.label,
      source: roll.source,
      characterId: roll.characterId,
      critical: roll.critical,
      mode,
      visibility,
    })
  }

  function openMenu() {
    const button = buttonRef.current
    if (!button || !hasMenu) return
    const rect = button.getBoundingClientRect()
    const rows = (canMode ? 2 : 0) + (dice.inCampaign ? 1 : 0)
    const height = rows * menuRow + 12
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
    const below = rect.bottom + 4 + height <= window.innerHeight
    setMenu({
      target: button.closest('dialog') ?? document.body,
      left,
      ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
    })
  }

  function stopHold() {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  function onClick(event: MouseEvent) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    run(
      canMode && event.shiftKey ? 'advantage' : canMode && event.altKey ? 'disadvantage' : 'normal',
    )
  }

  const items: MenuItem[] = [
    ...(canMode
      ? ([
          { label: 'Roll with advantage', mode: 'advantage', visibility: 'campaign' },
          { label: 'Roll with disadvantage', mode: 'disadvantage', visibility: 'campaign' },
        ] as const)
      : []),
    ...(dice.inCampaign
      ? ([{ label: 'Roll privately', mode: 'normal', visibility: 'self' }] as const)
      : []),
  ]

  return (
    <>
      <button
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-label={ariaLabel ?? `Roll ${roll.label}`}
        className={variant === 'chip' ? 'roll-button roll-button--chip' : 'roll-button'}
        aria-busy={dice.pending ? true : undefined}
        onClick={onClick}
        onContextMenu={(event) => {
          if (!hasMenu) return
          event.preventDefault()
          openMenu()
        }}
        onPointerCancel={stopHold}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' || !hasMenu) return
          suppressClick.current = false
          stopHold()
          holdTimer.current = window.setTimeout(() => {
            suppressClick.current = true
            openMenu()
          }, holdMs)
        }}
        onPointerLeave={stopHold}
        onPointerUp={stopHold}
        ref={buttonRef}
        title={
          canMode
            ? 'Roll. Shift for advantage, Alt for disadvantage, or press and hold for more.'
            : undefined
        }
        type="button"
      >
        {children}
      </button>
      {menu &&
        createPortal(
          <RollMenu
            items={items}
            label={roll.label}
            onClose={(returnFocus) => {
              setMenu(null)
              if (returnFocus) buttonRef.current?.focus()
            }}
            onSelect={(item) => run(item.mode, item.visibility)}
            place={menu}
          />,
          menu.target,
        )}
    </>
  )
}

function RollMenu({
  items,
  label,
  place,
  onSelect,
  onClose,
}: {
  items: MenuItem[]
  label: string
  place: MenuPlace
  onSelect: (item: MenuItem) => void
  onClose: (returnFocus: boolean) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const away = () => close.current(false)
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close.current(false)
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', away, true)
    }
  }, [])

  function onKeyDown(event: React.KeyboardEvent) {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    const at = entries.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      event.preventDefault()
      entries[(to + entries.length) % entries.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(at + 1)
    else if (event.key === 'ArrowUp') move(at - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(entries.length - 1)
    else if (event.key === 'Escape') {
      // The journal is a modal dialog; Escape closes this menu, not the journal behind it.
      event.preventDefault()
      event.stopPropagation()
      onClose(true)
    } else if (event.key === 'Tab') onClose(false)
  }

  return (
    <div
      aria-label={`Roll options for ${label}`}
      className="roll-menu"
      onKeyDown={onKeyDown}
      ref={menuRef}
      role="menu"
      style={{ left: place.left, top: place.top, bottom: place.bottom }}
    >
      {items.map((item) => (
        <button
          className="roll-menu__item"
          key={item.label}
          onClick={() => {
            onSelect(item)
            onClose(true)
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
