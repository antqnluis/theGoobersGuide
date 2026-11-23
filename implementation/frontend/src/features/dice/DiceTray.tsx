import {
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { DiceFailureNotice, DiceResult } from './DiceResult'
import { DiceLog } from './DiceLog'
import { DeviceIcon, MoveIcon, PinIcon, RepeatIcon, ResizeIcon, WarnIcon } from './DiceIcons'
import { useDice } from './useDice'
import type { DiceArrangement } from './useDiceLayout'
import type { RollMode } from './diceTypes'

const quickDice = [4, 6, 8, 10, 12, 20, 100] as const

const modes: { value: RollMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'advantage', label: 'Advantage' },
  { value: 'disadvantage', label: 'Disadvantage' },
]

function liveStatus(inCampaign: boolean, live: string) {
  if (!inCampaign) {
    return { icon: <DeviceIcon size={16} />, text: 'On this device only — not saved' }
  }
  if (live === 'live') return { icon: null, text: 'Live with the table' }
  if (live === 'paused') return { icon: <WarnIcon size={16} />, text: 'Live updates paused' }
  return { icon: null, text: 'Connecting to the table…' }
}

/**
 * The tray: the latest roll, a way to roll anything, and the table's log. Every roll goes through
 * `useDice().roll`, so the sheet's buttons and the text chips share its result and its log.
 */
export function DiceTray({
  arrangement,
  onClose,
  onEscape,
  trayRef,
}: {
  arrangement: DiceArrangement
  /** Shuts the tray, and unpins it. */
  onClose: () => void
  /** Escape: shuts the tray unless it is pinned. */
  onEscape: () => void
  /** The element the layout moves and measures. */
  trayRef: RefObject<HTMLElement | null>
}) {
  const dice = useDice()
  const arrangeHelpId = useId()
  const [inputError, setInputError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const status = liveStatus(dice.inCampaign, dice.log.live)
  const visibility = dice.isPrivate && dice.inCampaign ? 'self' : 'campaign'

  async function rollTyped(event: FormEvent) {
    event.preventDefault()
    setInputError(null)
    const outcome = await dice.roll({
      text: dice.draft,
      mode: dice.mode,
      visibility,
      source: 'tray',
    })
    if (!outcome.ok && !outcome.reported) setInputError(outcome.message)
  }

  async function rollQuick(sides: number) {
    setInputError(null)
    const outcome = await dice.roll({
      spec: { terms: [{ kind: 'dice', sign: 1, count: 1, sides }] },
      // Advantage and disadvantage only mean something on a d20.
      mode: sides === 20 ? dice.mode : 'normal',
      visibility,
      source: 'tray',
    })
    if (!outcome.ok && !outcome.reported) setInputError(outcome.message)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    // The journal is a modal dialog; Escape here closes the tray, not the journal behind it.
    event.preventDefault()
    event.stopPropagation()
    onEscape()
  }

  function onBarPointerDown(event: PointerEvent<HTMLElement>) {
    // The whole bar drags the tray, except its buttons.
    if ((event.target as HTMLElement).closest('button')) return
    arrangement.startMove(event)
  }

  const result = dice.result
  return (
    <section
      aria-label="Dice tray"
      className="dice-tray"
      id="dice-tray"
      onKeyDown={onKeyDown}
      ref={trayRef}
      style={arrangement.trayStyle}
      tabIndex={-1}
    >
      {arrangement.arrangeable && (
        <>
          <button
            aria-describedby={arrangeHelpId}
            aria-label="Resize dice tray"
            className="dice-tray__resize"
            onKeyDown={arrangement.resizeByKey}
            onPointerDown={arrangement.startResize}
            title="Drag to resize"
            type="button"
          >
            <ResizeIcon size={18} />
          </button>
          <p className="dice-sr" id={arrangeHelpId}>
            Drag, or use the arrow keys. Hold Shift for bigger steps. Home puts it back.
          </p>
        </>
      )}
      <header
        className="dice-tray__bar"
        data-arrangeable={arrangement.arrangeable ? '' : undefined}
        onPointerDown={onBarPointerDown}
      >
        <div className="dice-tray__heading">
          <h2 className="dice-tray__title">Dice</h2>
          <p className="dice-tray__status" data-live={dice.log.live}>
            {status.icon}
            {status.text}
          </p>
        </div>
        <div className="dice-tray__actions">
          {arrangement.arrangeable && (
            <>
              {arrangement.arranged && (
                <button
                  className="dice-tray__tool"
                  onClick={arrangement.reset}
                  title="Put the tray back in its corner at its usual size"
                  type="button"
                >
                  Reset
                </button>
              )}
              <button
                aria-describedby={arrangeHelpId}
                className="dice-tray__tool"
                onKeyDown={arrangement.moveByKey}
                onPointerDown={arrangement.startMove}
                title="Drag to move"
                type="button"
              >
                <MoveIcon size={16} />
                Move
              </button>
              <button
                aria-pressed={arrangement.pinned}
                className="dice-tray__tool"
                onClick={() => arrangement.setPinned(!arrangement.pinned)}
                title="Keep the tray open"
                type="button"
              >
                <PinIcon size={16} />
                {arrangement.pinned ? 'Pinned' : 'Pin'}
              </button>
            </>
          )}
          <button className="dice-tray__close" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </header>

      <div className="dice-tray__scroll">
        <div className="dice-tray__body">
          <DiceResult
            characterName={result ? dice.characterName(result) : null}
            onCritical={dice.critical ? () => void dice.rollCritical() : undefined}
            pendingTitle={dice.pending?.title ?? null}
            resultAt={dice.resultAt}
            roll={result}
            rollerName={result ? dice.rollerName(result) : ''}
          />

          {dice.failure && (
            <DiceFailureNotice
              canRollLocally={dice.failure.canRollLocally}
              message={dice.failure.message}
              onDismiss={dice.dismissFailure}
              onRetry={dice.retry}
              onRollLocally={dice.rollLocally}
            />
          )}

          <form className="dice-form" onSubmit={rollTyped}>
            <label className="dice-form__label" htmlFor={inputId}>
              Roll
            </label>
            <div className="dice-form__row">
              <input
                aria-describedby={inputError ? errorId : undefined}
                aria-invalid={inputError ? true : undefined}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className="dice-input"
                id={inputId}
                inputMode="text"
                onChange={(event) => {
                  dice.setDraft(event.target.value)
                  setInputError(null)
                }}
                placeholder="2d6 + 3"
                spellCheck={false}
                type="text"
                value={dice.draft}
              />
              <button
                className="dice-button"
                disabled={Boolean(dice.pending) || dice.draft.trim() === ''}
                type="submit"
              >
                Roll
              </button>
            </div>
            {inputError && (
              <p className="dice-form__error" id={errorId} role="alert">
                {inputError}
              </p>
            )}
          </form>

          <div aria-label="Quick dice" className="dice-quick" role="group">
            {quickDice.map((sides) => (
              <button
                className="dice-button-secondary dice-quick__die"
                disabled={Boolean(dice.pending)}
                key={sides}
                onClick={() => void rollQuick(sides)}
                type="button"
              >
                d{sides}
              </button>
            ))}
          </div>

          <fieldset className="dice-modes">
            <legend>For a d20</legend>
            {modes.map((entry) => (
              <label className="dice-mode" key={entry.value}>
                <input
                  checked={dice.mode === entry.value}
                  name="dice-mode"
                  onChange={() => dice.setMode(entry.value)}
                  type="radio"
                  value={entry.value}
                />
                <span>{entry.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="dice-options">
            {dice.inCampaign ? (
              <label className="dice-check">
                <input
                  checked={dice.isPrivate}
                  onChange={(event) => dice.setPrivate(event.target.checked)}
                  type="checkbox"
                />
                <span>Only I can see my rolls</span>
              </label>
            ) : (
              <p className="dice-options__note">
                Outside a campaign, rolls stay on this device and are lost on reload.
              </p>
            )}
            <button
              className="dice-button-secondary"
              disabled={!dice.canRepeat || Boolean(dice.pending)}
              onClick={() => void dice.repeat()}
              type="button"
            >
              <RepeatIcon size={16} />
              Roll again
            </button>
          </div>
        </div>

        <div className="dice-tray__log">
          <h3 className="dice-tray__log-title">
            {dice.inCampaign ? 'At the table' : 'This device'}
          </h3>
          <DiceLog
            characterName={dice.characterName}
            inCampaign={dice.inCampaign}
            log={dice.log}
            rollerName={dice.rollerName}
          />
        </div>
      </div>
    </section>
  )
}
