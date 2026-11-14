import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { backgroundChoices, hueRange, type CampBackground } from './campBackground'

/** The element in the app header that holds the camp's settings button. */
export const campHeaderSlotId = 'camp-header-slot'

const subscribeNever = () => () => {}
const findHeaderSlot = () => document.getElementById(campHeaderSlotId)

/**
 * A gear in the header that opens a small panel for choosing the camp
 * background. It closes on Escape (focus returns to the gear), on a click
 * elsewhere, and on the gear itself.
 */
export function CampSettings({
  background,
  hue,
  onChange,
  onHueChange,
}: {
  background: CampBackground
  hue: number
  onChange: (background: CampBackground) => void
  onHueChange: (hue: number) => void
}) {
  const [open, setOpen] = useState(false)
  // The header slot is rendered by the app shell in the same commit that mounts
  // the camp, so it is not in the document yet during this component's first render.
  // useSyncExternalStore re-reads it right after commit, before paint.
  const slot = useSyncExternalStore(subscribeNever, findHeaderSlot, () => null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const root = rootRef.current
    root?.querySelector<HTMLInputElement>('input:checked')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const control = (
    <div
      className="camp-settings"
      onBlur={(event) => {
        // Tabbing out of the panel closes it; a click inside never moves focus outside.
        const next = event.relatedTarget
        if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false)
      }}
      ref={rootRef}
    >
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label="Camp background settings"
        className="camp-settings__button"
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <svg aria-hidden="true" focusable="false" height="22" viewBox="0 0 24 24" width="22">
          <path
            d="M19.4 13a7.9 7.9 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1L14.4 3a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.9 7.9 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.2.4.5.4h4c.3 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {open && (
        <div
          aria-labelledby={`${panelId}-title`}
          className="camp-settings__panel"
          id={panelId}
          role="group"
        >
          <p className="camp-settings__title" id={`${panelId}-title`}>
            Camp background
          </p>
          {backgroundChoices.map(({ value, label, detail }) => (
            <label className="camp-settings__choice" key={value}>
              <input
                checked={background === value}
                name="camp-background"
                onChange={() => onChange(value)}
                type="radio"
                value={value}
              />
              <span>
                {label}
                <small>{detail}</small>
              </span>
            </label>
          ))}
          <div className="camp-settings__hue">
            <label htmlFor={`${panelId}-hue`}>
              Hue
              <output htmlFor={`${panelId}-hue`}>{hue > 0 ? `+${hue}` : hue}°</output>
            </label>
            <input
              aria-valuetext={`${hue} degrees`}
              id={`${panelId}-hue`}
              max={hueRange.max}
              min={hueRange.min}
              onChange={(event) => onHueChange(Number(event.currentTarget.value))}
              step={hueRange.step}
              type="range"
              value={hue}
            />
            <button disabled={hue === 0} onClick={() => onHueChange(0)} type="button">
              Reset hue
            </button>
          </div>
          <p className="camp-settings__note">Saved on this device for this campaign.</p>
        </div>
      )}
    </div>
  )

  // In the app the button lives in the header; without it the control stays inline.
  return slot ? createPortal(control, slot) : control
}
