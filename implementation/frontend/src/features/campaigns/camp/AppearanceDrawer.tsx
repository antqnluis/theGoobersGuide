import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
import { decodeSprite, spritePrompt } from './customSprite'
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

/** An uploaded sprite, enlarged with hard pixels to about the size of the look preview. */
function SpritePreview({ encoded }: { encoded: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sprite = decodeSprite(encoded)
  const size = sprite?.size ?? adventurerSize.width

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context || !sprite) return
    const image = context.createImageData(sprite.size, sprite.size)
    new Uint32Array(image.data.buffer).set(sprite.pixels)
    context.putImageData(image, 0, 0)
  }, [sprite])

  return (
    <canvas
      aria-hidden="true"
      className="appearance-preview"
      height={size}
      ref={canvasRef}
      style={{ width: 96, height: 96 }}
      width={size}
    />
  )
}

type DrawerTab = 'look' | 'sprite'
const drawerTabs: readonly { id: DrawerTab; label: string }[] = [
  { id: 'look', label: 'Look' },
  { id: 'sprite', label: 'Sprite' },
]

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
  /** The player's uploaded 16 × 16 sprite (base64 RGBA), which replaces the look in the camp. */
  customSprite: string | null
  onUploadSprite: (file: File) => Promise<boolean>
  onRemoveSprite: () => Promise<boolean>
  spritePending: 'upload' | 'remove' | null
  spriteError: string | null
  onClearSpriteError: () => void
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
  customSprite,
  onUploadSprite,
  onRemoveSprite,
  spritePending,
  spriteError,
  onClearSpriteError,
}: AppearanceDrawerProps) {
  const [open, setOpen] = useState(false)
  const current = saved ?? defaultLook
  const [draft, setDraft] = useState(current)
  const panelId = useId()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const busy = pending !== null
  const spriteBusy = spritePending !== null
  const fileRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)
  const spriteHintId = useId()
  const [tab, setTab] = useState<DrawerTab>('look')
  const tabsId = useId()

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

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = drawerTabs.length - 1
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % drawerTabs.length
        : event.key === 'ArrowLeft'
          ? (index + last) % drawerTabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setTab(drawerTabs[next].id)
    document.getElementById(`${tabsId}-tab-${drawerTabs[next].id}`)?.focus()
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(spritePrompt)
      setCopied('done')
    } catch {
      // The text stays selectable below, so it can be copied by hand.
      setCopied('failed')
    }
  }

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

        <div className="camp-drawer__stage">
          <div className="camp-drawer__preview">
            {tab === 'sprite' && customSprite ? (
              <SpritePreview encoded={customSprite} />
            ) : (
              <AdventurerPreview look={tab === 'look' ? draft : current} />
            )}
          </div>
          <p className="camp-drawer__status">
            {customSprite ? 'At the fire now: your sprite.' : 'At the fire now: your look.'}{' '}
            <span>This campaign only.</span>
          </p>
        </div>

        <div aria-label="Appearance sections" className="camp-drawer__tabs" role="tablist">
          {drawerTabs.map(({ id, label }, index) => (
            <button
              aria-controls={`${tabsId}-panel-${id}`}
              aria-selected={tab === id}
              className="camp-drawer__tabpill"
              id={`${tabsId}-tab-${id}`}
              key={id}
              onClick={() => setTab(id)}
              onKeyDown={(event) => moveTab(event, index)}
              role="tab"
              tabIndex={tab === id ? 0 : -1}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`${tabsId}-tab-look`}
          className="camp-drawer__pane"
          hidden={tab !== 'look'}
          id={`${tabsId}-panel-look`}
          role="tabpanel"
        >
          {customSprite && (
            <p className="camp-drawer__note">
              Your sprite hides this look at the fire. The look returns if you remove the sprite.
            </p>
          )}

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
        </div>

        <div
          aria-labelledby={`${tabsId}-tab-sprite`}
          className="camp-drawer__pane"
          hidden={tab !== 'sprite'}
          id={`${tabsId}-panel-sprite`}
          role="tabpanel"
        >
          <ol className="camp-drawer__steps">
            <li>
              <strong>Make a picture.</strong>
              <details className="camp-drawer__prompt">
                <summary>Get a prompt for an image generator</summary>
                <p>Paste it into any image generator and fill in the part in brackets.</p>
                <textarea
                  aria-label="Image generator prompt"
                  className="camp-drawer__prompt-text"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  rows={7}
                  value={spritePrompt}
                />
                <button
                  className="camp-drawer__copy"
                  onClick={() => void copyPrompt()}
                  type="button"
                >
                  Copy prompt
                </button>
                <p aria-live="polite" role="status">
                  {copied === 'done' && 'Prompt copied.'}
                  {copied === 'failed' &&
                    "Couldn't copy automatically. Select the text and copy it."}
                </p>
              </details>
            </li>
            <li>
              <strong>Shrink it to 64 × 64 pixels.</strong>
              <span>
                Use nearest-neighbour scaling in a pixel editor such as Piskel or Aseprite, and keep
                the transparent background. 32 × 32 and 16 × 16 also work and stand a little
                smaller.
              </span>
            </li>
            <li>
              <strong>Upload the PNG.</strong>
              <span id={spriteHintId}>
                Everyone in the campaign sees it, and the campaign owner can remove it.
              </span>
            </li>
          </ol>

          <input
            accept="image/png"
            aria-describedby={spriteHintId}
            aria-label="Sprite PNG file"
            className="visually-hidden"
            disabled={spriteBusy}
            onChange={async (event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              input.value = ''
              if (file) await onUploadSprite(file)
            }}
            ref={fileRef}
            tabIndex={-1}
            type="file"
          />
          {spriteError && (
            <p className="journal-alert" role="alert">
              <PixelIcon name="flame" />
              {spriteError}
            </p>
          )}
          <div className="journal-actions">
            <button
              className="journal-button"
              disabled={spriteBusy}
              onClick={() => {
                onClearSpriteError()
                fileRef.current?.click()
              }}
              type="button"
            >
              {spritePending === 'upload'
                ? 'Uploading…'
                : customSprite
                  ? 'Replace sprite'
                  : 'Upload sprite'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={!customSprite || spriteBusy}
              onClick={() => void onRemoveSprite()}
              type="button"
            >
              {spritePending === 'remove' ? 'Removing…' : 'Remove sprite'}
            </button>
          </div>
        </div>
      </section>
    </aside>
  )
}
