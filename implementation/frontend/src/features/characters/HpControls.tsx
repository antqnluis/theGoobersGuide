import { useId, useState } from 'react'
import { RollButton, type SheetRoll } from '../dice/RollButton'
import { concentrationDc, type HpKind } from './resourceRules'
import { parseHpAmount } from './resourceValidation'
import type { ResourceActions } from './useResourceActions'

export type HpDisplay = {
  max_hp: number | null
  current_hp: number | null
  temp_hp: number
}

type HpControlsProps = {
  characterId: string
  hp: HpDisplay
  /** Without it the card only shows the numbers (another member's sheet). */
  live?: Pick<ResourceActions, 'changeHp'>
  /** The Constitution save for a concentration check, labelled with the DC. */
  concentrationRoll?: (dc: number) => SheetRoll
}

type Prompt = { spell: string; dc: number }

const verbs: Record<HpKind, (amount: number) => string> = {
  damage: (amount) => `Took ${amount} damage.`,
  heal: (amount) => `Healed ${amount}.`,
  temp: (amount) => `Temporary HP: ${amount}.`,
}

/** Hit points at the table: the bar and numbers, and Damage, Heal, and Temp in one tap (M04 L3). */
export function HpControls({ characterId, hp, live, concentrationRoll }: HpControlsProps) {
  const inputId = useId()
  const [amount, setAmount] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [prompt, setPrompt] = useState<Prompt | null>(null)

  const known = hp.max_hp !== null && hp.current_hp !== null
  const share = known && hp.max_hp! > 0 ? Math.min(1, Math.max(0, hp.current_hp! / hp.max_hp!)) : 0

  async function apply(kind: HpKind) {
    if (!live) return
    const value = parseHpAmount(amount)
    if (value === null) {
      setProblem('Enter a whole number from 1 to 9,999.')
      return
    }
    setProblem(null)
    setPrompt(null)
    setAmount('')
    const change = await live.changeHp(characterId, kind, value)
    if (!change) return
    setAnnouncement(`${verbs[kind](value)} ${change.current_hp} hit points.`)
    if (kind === 'damage' && change.concentration && change.damage_taken > 0) {
      setPrompt({ spell: change.concentration, dc: concentrationDc(change.damage_taken) })
    }
  }

  return (
    <div aria-labelledby={`${inputId}-label`} className="hp-card" role="group">
      <div className="hp-card__readout">
        <p className="hp-card__label" id={`${inputId}-label`}>
          Hit points
        </p>
        <p className="hp-card__value">
          <span className="hp-card__current">{hp.current_hp ?? '–'}</span>
          <span className="hp-card__max"> / {hp.max_hp ?? '–'}</span>
          {hp.temp_hp > 0 && <span className="hp-card__temp">+{hp.temp_hp} temp</span>}
        </p>
        <div
          aria-hidden="true"
          className="hp-card__bar"
          data-low={known && share <= 0.25 ? '' : undefined}
        >
          <span style={{ width: `${share * 100}%` }} />
        </div>
        {!known && <p className="hp-card__hint">Not set</p>}
      </div>

      {live && (
        <form
          className="hp-card__controls"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <div className="hp-card__amount">
            <label htmlFor={inputId}>Amount</label>
            <input
              aria-describedby={problem ? `${inputId}-error` : undefined}
              aria-invalid={problem ? true : undefined}
              className="journal-input"
              id={inputId}
              inputMode="numeric"
              onChange={(event) => {
                setAmount(event.target.value)
                setProblem(null)
              }}
              placeholder="0"
              value={amount}
            />
          </div>
          <div className="hp-card__buttons">
            <button
              className="journal-button journal-button--danger"
              disabled={!known}
              onClick={() => void apply('damage')}
              type="button"
            >
              Damage
            </button>
            <button
              className="journal-button"
              disabled={!known}
              onClick={() => void apply('heal')}
              type="button"
            >
              Heal
            </button>
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void apply('temp')}
              type="button"
            >
              Temp HP
            </button>
          </div>
          {problem && (
            <p className="hp-card__problem" id={`${inputId}-error`} role="alert">
              {problem}
            </p>
          )}
          {!known && (
            <p className="hp-card__hint">
              Set maximum and current HP in Edit character to use Damage and Heal.
            </p>
          )}
        </form>
      )}

      <p className="visually-hidden" role="status">
        {announcement}
      </p>

      {prompt && (
        <div className="hp-card__prompt" role="status">
          <p>
            Concentrating on <strong>{prompt.spell}</strong>. Constitution save, DC {prompt.dc}.
          </p>
          <div className="hp-card__prompt-actions">
            {concentrationRoll && (
              <RollButton roll={concentrationRoll(prompt.dc)} variant="chip">
                Roll concentration save
              </RollButton>
            )}
            <button
              className="journal-button journal-button--ghost"
              onClick={() => setPrompt(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
