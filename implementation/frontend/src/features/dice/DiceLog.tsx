import { NaturalChip, RollBreakdown, RollScope } from './DiceResult'
import { groupByMinute, isConstantOnly, rollTitle, type DiceRollRecord } from './diceRules'
import type { DiceLogState } from './diceContext'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** The table's rolls, newest first, grouped by minute. Every state of the log reads in words. */
export function DiceLog({
  log,
  inCampaign,
  rollerName,
  characterName,
}: {
  log: DiceLogState
  inCampaign: boolean
  rollerName: (roll: DiceRollRecord) => string
  characterName: (roll: DiceRollRecord) => string | null
}) {
  if (log.isLoading) {
    return (
      <p className="dice-log__state" role="status">
        Loading the table’s rolls…
      </p>
    )
  }

  if (log.isError && log.records.length === 0) {
    return (
      <div className="dice-log__state" role="alert">
        <p>Couldn’t load the table’s rolls.</p>
        <button className="dice-button-secondary" onClick={log.refetch} type="button">
          Try again
        </button>
      </div>
    )
  }

  if (log.records.length === 0) {
    return (
      <p className="dice-log__state">
        {inCampaign
          ? 'The table is quiet. Everyone’s rolls show up here as they happen.'
          : 'Rolls you make here show up in this list until you reload the page.'}
      </p>
    )
  }

  return (
    <div className="dice-log">
      {groupByMinute(log.records).map((group) => (
        <section className="dice-log__group" key={group.key}>
          <h3 className="dice-log__time">
            <time dateTime={group.time.toISOString()}>{timeFormat.format(group.time)}</time>
          </h3>
          <ul className="dice-log__list">
            {group.rolls.map((roll) => {
              const character = characterName(roll)
              return (
                <li className="dice-entry" key={roll.id}>
                  <div className="dice-entry__line">
                    <p className="dice-entry__who">
                      <strong>{rollerName(roll)}</strong>
                      {character ? ` as ${character}` : ''}
                      {' · '}
                      {rollTitle(roll)}
                    </p>
                    <p className="dice-entry__total">
                      <span className="dice-sr">Total </span>
                      {roll.total}
                    </p>
                  </div>
                  {roll.label && <p className="dice-entry__expression">{roll.expression}</p>}
                  <RollBreakdown roll={roll} />
                  <div className="dice-entry__marks">
                    <NaturalChip roll={roll} />
                    <RollScope roll={roll} />
                    {isConstantOnly(roll) && <span className="dice-chip">No dice</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {log.hasMore && (
        <button
          className="dice-button-secondary"
          disabled={log.isLoadingMore}
          onClick={log.loadMore}
          type="button"
        >
          {log.isLoadingMore ? 'Loading older rolls…' : 'Show older rolls'}
        </button>
      )}
    </div>
  )
}
