import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { DiceFailureNotice, DiceResult } from './DiceResult'
import { DiceLog } from './DiceLog'
import { DeviceIcon, RepeatIcon, WarnIcon } from './DiceIcons'
import { useDice } from './useDice'
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
export function DiceTray({ onClose }: { onClose: () => void }) {
  const dice = useDice()
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
    onClose()
  }

  const result = dice.result
  return (
    <section
      aria-label="Dice tray"
      className="dice-tray"
      id="dice-tray"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header className="dice-tray__bar">
        <div>
          <h2 className="dice-tray__title">Dice</h2>
          <p className="dice-tray__status" data-live={dice.log.live}>
            {status.icon}
            {status.text}
          </p>
        </div>
        <button className="dice-tray__close" onClick={onClose} type="button">
          Close
        </button>
      </header>

      <div className="dice-tray__scroll">
        <div className="dice-tray__body">
          <DiceResult
            characterName={result ? dice.characterName(result) : null}
            pendingTitle={dice.pending?.title ?? null}
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
