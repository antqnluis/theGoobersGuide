import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCharacter } from './characterService'
import { item, sheet } from './characterTestData'
import type { CharacterItem, CharacterItemValues, CharacterSheet } from './characterTypes'
import {
  addCharacterItem,
  adjustCharacterCurrency,
  adjustItemQuantity,
  deleteCharacterItem,
  setItemFlag,
  updateCharacterItem,
} from './inventoryService'
import { useCharacterActions } from './useCharacterActions'

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  deleteCharacter: vi.fn(),
}))
vi.mock('./inventoryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventoryService')>()),
  addCharacterItem: vi.fn(),
  updateCharacterItem: vi.fn(),
  setItemFlag: vi.fn(),
  adjustItemQuantity: vi.fn(),
  deleteCharacterItem: vi.fn(),
  adjustCharacterCurrency: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const characterId = '00000000-0000-4000-8000-000000000021'
const charactersKey = ['campaigns', 'characters', campaignId, userId]
const sheetKey = ['campaigns', 'characters', 'sheet', characterId, userId]
const itemsKey = ['campaigns', 'characters', 'items', characterId, userId]
const detailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]

const rope = item({ id: 'rope', name: 'Rope' })
const torch = item({ id: 'torch', name: 'Torch', quantity: 5 })
const values: CharacterItemValues = {
  name: 'Lantern',
  quantity: 1,
  weight: 2,
  description: null,
  equipped: false,
  attuned: false,
}

function setup(items: CharacterItem[] | null = [rope, torch]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(sheetKey, sheet())
  if (items) queryClient.setQueryData(itemsKey, items)
  for (const key of [charactersKey, detailKey, rosterKey]) queryClient.setQueryData(key, 'cached')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCharacterActions(campaignId, userId), { wrapper })
  return { queryClient, result }
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated
const cachedItems = (queryClient: QueryClient) =>
  queryClient.getQueryData<CharacterItem[]>(itemsKey)

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

describe('coins', () => {
  it('merges the returned balances and stamp into the sheet cache without a refetch', async () => {
    vi.mocked(adjustCharacterCurrency).mockResolvedValue({
      cp: 4,
      sp: 7,
      gp: 20,
      updated_at: 'coin-stamp',
    })
    const { queryClient, result } = setup()
    let ok = false
    await act(async () => {
      ok = await result.current.adjustCurrency(characterId, { gp: 5, sp: -3 })
    })
    expect(ok).toBe(true)
    expect(adjustCharacterCurrency).toHaveBeenCalledWith(characterId, { gp: 5, sp: -3 })
    const cached = queryClient.getQueryData<CharacterSheet>(sheetKey)
    expect(cached).toMatchObject({ cp: 4, sp: 7, gp: 20, updated_at: 'coin-stamp' })
    // Everything else on the sheet is kept, so an open body draft still saves.
    expect(cached).toMatchObject({ max_hp: 30, current_hp: 12, sheet: sheet().sheet })
    expect(stale(queryClient, sheetKey)).toBeFalsy()
    expect(stale(queryClient, charactersKey)).toBeFalsy()
  })

  it('leaves an empty sheet cache empty', async () => {
    vi.mocked(adjustCharacterCurrency).mockResolvedValue({
      cp: 1,
      sp: 0,
      gp: 0,
      updated_at: 's',
    })
    const { queryClient, result } = setup()
    queryClient.setQueryData(sheetKey, null)
    await act(async () => {
      await result.current.adjustCurrency(characterId, { cp: 1 })
    })
    expect(queryClient.getQueryData(sheetKey)).toBeNull()
  })

  it('shows the insufficient-funds copy and changes nothing', async () => {
    vi.mocked(adjustCharacterCurrency).mockRejectedValue({ message: 'currency_insufficient' })
    const { queryClient, result } = setup()
    let ok = true
    await act(async () => {
      ok = await result.current.adjustCurrency(characterId, { gp: -50 })
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe("You don't have enough coins for that. Nothing was spent.")
    expect(queryClient.getQueryData(sheetKey)).toEqual(sheet())
    expect(stale(queryClient, itemsKey)).toBeFalsy()
  })

  it('uses the coin fallback for unknown failures', async () => {
    vi.mocked(adjustCharacterCurrency).mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => {
      await result.current.adjustCurrency(characterId, { gp: 1 })
    })
    expect(result.current.error).toBe(
      "We couldn't update the coins. Check your connection and try again.",
    )
  })

  it('refetches characters, campaign, and roster when the character is unavailable', async () => {
    vi.mocked(adjustCharacterCurrency).mockRejectedValue({ message: 'character_unavailable' })
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.adjustCurrency(characterId, { gp: 1 })
    })
    expect(result.current.error).toBe('This character is no longer available.')
    for (const key of [charactersKey, detailKey, rosterKey]) {
      expect(stale(queryClient, key)).toBe(true)
    }
  })
})

describe('items', () => {
  it('appends an added item to the cache and refreshes the list in the background', async () => {
    const lantern = item({ id: 'lantern', name: 'Lantern' })
    vi.mocked(addCharacterItem).mockResolvedValue(lantern)
    const { queryClient, result } = setup()
    let ok = false
    await act(async () => {
      ok = await result.current.addItem(characterId, values)
    })
    expect(ok).toBe(true)
    expect(addCharacterItem).toHaveBeenCalledWith(characterId, values)
    expect(cachedItems(queryClient)?.map((row) => row.id)).toEqual(['rope', 'torch', 'lantern'])
    expect(stale(queryClient, itemsKey)).toBe(true)
  })

  it('does nothing to a list that was never loaded', async () => {
    vi.mocked(addCharacterItem).mockResolvedValue(item({ id: 'x' }))
    const { queryClient, result } = setup(null)
    await act(async () => {
      await result.current.addItem(characterId, values)
    })
    expect(cachedItems(queryClient)).toBeUndefined()
  })

  it('replaces an edited item, saving against that item’s own stamp', async () => {
    const saved = item({ id: 'rope', name: 'Silk rope', updated_at: 'newer' })
    vi.mocked(updateCharacterItem).mockResolvedValue(saved)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.editItem(characterId, rope, values)
    })
    expect(updateCharacterItem).toHaveBeenCalledWith('rope', values, rope.updated_at)
    expect(cachedItems(queryClient)).toEqual([saved, torch])
    expect(stale(queryClient, itemsKey)).toBe(true)
  })

  it('refetches the list and shows the conflict copy when the edit missed its row', async () => {
    vi.mocked(updateCharacterItem).mockRejectedValue(new Error('item_conflict'))
    const { queryClient, result } = setup()
    let ok = true
    await act(async () => {
      ok = await result.current.editItem(characterId, rope, values)
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe(
      'This item changed on another device. The latest version is shown.',
    )
    expect(cachedItems(queryClient)).toEqual([rope, torch])
    expect(stale(queryClient, itemsKey)).toBe(true)
  })

  it('equips and attunes through one action and replaces the row', async () => {
    const equipped = { ...rope, equipped: true, updated_at: 'e' }
    vi.mocked(setItemFlag).mockResolvedValue(equipped)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.changeItemFlag(characterId, 'rope', 'equipped', true)
    })
    expect(setItemFlag).toHaveBeenCalledWith('rope', 'equipped', true)
    expect(cachedItems(queryClient)).toEqual([equipped, torch])

    const attuned = { ...equipped, attuned: true }
    vi.mocked(setItemFlag).mockResolvedValue(attuned)
    await act(async () => {
      await result.current.changeItemFlag(characterId, 'rope', 'attuned', true)
    })
    expect(setItemFlag).toHaveBeenLastCalledWith('rope', 'attuned', true)
    expect(cachedItems(queryClient)?.[0]).toEqual(attuned)
  })

  it('writes the new quantity and refetches before reporting success', async () => {
    vi.mocked(adjustItemQuantity).mockResolvedValue(4)
    const { queryClient, result } = setup()
    let ok = false
    await act(async () => {
      ok = await result.current.changeItemQuantity(characterId, 'torch', -1)
    })
    expect(ok).toBe(true)
    expect(adjustItemQuantity).toHaveBeenCalledWith('torch', -1)
    expect(cachedItems(queryClient)?.find((row) => row.id === 'torch')?.quantity).toBe(4)
    expect(stale(queryClient, itemsKey)).toBe(true)
  })

  it('shows the quantity copy and keeps the list on a refused delta', async () => {
    vi.mocked(adjustItemQuantity).mockRejectedValue({ message: 'item_quantity_insufficient' })
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.changeItemQuantity(characterId, 'torch', -9)
    })
    expect(result.current.error).toBe("There aren't that many left.")
    expect(cachedItems(queryClient)).toEqual([rope, torch])
    expect(stale(queryClient, itemsKey)).toBeFalsy()
  })

  it('removes a deleted item from the cache', async () => {
    vi.mocked(deleteCharacterItem).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.removeItem(characterId, 'rope')
    })
    expect(deleteCharacterItem).toHaveBeenCalledWith('rope')
    expect(cachedItems(queryClient)).toEqual([torch])
    expect(stale(queryClient, itemsKey)).toBe(true)
  })

  it('refetches when the item to remove is already gone', async () => {
    vi.mocked(deleteCharacterItem).mockRejectedValue(new Error('item_unavailable'))
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.removeItem(characterId, 'rope')
    })
    expect(result.current.error).toBe('This item is no longer available.')
    expect(stale(queryClient, itemsKey)).toBe(true)
  })

  it('keeps the limit copy when the 201st item is refused', async () => {
    vi.mocked(addCharacterItem).mockRejectedValue({ message: 'item_limit_reached' })
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.addItem(characterId, values)
    })
    expect(result.current.error).toBe(
      'A character can carry up to 200 different items. Remove one to add another.',
    )
    expect(cachedItems(queryClient)).toEqual([rope, torch])
    expect(stale(queryClient, itemsKey)).toBeFalsy()
  })

  it.each([
    ['item-add', (a: Actions) => a.addItem(characterId, values), 'save this item'],
    ['item-edit', (a: Actions) => a.editItem(characterId, rope, values), 'save this item'],
    [
      'item-flag',
      (a: Actions) => a.changeItemFlag(characterId, 'rope', 'equipped', true),
      'update this item',
    ],
    [
      'item-quantity',
      (a: Actions) => a.changeItemQuantity(characterId, 'rope', 1),
      'update this item',
    ],
    ['item-delete', (a: Actions) => a.removeItem(characterId, 'rope'), 'remove this item'],
  ])('uses the %s fallback for unknown failures', async (_name, call, words) => {
    for (const fn of [
      addCharacterItem,
      updateCharacterItem,
      setItemFlag,
      adjustItemQuantity,
      deleteCharacterItem,
    ]) {
      vi.mocked(fn).mockRejectedValue(new Error('network'))
    }
    const { result } = setup()
    await act(async () => {
      await call(result.current)
    })
    expect(result.current.error).toBe(`We couldn't ${words}. Check your connection and try again.`)
  })
})

type Actions = ReturnType<typeof setup>['result']['current']

describe('pending state', () => {
  it('tracks the pending action, character, and item, then clears them', async () => {
    let finish: (quantity: number) => void = () => {}
    vi.mocked(adjustItemQuantity).mockReturnValue(
      new Promise<number>((resolve) => (finish = resolve)),
    )
    const { result } = setup()
    expect(result.current.pendingItemId).toBeNull()

    let promise: Promise<boolean> = Promise.resolve(false)
    act(() => {
      promise = result.current.changeItemQuantity(characterId, 'torch', 1)
    })
    await waitFor(() => expect(result.current.pendingAction).toBe('item-quantity'))
    expect(result.current.pendingCharacterId).toBe(characterId)
    expect(result.current.pendingItemId).toBe('torch')

    await act(async () => {
      finish(6)
      await promise
    })
    expect(result.current.pendingAction).toBeNull()
    expect(result.current.pendingItemId).toBeNull()
  })

  it('has no item for coin and add actions', async () => {
    let finish: () => void = () => {}
    vi.mocked(adjustCharacterCurrency).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ cp: 0, sp: 0, gp: 1, updated_at: 's' })
      }),
    )
    const { result } = setup()
    let promise: Promise<boolean> = Promise.resolve(false)
    act(() => {
      promise = result.current.adjustCurrency(characterId, { gp: 1 })
    })
    await waitFor(() => expect(result.current.pendingAction).toBe('currency'))
    expect(result.current.pendingItemId).toBeNull()
    await act(async () => {
      finish()
      await promise
    })
  })
})

describe('deleting a character', () => {
  it('drops its inventory cache too', async () => {
    vi.mocked(deleteCharacter).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.remove(characterId)).toBe(true)
    })
    expect(queryClient.getQueryData(itemsKey)).toBeUndefined()
    expect(queryClient.getQueryData(sheetKey)).toBeUndefined()
    expect(stale(queryClient, charactersKey)).toBe(true)
  })
})
