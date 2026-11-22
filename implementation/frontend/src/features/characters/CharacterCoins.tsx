import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { coinLogOptions } from './characterQueries'
import { PixelIcon } from './PixelIcon'
import { denominations, type CharacterPurse, type Denomination } from './characterTypes'
import { describeCoins, describeTransaction, formatPurseValue, planSpend } from './inventoryRules'
import { parseCoinInput, type CoinErrors, type CoinInput } from './inventoryValidation'
import type { useCharacterActions } from './useCharacterActions'

export type CoinActions = Pick<
  ReturnType<typeof useCharacterActions>,
  'adjustCurrency' | 'pendingAction' | 'pendingCharacterId'
>

const coinNames: Record<Denomination, string> = {
  cp: 'Copper',
  sp: 'Silver',
  gp: 'Gold',
}

// Gold first: it is what players count and spend most.
const coinOrder: readonly Denomination[] = ['gp', 'sp', 'cp']

const format = (value: number) => value.toLocaleString('en-US')

const describeAmounts = describeCoins

/** A character's coin purse. Owners add and spend coins; everyone else only reads. */
export function CharacterCoins({
  actions,
  characterId,
  onNotice,
  purse,
  userId,
}: {
  /** Present only for the owner; without it the purse is read-only. */
  actions?: CoinActions
  characterId: string
  onNotice?: (notice: string) => void
  purse: CharacterPurse
  userId: string
}) {
  const [input, setInput] = useState<CoinInput>({})
  const [errors, setErrors] = useState<CoinErrors>({})
  const pendingNow =
    actions?.pendingAction === 'currency' && actions.pendingCharacterId === characterId
  const [mode, setMode] = useState<'add' | 'spend' | null>(null)
  // The log is only fetched once it is opened.
  const [logOpen, setLogOpen] = useState(false)
  const adding = pendingNow && mode === 'add'
  const spending = pendingNow && mode === 'spend'
  const idFor = (coin: Denomination) => `coin-${characterId}-${coin}`
  const formErrorId = `coin-form-error-${characterId}`

  async function submit(kind: 'add' | 'spend') {
    if (!actions || pendingNow) return
    const { amounts, errors: found } = parseCoinInput(input)
    setErrors(found)
    const firstBad = coinOrder.find((coin) => found[coin])
    if (firstBad) {
      document.getElementById(idFor(firstBad))?.focus()
      return
    }
    if (found.form) {
      document.getElementById(idFor('gp'))?.focus()
      return
    }
    setMode(kind)
    // Spending makes change when a coin is short. If even that cannot cover it, the plain
    // amounts go through and the database refuses them with its usual message.
    const plan = kind === 'spend' ? planSpend(purse, amounts) : null
    const deltas: Partial<CharacterPurse> = {}
    for (const coin of denominations) {
      deltas[coin] = plan
        ? plan.deltas[coin]
        : amounts[coin] === 0
          ? 0
          : amounts[coin] * (kind === 'add' ? 1 : -1)
    }
    if (await actions.adjustCurrency(characterId, deltas)) {
      setInput({})
      const change = plan && Object.keys(plan.broken).length > 0 ? plan.broken : null
      onNotice?.(
        kind === 'add'
          ? `Added ${describeAmounts(amounts)}.`
          : `Spent ${describeAmounts(amounts)}${
              change
                ? ` (made change from ${describeAmounts({ cp: 0, sp: 0, gp: 0, ...change })})`
                : ''
            }.`,
      )
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit('add')
  }

  return (
    <div className="coins">
      <dl className="coin-purse">
        {coinOrder.map((coin) => (
          <div className="coin-purse__coin" data-coin={coin} key={coin}>
            <dt>
              <PixelIcon className="coin-icon" name="coin" />
              {coinNames[coin]}
            </dt>
            <dd>
              <strong>{format(purse[coin])}</strong> {coin}
            </dd>
          </div>
        ))}
      </dl>
      <p className="coins__total">Worth {formatPurseValue(purse)} in all</p>

      <details className="coin-log" onToggle={(event) => setLogOpen(event.currentTarget.open)}>
        <summary>Recent transactions</summary>
        {logOpen && <CoinLog characterId={characterId} userId={userId} />}
      </details>

      {actions && (
        <form aria-label="Add or spend coins" className="coin-form" noValidate onSubmit={onSubmit}>
          <div className="coin-form__fields">
            {coinOrder.map((coin) => (
              <div className="journal-field" data-coin-field={coin} key={coin}>
                <label htmlFor={idFor(coin)}>
                  {coinNames[coin]} <span>({coin})</span>
                </label>
                <input
                  aria-describedby={errors[coin] ? `${idFor(coin)}-error` : undefined}
                  aria-invalid={errors[coin] ? 'true' : undefined}
                  autoComplete="off"
                  className="journal-input"
                  disabled={pendingNow}
                  id={idFor(coin)}
                  inputMode="numeric"
                  onChange={(event) => {
                    setInput((current) => ({ ...current, [coin]: event.target.value }))
                    setErrors({})
                  }}
                  placeholder="0"
                  value={input[coin] ?? ''}
                />
                {errors[coin] && (
                  <p className="journal-error" id={`${idFor(coin)}-error`}>
                    {errors[coin]}
                  </p>
                )}
              </div>
            ))}
          </div>
          {errors.form && (
            <p className="journal-error" id={formErrorId} role="alert">
              {errors.form}
            </p>
          )}
          <div className="journal-actions">
            <button
              aria-busy={adding || undefined}
              className="journal-button"
              disabled={pendingNow}
              type="submit"
            >
              {adding ? 'Adding…' : 'Add coins'}
            </button>
            <button
              aria-busy={spending || undefined}
              className="journal-button journal-button--secondary"
              disabled={pendingNow}
              onClick={() => void submit('spend')}
              type="button"
            >
              {spending ? 'Spending…' : 'Spend coins'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function CoinLog({ characterId, userId }: { characterId: string; userId: string }) {
  const query = useQuery(coinLogOptions(characterId, userId))

  if (query.isPending) {
    return (
      <p className="journal-status" role="status">
        Loading transactions…
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="journal-status journal-status--error" role="alert">
        <p>The transactions could not be loaded.</p>
        <button
          className="journal-button journal-button--secondary"
          onClick={() => query.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }
  if (query.data.length === 0) return <p className="sheet-empty">No transactions yet.</p>

  return (
    <ol aria-label="Recent transactions" className="coin-log__list">
      {query.data.map((transaction) => {
        const summary = describeTransaction(transaction)
        return (
          <li key={transaction.id}>
            <p className="coin-log__title">
              <strong>{summary.title}</strong>
              <time dateTime={transaction.created_at}>
                {new Date(transaction.created_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </p>
            <ul className="coin-log__steps">
              {summary.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="coin-log__total">Purse after: {summary.total}</p>
          </li>
        )
      })}
    </ol>
  )
}
