import { useEffect, useId, useRef, useState } from 'react'
import { PixelIcon } from '../../characters/PixelIcon'
import {
  cloakCount,
  headwear as headwearChoices,
  packs as packChoices,
  skinCount,
  type AdventurerAppearance,
} from './adventurerAppearance'
import { adventurerSize, renderAdventurer } from './adventurerSprites'
import { sameAppearance } from './campAppearance'
import { masterFixed } from './masterPalette'

const cloakNames = ['Crimson', 'Blue', 'Green', 'Violet', 'Gold', 'Teal', 'Russet', 'Slate']
const headwearNames = { hood: 'Hood', hat: 'Hat', cap: 'Cap', bare: 'Bare' } as const
const packNames = {
  satchel: 'Satchel',
  bedroll: 'Bedroll',
  quiver: 'Quiver',
  none: 'None',
} as const

/** The finished sprite, enlarged with hard pixels; it breathes unless motion is reduced. */
export function AdventurerPreview({
  look,
  scale = 6,
}: {
  look: AdventurerAppearance
  scale?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState<0 | 1>(0)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setFrame((current) => (current === 0 ? 1 : 0)), 500)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const { width, height } = adventurerSize
    const image = context.createImageData(width, height)
    // Packed pixels are little-endian RGBA, the same layout as ImageData.
    new Uint32Array(image.data.buffer).set(renderAdventurer(look, frame))
    context.putImageData(image, 0, 0)
  }, [look, frame])

  return (
    <canvas
      aria-hidden="true"
      className="appearance-preview"
      height={adventurerSize.height}
      ref={canvasRef}
      style={{ width: adventurerSize.width * scale, height: adventurerSize.height * scale }}
      width={adventurerSize.width}
    />
  )
}

type AppearanceDrawerProps = {
  /** The look the camp draws for this player without a saved one. */
  defaultLook: AdventurerAppearance
  /** The player's saved look for this campaign, if any. */
  saved: AdventurerAppearance | null
  onSave: (look: AdventurerAppearance) => Promise<boolean>
  onReset: () => Promise<boolean>
  pending: 'save' | 'reset' | null
  error: string | null
  onClearError: () => void
}

/**
 * A tab on the side of the Party journal that opens a drawer for choosing how the
 * player's adventurer looks at the fire in this campaign. Collapsed by default.
 */
export function AppearanceDrawer({
  defaultLook,
  saved,
  onSave,
  onReset,
  pending,
  error,
  onClearError,
}: AppearanceDrawerProps) {
  const [open, setOpen] = useState(false)
  const current = saved ?? defaultLook
  const [draft, setDraft] = useState(current)
  const panelId = useId()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const busy = pending !== null

  // A saved or reset look (here or on another device) becomes the starting point again.
  const [syncedTo, setSyncedTo] = useState(current)
  if (!sameAppearance(syncedTo, current)) {
    setSyncedTo(current)
    setDraft(current)
  }

  const change = (patch: Partial<AdventurerAppearance>) => {
    onClearError()
    setDraft((look) => ({ ...look, ...patch }))
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) requestAnimationFrame(() => headingRef.current?.focus())
  }

  const dirty = !sameAppearance(draft, current)

  return (
    <aside className="camp-drawer" data-open={open || undefined}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="camp-drawer__tab"
        onClick={toggle}
        type="button"
      >
        <PixelIcon name="quill" />
        <span>Appearance</span>
      </button>

      <section
        aria-labelledby={headingId}
        className="camp-drawer__panel"
        hidden={!open}
        id={panelId}
      >
        <h3 id={headingId} ref={headingRef} tabIndex={-1}>
          Your look at the fire
        </h3>
        <p className="camp-drawer__hint">
          How your adventurer appears around the fire in this campaign. Only this campaign changes.
        </p>

        <div className="camp-drawer__preview">
          <AdventurerPreview look={draft} />
        </div>

        <fieldset className="camp-drawer__group" disabled={busy}>
          <legend>Cloak</legend>
          <div className="camp-drawer__swatches">
            {Array.from({ length: cloakCount }, (_, index) => (
              <label className="camp-swatch" key={index}>
                <input
                  checked={draft.cloak === index}
                  name="appearance-cloak"
                  onChange={() => change({ cloak: index })}
                  type="radio"
                />
                <span
                  className="camp-swatch__chip"
                  style={{ background: masterFixed[`cloak${index}`][1] }}
                />
                <span className="visually-hidden">{cloakNames[index]} cloak</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="camp-drawer__group" disabled={busy}>
          <legend>Skin tone</legend>
          <div className="camp-drawer__swatches">
            {Array.from({ length: skinCount }, (_, index) => (
              <label className="camp-swatch" key={index}>
                <input
                  checked={draft.skin === index}
                  name="appearance-skin"
                  onChange={() => change({ skin: index })}
                  type="radio"
                />
                <span
                  className="camp-swatch__chip"
                  style={{ background: masterFixed[`skin${index}`][1] }}
                />
                <span className="visually-hidden">Skin tone {index + 1}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="camp-drawer__group" disabled={busy}>
          <legend>Headwear</legend>
          <div className="camp-drawer__options">
            {headwearChoices.map((choice) => (
              <label className="camp-option" key={choice}>
                <input
                  checked={draft.headwear === choice}
                  name="appearance-headwear"
                  onChange={() => change({ headwear: choice })}
                  type="radio"
                />
                <span>{headwearNames[choice]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="camp-drawer__group" disabled={busy}>
          <legend>Pack</legend>
          <div className="camp-drawer__options">
            {packChoices.map((choice) => (
              <label className="camp-option" key={choice}>
                <input
                  checked={draft.pack === choice}
                  name="appearance-pack"
                  onChange={() => change({ pack: choice })}
                  type="radio"
                />
                <span>{packNames[choice]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="journal-alert" role="alert">
            <PixelIcon name="flame" />
            {error}
          </p>
        )}

        <div className="journal-actions">
          <button
            className="journal-button"
            disabled={!dirty || busy}
            onClick={() => void onSave(draft)}
            type="button"
          >
            {pending === 'save' ? 'Saving…' : 'Save look'}
          </button>
          <button
            className="journal-button journal-button--ghost"
            disabled={!saved || busy}
            onClick={() => void onReset()}
            type="button"
          >
            {pending === 'reset' ? 'Resetting…' : 'Reset to default'}
          </button>
        </div>
      </section>
    </aside>
  )
}
