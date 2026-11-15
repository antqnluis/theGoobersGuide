import type {
  CharacterItem,
  CharacterPurse,
  CharacterSheetBody,
  CoinTransaction,
} from './characterTypes'

/** Derived values are computed here and never stored (M03.3 plan §5.4). */

const round2 = (value: number) => Math.round(value * 100) / 100

const coinValue = { cp: 1, sp: 10, gp: 100 } as const
const coinsAscending = ['cp', 'sp', 'gp'] as const

const inCopper = (coins: CharacterPurse) =>
  coins.cp * coinValue.cp + coins.sp * coinValue.sp + coins.gp * coinValue.gp

/** The balance changes for a spend, and the coins that were broken to make change. */
export type SpendPlan = { deltas: CharacterPurse; broken: Partial<CharacterPurse> }

/**
 * Plans how to pay `amounts` from `purse`, making change when a denomination is short
 * (10 cp = 1 sp, 10 sp = 1 gp). Coins of the requested kind are used first, then smaller
 * coins that fit, and only then is one larger coin broken, with the change returned in
 * smaller coins. Returns null when the purse cannot cover the total.
 */
export function planSpend(purse: CharacterPurse, amounts: CharacterPurse): SpendPlan | null {
  if (inCopper(amounts) > inCopper(purse)) return null

  const used: CharacterPurse = { cp: 0, sp: 0, gp: 0 }
  let rest = 0
  for (const coin of coinsAscending) {
    used[coin] = Math.min(purse[coin], amounts[coin])
    rest += (amounts[coin] - used[coin]) * coinValue[coin]
  }

  // Cover the shortfall with other whole coins that fit, smallest first.
  for (const coin of coinsAscending) {
    const more = Math.min(purse[coin] - used[coin], Math.floor(rest / coinValue[coin]))
    used[coin] += more
    rest -= more * coinValue[coin]
  }

  const change: CharacterPurse = { cp: 0, sp: 0, gp: 0 }
  const broken: Partial<CharacterPurse> = {}
  if (rest > 0) {
    const bigger = coinsAscending.find(
      (coin) => purse[coin] - used[coin] > 0 && coinValue[coin] >= rest,
    )
    if (!bigger) return null
    used[bigger] += 1
    broken[bigger] = 1
    let back = coinValue[bigger] - rest
    for (const coin of [...coinsAscending].reverse()) {
      if (coinValue[coin] >= coinValue[bigger]) continue
      const count = Math.floor(back / coinValue[coin])
      change[coin] += count
      back -= count * coinValue[coin]
    }
  }

  return {
    deltas: {
      cp: change.cp - used.cp,
      sp: change.sp - used.sp,
      gp: change.gp - used.gp,
    },
    broken,
  }
}

const coinsDescending = ['gp', 'sp', 'cp'] as const
const group = (value: number) => value.toLocaleString('en-US')

/** "5 gp and 3 sp": the coins above zero, gold first. */
export function describeCoins(amounts: CharacterPurse) {
  const parts = coinsDescending
    .filter((coin) => amounts[coin] > 0)
    .map((coin) => `${group(amounts[coin])} ${coin}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('')
}

/** A copper value as the fewest coins: 50 cp is 5 sp, 105 cp is 1 gp and 5 cp. */
function coinsFor(copper: number): CharacterPurse {
  const gp = Math.floor(copper / coinValue.gp)
  const sp = Math.floor((copper - gp * coinValue.gp) / coinValue.sp)
  return { gp, sp, cp: copper - gp * coinValue.gp - sp * coinValue.sp }
}

export type TransactionSummary = {
  /** "Spent 5 sp (made change)", "Added 10 gp". */
  title: string
  /** One line per coin that changed: "3 → 2 gp (−1)". */
  steps: string[]
  /** The value of the purse afterwards, in gold. */
  total: string
}

/** The arithmetic of one logged coin change, from its net change and balances after it. */
export function describeTransaction(transaction: CoinTransaction): TransactionSummary {
  const delta: CharacterPurse = {
    cp: transaction.cp_delta,
    sp: transaction.sp_delta,
    gp: transaction.gp_delta,
  }
  const after: CharacterPurse = {
    cp: transaction.cp_after,
    sp: transaction.sp_after,
    gp: transaction.gp_after,
  }
  const negate = (coins: CharacterPurse): CharacterPurse => ({
    cp: -coins.cp,
    sp: -coins.sp,
    gp: -coins.gp,
  })
  const signs = coinsDescending.map((coin) => delta[coin])
  let title: string
  if (signs.every((value) => value <= 0)) {
    title = `Spent ${describeCoins(negate(delta))}`
  } else if (signs.every((value) => value >= 0)) {
    title = `Added ${describeCoins(delta)}`
  } else {
    // Coins went both ways: a larger coin was broken for change. Say what it came to.
    const net = delta.cp * coinValue.cp + delta.sp * coinValue.sp + delta.gp * coinValue.gp
    title =
      net === 0
        ? 'Exchanged coins'
        : `${net < 0 ? 'Spent' : 'Added'} ${describeCoins(coinsFor(Math.abs(net)))} (made change)`
  }
  const steps = coinsDescending
    .filter((coin) => delta[coin] !== 0)
    .map((coin) => {
      const sign = delta[coin] > 0 ? '+' : '−'
      return `${group(after[coin] - delta[coin])} → ${group(after[coin])} ${coin} (${sign}${group(Math.abs(delta[coin]))})`
    })
  return { title, steps, total: formatPurseValue(after) }
}

/**
 * What a purse is worth, in whole coins (10 cp = 1 sp, 10 sp = 1 gp): 15 sp and 3 cp is
 * "1 gp, 5 sp and 3 cp". Never a decimal.
 */
export function formatPurseValue(purse: CharacterPurse) {
  return describeCoins(coinsFor(inCopper(purse))) || '0 gp'
}

/** Total of weight × quantity over items that have a weight. Coins are not counted (D9). */
export function carriedWeight(items: Pick<CharacterItem, 'weight' | 'quantity'>[]) {
  return round2(
    items.reduce(
      (total, item) => total + (item.weight === null ? 0 : item.weight * item.quantity),
      0,
    ),
  )
}

/** Strength score × 15 lb. */
export function carryingCapacity(body: Pick<CharacterSheetBody, 'abilities'>) {
  return body.abilities.str * 15
}

export function formatWeight(value: number) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} lb`
}

export const attunementLimit = 3

export function attunedCount(items: Pick<CharacterItem, 'attuned'>[]) {
  return items.filter((item) => item.attuned).length
}

/** A warning (never a block) above the 5e limit, so homebrew rules still work (D7). */
export function attunementWarning(items: Pick<CharacterItem, 'attuned'>[]) {
  return attunedCount(items) > attunementLimit ? 'More than 3 attuned items' : null
}

/** Equipped first, then by name, then by creation time so the order is stable (D8). */
export function sortItems<T extends Pick<CharacterItem, 'name' | 'equipped' | 'created_at'>>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.equipped) - Number(a.equipped) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
      a.created_at.localeCompare(b.created_at),
  )
}
