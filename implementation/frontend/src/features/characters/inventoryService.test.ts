import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import type { CharacterItemValues } from './characterTypes'
import {
  addCharacterItem,
  adjustCharacterCurrency,
  adjustItemQuantity,
  deleteCharacterItem,
  inventoryError,
  isItemStale,
  listCharacterItems,
  listCoinTransactions,
  setItemFlag,
  updateCharacterItem,
} from './inventoryService'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

const characterId = '00000000-0000-4000-8000-000000000021'
const itemId = '00000000-0000-4000-8000-000000000031'

/** A chainable query builder that records calls and resolves to `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.limit = (...args: unknown[]) => {
    calls.push(['limit', args])
    return chain
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(chain as never)
  return calls
}

const row = {
  id: itemId,
  character_id: characterId,
  name: 'Rope',
  quantity: 1,
  weight: null,
  description: null,
  equipped: false,
  attuned: false,
  created_at: '2026-11-14T10:00:00+00:00',
  updated_at: '2026-11-14T10:00:00+00:00',
}
const values: CharacterItemValues = {
  name: 'Rope',
  quantity: 1,
  weight: 10,
  description: null,
  equipped: false,
  attuned: false,
}

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.from).mockReset()
})

describe('listCharacterItems', () => {
  it('reads the character’s items oldest first and coerces numeric weights', async () => {
    const calls = builder({
      data: [
        { ...row, weight: '2.50' },
        { ...row, id: 'b' },
      ],
      error: null,
    })
    const items = await listCharacterItems(characterId)
    expect(supabase.from).toHaveBeenCalledWith('character_items')
    expect(calls).toContainEqual(['eq', ['character_id', characterId]])
    expect(calls).toContainEqual(['order', ['created_at', { ascending: true }]])
    expect(items.map((item) => item.weight)).toEqual([2.5, null])
  })

  it('returns an empty list for no rows and throws on an error', async () => {
    builder({ data: null, error: null })
    await expect(listCharacterItems(characterId)).resolves.toEqual([])
    builder({ data: null, error: { message: 'boom' } })
    await expect(listCharacterItems(characterId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('item writes', () => {
  it('adds an item for the character and returns the stored row', async () => {
    const calls = builder({ data: { ...row, weight: 10 }, error: null })
    const item = await addCharacterItem(characterId, values)
    expect(calls).toContainEqual(['insert', [{ character_id: characterId, ...values }]])
    expect(item.weight).toBe(10)
  })

  it('reports a row-level-security refusal as denied and passes other errors through', async () => {
    builder({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security' },
    })
    await expect(addCharacterItem(characterId, values)).rejects.toThrow('character_update_denied')

    builder({ data: null, error: { code: 'P0001', message: 'item_limit_reached' } })
    await expect(addCharacterItem(characterId, values)).rejects.toEqual({
      code: 'P0001',
      message: 'item_limit_reached',
    })
  })

  it('edits only against the previous stamp and reports a missed row as a conflict', async () => {
    const calls = builder({ data: row, error: null })
    await updateCharacterItem(itemId, values, 'old-stamp')
    expect(calls).toContainEqual(['update', [values]])
    expect(calls).toContainEqual(['eq', ['id', itemId]])
    expect(calls).toContainEqual(['eq', ['updated_at', 'old-stamp']])

    builder({ data: null, error: null })
    await expect(updateCharacterItem(itemId, values, 'old-stamp')).rejects.toThrow('item_conflict')
  })

  it('toggles one flag without a stamp filter and reports a missed row as unavailable', async () => {
    const calls = builder({ data: { ...row, equipped: true }, error: null })
    await expect(setItemFlag(itemId, 'equipped', true)).resolves.toMatchObject({ equipped: true })
    expect(calls).toContainEqual(['update', [{ equipped: true }]])
    expect(calls.some(([method, args]) => method === 'eq' && args[0] === 'updated_at')).toBe(false)

    const attune = builder({ data: { ...row, attuned: false }, error: null })
    await setItemFlag(itemId, 'attuned', false)
    expect(attune).toContainEqual(['update', [{ attuned: false }]])

    builder({ data: null, error: null })
    await expect(setItemFlag(itemId, 'equipped', true)).rejects.toThrow('item_unavailable')
  })

  it('deletes by id and reports a missed row as unavailable', async () => {
    const calls = builder({ data: { id: itemId }, error: null })
    await deleteCharacterItem(itemId)
    expect(calls).toContainEqual(['delete', []])
    expect(calls).toContainEqual(['eq', ['id', itemId]])

    builder({ data: null, error: null })
    await expect(deleteCharacterItem(itemId)).rejects.toThrow('item_unavailable')
  })
})

describe('RPC wrappers', () => {
  it('adjust_character_item_quantity sends the item and delta and returns the quantity', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 7, error: null } as never)
    await expect(adjustItemQuantity(itemId, -1)).resolves.toBe(7)
    expect(supabase.rpc).toHaveBeenCalledWith('adjust_character_item_quantity', {
      p_item_id: itemId,
      p_delta: -1,
    })

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'item_quantity_insufficient' },
    } as never)
    await expect(adjustItemQuantity(itemId, -9)).rejects.toEqual({
      message: 'item_quantity_insufficient',
    })
  })

  it('adjust_character_currency sends all three deltas, zero for the missing ones', async () => {
    const purse = { cp: 0, sp: 7, gp: 20, updated_at: 'stamp' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [purse], error: null } as never)
    await expect(adjustCharacterCurrency(characterId, { gp: 5, sp: -3 })).resolves.toEqual(purse)
    expect(supabase.rpc).toHaveBeenCalledWith('adjust_character_currency', {
      p_character_id: characterId,
      p_cp: 0,
      p_sp: -3,
      p_gp: 5,
    })
  })

  it('adjust_character_currency throws the database error, or unavailable on an empty result', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'currency_insufficient' },
    } as never)
    await expect(adjustCharacterCurrency(characterId, { gp: -5 })).rejects.toEqual({
      message: 'currency_insufficient',
    })

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    await expect(adjustCharacterCurrency(characterId, { gp: 1 })).rejects.toThrow(
      'character_unavailable',
    )
  })
})

describe('error copy', () => {
  const fallback = 'fallback'

  it.each([
    ['currency_insufficient', "You don't have enough coins for that. Nothing was spent."],
    ['currency_limit_exceeded', 'A purse can hold up to 9,999,999 of each coin.'],
    ['currency_amount_invalid', 'Enter whole numbers of coins up to 9,999,999.'],
    [
      'item_limit_reached',
      'A character can carry up to 200 different items. Remove one to add another.',
    ],
    ['item_quantity_insufficient', "There aren't that many left."],
    ['item_quantity_invalid', 'Quantity must be between 0 and 9,999.'],
    ['item_unavailable', 'This item is no longer available.'],
    ['item_conflict', 'This item changed on another device. The latest version is shown.'],
    ['character_unavailable', 'This character is no longer available.'],
    ['character_update_denied', 'This character could not be updated by this account.'],
  ])('maps %s', (message, copy) => {
    expect(inventoryError({ message }, fallback)).toBe(copy)
  })

  it.each([
    'item_reassignment_forbidden',
    'currency_required',
    'item_required',
    'permission denied',
    '',
  ])('falls back for %s', (message) => {
    expect(inventoryError({ message }, fallback)).toBe(fallback)
  })

  it('falls back for values that are not errors', () => {
    expect(inventoryError(null, fallback)).toBe(fallback)
    expect(inventoryError('item_conflict', fallback)).toBe(fallback)
  })

  it('flags item conflicts and unavailable items as stale', () => {
    expect(isItemStale({ message: 'item_conflict' })).toBe(true)
    expect(isItemStale({ message: 'item_unavailable' })).toBe(true)
    expect(isItemStale({ message: 'item_quantity_insufficient' })).toBe(false)
    expect(isItemStale(null)).toBe(false)
  })
})

describe('listCoinTransactions', () => {
  it('reads the newest changes first, limited to twenty by default', async () => {
    const calls = builder({ data: [{ id: 'a' }], error: null })
    await expect(listCoinTransactions(characterId)).resolves.toEqual([{ id: 'a' }])
    expect(supabase.from).toHaveBeenCalledWith('character_currency_log')
    expect(calls).toContainEqual(['eq', ['character_id', characterId]])
    expect(calls).toContainEqual(['order', ['seq', { ascending: false }]])
    expect(calls).toContainEqual(['limit', [20]])
  })

  it('accepts another limit, returns an empty list for no rows, and throws errors', async () => {
    const calls = builder({ data: null, error: null })
    await expect(listCoinTransactions(characterId, 5)).resolves.toEqual([])
    expect(calls).toContainEqual(['limit', [5]])
    builder({ data: null, error: { message: 'boom' } })
    await expect(listCoinTransactions(characterId)).rejects.toEqual({ message: 'boom' })
  })
})
