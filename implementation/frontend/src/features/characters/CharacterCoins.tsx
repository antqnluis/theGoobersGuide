import { useState, type FormEvent } from 'react'
import { denominations, type CharacterPurse, type Denomination } from './characterTypes'
import { coinValueInGold, formatGold } from './inventoryRules'
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

/** "5 gp and 3 sp" for the amounts above zero. */
function describeAmounts(amounts: CharacterPurse) {
  const parts = coinOrder
    .filter((coin) => amounts[coin] > 0)
    .map((coin) => `${format(amounts[coin])} ${coin}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('')
}

/** A character's coin purse. Owners add and spend coins; everyone else only reads. */
export function CharacterCoins({
  actions,
  characterId,
  onNotice,
  purse,
}: {
  /** Present only for the owner; without it the purse is read-only. */
  actions?: CoinActions
  characterId: string
  onNotice?: (notice: string) => void
  purse: CharacterPurse
}) {
  const [input, setInput] = useState<CoinInput>({})
  const [errors, setErrors] = useState<CoinErrors>({})
  const pendingNow =
    actions?.pendingAction === 'currency' && actions.pendingCharacterId === characterId
  const [mode, setMode] = useState<'add' | 'spend' | null>(null)
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
    const sign = kind === 'add' ? 1 : -1
    const deltas: Partial<CharacterPurse> = {}
    for (const coin of denominations) deltas[coin] = amounts[coin] * sign
    if (await actions.adjustCurrency(characterId, deltas)) {
      setInput({})
      onNotice?.(`${kind === 'add' ? 'Added' : 'Spent'} ${describeAmounts(amounts)}.`)
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
            <dt>{coinNames[coin]}</dt>
            <dd>
              <strong>{format(purse[coin])}</strong> {coin}
            </dd>
          </div>
        ))}
      </dl>
      <p className="coins__total">{formatGold(coinValueInGold(purse))} in all</p>

      {actions && (
        <form aria-label="Add or spend coins" className="coin-form" noValidate onSubmit={onSubmit}>
          <div className="coin-form__fields">
            {coinOrder.map((coin) => (
              <div className="journal-field" key={coin}>
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
