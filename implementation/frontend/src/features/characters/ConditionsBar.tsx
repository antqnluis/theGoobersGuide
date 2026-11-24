import { useId, useState } from 'react'
import { standardConditions, type CharacterStatusState } from './characterTypes'
import { conditionLabel, conditionReminder, normalizeCondition } from './resourceRules'
import { resourceLimits, validateCondition, validateConcentration } from './resourceValidation'
import type { ResourceActions } from './useResourceActions'

type ConditionsBarProps = {
  characterId: string
  status: CharacterStatusState
  /** Without it the bar only shows what is set (another member's sheet). */
  live?: Pick<ResourceActions, 'saveStatus' | 'pendingAction'>
}

/** Conditions, exhaustion, concentration, and heroic inspiration (M04 L2, L8, L9). */
export function ConditionsBar({ characterId, status, live }: ConditionsBarProps) {
  const id = useId()
  const [condition, setCondition] = useState('')
  const [conditionProblem, setConditionProblem] = useState<string | null>(null)
  const [spell, setSpell] = useState('')
  const [spellProblem, setSpellProblem] = useState<string | null>(null)

  const saving = live?.pendingAction?.action === 'status'
  const { conditions, exhaustion, concentration, inspiration } = status

  const save = (patch: Partial<CharacterStatusState>) => live?.saveStatus(characterId, patch)

  async function addCondition() {
    const problem = validateCondition(condition, conditions)
    setConditionProblem(problem)
    if (problem) return
    if (await save({ conditions: [...conditions, normalizeCondition(condition)] })) {
      setCondition('')
    }
  }

  async function startConcentration() {
    const name = spell.trim()
    const problem =
      name === '' ? 'Enter the spell you are concentrating on.' : validateConcentration(name)
    setSpellProblem(problem)
    if (problem) return
    if (await save({ concentration: name })) setSpell('')
  }

  const available = standardConditions.filter(
    (entry) => !conditions.some((current) => current.toLowerCase() === entry.key),
  )
  const quiet = conditions.length === 0 && exhaustion === 0 && !concentration && !inspiration

  // Another member sees only what is set, and nothing at all when nothing is.
  if (!live && quiet) return null

  return (
    <section aria-label="Conditions and status" className="status-bar">
      {conditions.length > 0 && (
        <ul aria-label="Conditions" className="status-bar__chips">
          {conditions.map((entry) => {
            const reminder = conditionReminder(entry)
            return (
              <li className="status-chip" key={entry}>
                <span className="status-chip__label">{conditionLabel(entry)}</span>
                {live && (
                  <button
                    aria-label={`Remove ${conditionLabel(entry)}`}
                    className="status-chip__remove"
                    disabled={saving}
                    onClick={() => void save({ conditions: conditions.filter((c) => c !== entry) })}
                    type="button"
                  >
                    ×
                  </button>
                )}
                {reminder && <span className="status-chip__reminder">{reminder}</span>}
              </li>
            )
          })}
        </ul>
      )}

      {concentration && (
        <p className="status-bar__line">
          <span className="status-bar__key">Concentrating</span> {concentration}
          {live && (
            <button
              className="journal-button journal-button--ghost status-bar__small"
              disabled={saving}
              onClick={() => void save({ concentration: null })}
              type="button"
            >
              End
            </button>
          )}
        </p>
      )}

      {!live && exhaustion > 0 && (
        <p className="status-bar__line">
          <span className="status-bar__key">Exhaustion</span> level {exhaustion}
        </p>
      )}
      {!live && inspiration && (
        <p className="status-bar__line">
          <span className="status-bar__key">Heroic inspiration</span>
        </p>
      )}

      {live && (
        <div className="status-bar__controls">
          <div className="status-bar__row">
            <span className="status-bar__key" id={`${id}-exhaustion`}>
              Exhaustion
            </span>
            <span aria-labelledby={`${id}-exhaustion`} className="status-bar__stepper" role="group">
              <button
                aria-label="Lower exhaustion"
                className="journal-button journal-button--secondary status-bar__step"
                disabled={saving || exhaustion <= 0}
                onClick={() => void save({ exhaustion: exhaustion - 1 })}
                type="button"
              >
                −
              </button>
              <output aria-live="polite" className="status-bar__level">
                {exhaustion}
              </output>
              <button
                aria-label="Raise exhaustion"
                className="journal-button journal-button--secondary status-bar__step"
                disabled={saving || exhaustion >= resourceLimits.exhaustion}
                onClick={() => void save({ exhaustion: exhaustion + 1 })}
                type="button"
              >
                +
              </button>
            </span>
            <button
              aria-pressed={inspiration}
              className="journal-button journal-button--secondary status-bar__toggle"
              disabled={saving}
              onClick={() => void save({ inspiration: !inspiration })}
              type="button"
            >
              Heroic inspiration
            </button>
          </div>

          <details className="status-bar__more">
            <summary>Add condition or concentration</summary>
            <form
              className="status-bar__row"
              onSubmit={(event) => {
                event.preventDefault()
                void addCondition()
              }}
            >
              <label className="status-bar__key" htmlFor={`${id}-condition`}>
                Add condition
              </label>
              <input
                aria-describedby={conditionProblem ? `${id}-condition-error` : undefined}
                aria-invalid={conditionProblem ? true : undefined}
                className="journal-input"
                id={`${id}-condition`}
                list={`${id}-conditions`}
                onChange={(event) => {
                  setCondition(event.target.value)
                  setConditionProblem(null)
                }}
                placeholder="Poisoned, or your own"
                value={condition}
              />
              <datalist id={`${id}-conditions`}>
                {available.map((entry) => (
                  <option key={entry.key} value={entry.label} />
                ))}
              </datalist>
              <button
                className="journal-button journal-button--secondary"
                disabled={saving}
                type="submit"
              >
                Add
              </button>
              {conditionProblem && (
                <p className="status-bar__problem" id={`${id}-condition-error`} role="alert">
                  {conditionProblem}
                </p>
              )}
            </form>

            <form
              className="status-bar__row"
              onSubmit={(event) => {
                event.preventDefault()
                void startConcentration()
              }}
            >
              <label className="status-bar__key" htmlFor={`${id}-spell`}>
                Concentrating on
              </label>
              <input
                aria-describedby={spellProblem ? `${id}-spell-error` : undefined}
                aria-invalid={spellProblem ? true : undefined}
                className="journal-input"
                id={`${id}-spell`}
                onChange={(event) => {
                  setSpell(event.target.value)
                  setSpellProblem(null)
                }}
                placeholder="Spell name"
                value={spell}
              />
              <button
                className="journal-button journal-button--secondary"
                disabled={saving}
                type="submit"
              >
                {concentration ? 'Replace' : 'Start'}
              </button>
              {spellProblem && (
                <p className="status-bar__problem" id={`${id}-spell-error`} role="alert">
                  {spellProblem}
                </p>
              )}
            </form>
          </details>
        </div>
      )}
    </section>
  )
}
