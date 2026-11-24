import { useState } from 'react'
import { useDice } from '../dice/useDice'
import { deathSaveOutcome, deathSaveRoll } from './resourceRules'
import type { ResourceActions } from './useResourceActions'

type DeathSavesProps = {
  characterId: string
  successes: number
  failures: number
  /** Without it the track is display only (another member's sheet). */
  live?: Pick<ResourceActions, 'saveDeathSave' | 'saveStatus'>
}

/** The save track shown at 0 HP, with the server-rolled "Roll death save" (M04 L7). */
export function DeathSaves({ characterId, successes, failures, live }: DeathSavesProps) {
  const dice = useDice()
  const [rolling, setRolling] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function roll() {
    if (!live) return
    setProblem(null)
    setRolling(true)
    try {
      const { label, spec, source } = deathSaveRoll(characterId)
      const outcome = await dice.roll({ spec, label, source, characterId })
      if (!outcome.ok) {
        if (!outcome.reported) setProblem(outcome.message)
        return
      }
      const natural = outcome.roll.dice[0]?.find((face) => face.kept)?.value
      if (natural === undefined) return
      await live.saveDeathSave(characterId, deathSaveOutcome(natural))
    } finally {
      setRolling(false)
    }
  }

  /** Tapping the last filled pip clears it; any other pip fills the track up to it. */
  const setCount = (
    field: 'death_save_successes' | 'death_save_failures',
    now: number,
    to: number,
  ) => live?.saveStatus(characterId, { [field]: now === to ? to - 1 : to })

  const track = (
    label: string,
    field: 'death_save_successes' | 'death_save_failures',
    count: number,
  ) => (
    <div
      className="death-saves__track"
      data-kind={field === 'death_save_successes' ? 'success' : 'failure'}
    >
      <span className="death-saves__name">{label}</span>
      <span className="death-saves__pips">
        {[1, 2, 3].map((n) =>
          live ? (
            <button
              aria-label={`${label} ${n} of 3`}
              aria-pressed={count >= n}
              className="death-saves__pip"
              key={n}
              onClick={() => void setCount(field, count, n)}
              type="button"
            />
          ) : (
            <span
              aria-hidden="true"
              className="death-saves__pip"
              data-on={count >= n || undefined}
              key={n}
            />
          ),
        )}
      </span>
      {!live && <span className="visually-hidden">{`${label}: ${count} of 3`}</span>}
    </div>
  )

  return (
    <section aria-label="Death saves" className="death-saves">
      <div className="death-saves__tracks">
        {track('Successes', 'death_save_successes', successes)}
        {track('Failures', 'death_save_failures', failures)}
      </div>
      {live && (
        <button
          aria-busy={rolling || undefined}
          className="journal-button"
          disabled={rolling}
          onClick={() => void roll()}
          type="button"
        >
          {rolling ? 'Rolling…' : 'Roll death save'}
        </button>
      )}
      {problem && (
        <p className="death-saves__note" role="alert">
          {problem}
        </p>
      )}
      {failures >= 3 && (
        <p className="death-saves__note" role="status">
          Three failures. If the character has died, mark them deceased below.
        </p>
      )}
      {successes >= 3 && failures < 3 && (
        <p className="death-saves__note" role="status">
          Three successes. The character is stable.
        </p>
      )}
    </section>
  )
}
