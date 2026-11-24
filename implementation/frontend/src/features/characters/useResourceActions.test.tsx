import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateCharacterStatus } from './characterService'
import { sheet } from './characterTestData'
import type { CharacterResource, CharacterSheet } from './characterTypes'
import {
  addCharacterResource,
  adjustCharacterResource,
  applyCharacterHp,
  deleteCharacterResource,
  recordDeathSave,
  takeCharacterRest,
  updateCharacterResource,
} from './resourceService'
import { useResourceActions } from './useResourceActions'

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  updateCharacterStatus: vi.fn(),
}))
vi.mock('./resourceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resourceService')>()),
  addCharacterResource: vi.fn(),
  updateCharacterResource: vi.fn(),
  deleteCharacterResource: vi.fn(),
  applyCharacterHp: vi.fn(),
  adjustCharacterResource: vi.fn(),
  takeCharacterRest: vi.fn(),
  recordDeathSave: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const characterId = '00000000-0000-4000-8000-000000000021'
const charactersKey = ['campaigns', 'characters', campaignId, userId]
const sheetKey = ['campaigns', 'characters', 'sheet', characterId, userId]
const resourcesKey = ['campaigns', 'characters', 'resources', characterId, userId]
const detailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]

function resource(overrides: Partial<CharacterResource> = {}): CharacterResource {
  return {
    id: 'ki',
    character_id: characterId,
    kind: 'tracker',
    name: 'Ki',
    slot_level: null,
    die: null,
    maximum: 4,
    current: 4,
    reset: 'short',
    position: 0,
    created_at: '2026-11-24T10:00:00+00:00',
    updated_at: '2026-11-24T10:00:00+00:00',
    ...overrides,
  }
}
const ki = resource()
const rage = resource({ id: 'rage', name: 'Rage', maximum: 3, current: 3, position: 1 })

function setup(rows: CharacterResource[] | null = [ki, rage]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(sheetKey, sheet({ max_hp: 20, current_hp: 15, temp_hp: 3 }))
  if (rows) queryClient.setQueryData(resourcesKey, rows)
  for (const key of [charactersKey, detailKey, rosterKey]) queryClient.setQueryData(key, 'cached')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useResourceActions(campaignId, userId), { wrapper })
  return { queryClient, result }
}

const cachedSheet = (queryClient: QueryClient) =>
  queryClient.getQueryData<CharacterSheet>(sheetKey)!
const cachedRows = (queryClient: QueryClient) =>
  queryClient.getQueryData<CharacterResource[]>(resourcesKey)!
const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

const hpAnswer = (overrides = {}) => ({
  current_hp: 12,
  temp_hp: 0,
  death_save_successes: 0,
  death_save_failures: 0,
  damage_taken: 3,
  concentration: null,
  updated_at: 'hp-stamp',
  ...overrides,
})

describe('changeHp', () => {
  it('shows the change at once, then keeps the server’s answer and returns the damage taken', async () => {
    const call = deferred<ReturnType<typeof hpAnswer>>()
    vi.mocked(applyCharacterHp).mockReturnValue(call.promise)
    const { queryClient, result } = setup()
    let answer: Awaited<ReturnType<typeof result.current.changeHp>>
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.changeHp(characterId, 'damage', 6).then((value) => {
        answer = value
      })
    })
    // Temp HP (3) absorb first: 3 get through.
    expect(cachedSheet(queryClient)).toMatchObject({ current_hp: 12, temp_hp: 0 })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      call.resolve(hpAnswer())
      await pending
    })
    expect(applyCharacterHp).toHaveBeenCalledWith(characterId, 'damage', 6)
    expect(cachedSheet(queryClient)).toMatchObject({
      current_hp: 12,
      temp_hp: 0,
      updated_at: 'hp-stamp',
    })
    expect(answer!).toMatchObject({ damage_taken: 3, concentration: null })
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('puts the old value back and shows the error when the call fails', async () => {
    vi.mocked(applyCharacterHp).mockRejectedValue(new Error('network'))
    const { queryClient, result } = setup()
    let answer: unknown = 'unset'
    await act(async () => {
      answer = await result.current.changeHp(characterId, 'damage', 6)
    })
    expect(answer).toBeUndefined()
    expect(cachedSheet(queryClient)).toMatchObject({ current_hp: 15, temp_hp: 3 })
    expect(result.current.error).toBe("We couldn't change HP. Check your connection and try again.")
    expect(stale(queryClient, sheetKey)).toBe(true)
  })

  it('shows the copy for a rule failure and leaves HP alone when it is not set', async () => {
    vi.mocked(applyCharacterHp).mockRejectedValue(new Error('hp_not_set'))
    const { queryClient, result } = setup()
    queryClient.setQueryData(sheetKey, sheet({ max_hp: null, current_hp: null }))
    await act(async () => {
      await result.current.changeHp(characterId, 'heal', 4)
    })
    expect(cachedSheet(queryClient)).toMatchObject({ max_hp: null, current_hp: null })
    expect(result.current.error).toBe('Set max and current HP on the sheet first.')
  })

  it('applies temp HP even before max HP is set', async () => {
    vi.mocked(applyCharacterHp).mockResolvedValue(
      hpAnswer({ current_hp: null, temp_hp: 5 }) as never,
    )
    const { queryClient, result } = setup()
    queryClient.setQueryData(sheetKey, sheet({ max_hp: null, current_hp: null, temp_hp: 0 }))
    await act(async () => {
      await result.current.changeHp(characterId, 'temp', 5)
    })
    expect(cachedSheet(queryClient).temp_hp).toBe(5)
  })

  it('runs rapid taps in order and shows each tap at once, settling on the last answer', async () => {
    const first = deferred<ReturnType<typeof hpAnswer>>()
    const second = deferred<ReturnType<typeof hpAnswer>>()
    vi.mocked(applyCharacterHp)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { queryClient, result } = setup()
    queryClient.setQueryData(sheetKey, sheet({ max_hp: 20, current_hp: 15, temp_hp: 0 }))
    let pending!: Promise<unknown>
    act(() => {
      const one = result.current.changeHp(characterId, 'damage', 2)
      const two = result.current.changeHp(characterId, 'damage', 3)
      pending = Promise.all([one, two])
    })
    expect(cachedSheet(queryClient).current_hp).toBe(10)
    // The second call waits for the first.
    await act(async () => {
      await Promise.resolve()
    })
    expect(applyCharacterHp).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve(hpAnswer({ current_hp: 13, updated_at: 'one' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    // The first answer does not pull the bar back up while the second tap is in flight.
    expect(cachedSheet(queryClient).current_hp).toBe(10)
    expect(applyCharacterHp).toHaveBeenCalledTimes(2)
    expect(vi.mocked(applyCharacterHp).mock.calls.map((call) => call[2])).toEqual([2, 3])

    await act(async () => {
      second.resolve(hpAnswer({ current_hp: 10, updated_at: 'two' }))
      await pending
    })
    expect(cachedSheet(queryClient)).toMatchObject({ current_hp: 10, updated_at: 'two' })
    expect(result.current.busy).toBe(false)
  })

  it('keeps the later tap’s answer when an earlier tap fails with later taps pending', async () => {
    const first = deferred<ReturnType<typeof hpAnswer>>()
    vi.mocked(applyCharacterHp)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(hpAnswer({ current_hp: 10, updated_at: 'two' }))
    const { queryClient, result } = setup()
    queryClient.setQueryData(sheetKey, sheet({ max_hp: 20, current_hp: 15, temp_hp: 0 }))
    let pending!: Promise<unknown>
    act(() => {
      pending = Promise.all([
        result.current.changeHp(characterId, 'damage', 2),
        result.current.changeHp(characterId, 'damage', 3),
      ])
    })
    await act(async () => {
      first.reject(new Error('network'))
      await pending
    })
    // The later tap still reached the server, and its answer is what the sheet shows.
    expect(applyCharacterHp).toHaveBeenCalledTimes(2)
    expect(cachedSheet(queryClient)).toMatchObject({ current_hp: 10, updated_at: 'two' })
    expect(result.current.error).toBeTruthy()
  })

  it('clears the character lists when the character is gone', async () => {
    vi.mocked(applyCharacterHp).mockRejectedValue(new Error('character_unavailable'))
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.changeHp(characterId, 'heal', 1)
    })
    for (const key of [charactersKey, detailKey, rosterKey]) {
      expect(stale(queryClient, key)).toBe(true)
    }
    expect(result.current.error).toBe('This character is no longer available.')
  })
})

describe('adjustResource', () => {
  it('moves the pip at once and keeps the server’s count', async () => {
    const call = deferred<{ current: number; updated_at: string }>()
    vi.mocked(adjustCharacterResource).mockReturnValue(call.promise)
    const { queryClient, result } = setup()
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.adjustResource(characterId, 'ki', -1)
    })
    expect(cachedRows(queryClient)[0].current).toBe(3)
    await act(async () => {
      call.resolve({ current: 3, updated_at: 'tap' })
      await pending
    })
    expect(adjustCharacterResource).toHaveBeenCalledWith('ki', -1)
    expect(cachedRows(queryClient)[0]).toMatchObject({ current: 3, updated_at: 'tap' })
    expect(cachedRows(queryClient)[1]).toEqual(rage)
  })

  it('clamps the shown value to the maximum and to zero', async () => {
    const call = deferred<{ current: number; updated_at: string }>()
    vi.mocked(adjustCharacterResource).mockReturnValue(call.promise)
    const { queryClient, result } = setup()
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.adjustResource(characterId, 'ki', 5)
    })
    expect(cachedRows(queryClient)[0].current).toBe(4)
    await act(async () => {
      call.resolve({ current: 4, updated_at: 'x' })
      await pending
    })
  })

  it('rolls back and shows "None left" when a spend is refused', async () => {
    vi.mocked(adjustCharacterResource).mockRejectedValue(new Error('resource_empty'))
    const { queryClient, result } = setup([resource({ id: 'ki', current: 0 })])
    await act(async () => {
      await result.current.adjustResource(characterId, 'ki', -1)
    })
    expect(cachedRows(queryClient)[0].current).toBe(0)
    expect(result.current.error).toBe('None left. Take a rest or restore one by hand.')
  })

  it('refetches the list when the tracker is gone', async () => {
    vi.mocked(adjustCharacterResource).mockRejectedValue(new Error('resource_unavailable'))
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.adjustResource(characterId, 'ki', -1)
    })
    expect(stale(queryClient, resourcesKey)).toBe(true)
    expect(result.current.error).toMatch(/no longer available/)
  })

  it('queues rapid taps on one tracker and lets other trackers go ahead', async () => {
    const first = deferred<{ current: number; updated_at: string }>()
    vi.mocked(adjustCharacterResource).mockImplementation((id) =>
      id === 'ki' ? first.promise : Promise.resolve({ current: 2, updated_at: 'rage' }),
    )
    const { queryClient, result } = setup()
    let pending!: Promise<unknown>
    act(() => {
      pending = Promise.all([
        result.current.adjustResource(characterId, 'ki', -1),
        result.current.adjustResource(characterId, 'ki', -1),
        result.current.adjustResource(characterId, 'rage', -1),
      ])
    })
    expect(cachedRows(queryClient).map((row) => row.current)).toEqual([2, 2])
    await act(async () => {
      await Promise.resolve()
    })
    expect(vi.mocked(adjustCharacterResource).mock.calls.map((call) => call[0])).toEqual([
      'ki',
      'rage',
    ])
    await act(async () => {
      first.resolve({ current: 3, updated_at: 'a' })
      await pending
    })
    expect(adjustCharacterResource).toHaveBeenCalledTimes(3)
  })
})

describe('takeRest', () => {
  const result = {
    sheet: {
      current_hp: 20,
      temp_hp: 0,
      exhaustion: 0,
      death_save_successes: 0,
      death_save_failures: 0,
      updated_at: 'rest-stamp',
    },
    resources: [{ id: 'ki', current: 4, updated_at: 'rest-stamp' }],
  }

  it('writes the vitals and trackers the rest returned, and nothing before it answers', async () => {
    const call = deferred<typeof result>()
    vi.mocked(takeCharacterRest).mockReturnValue(call.promise)
    const { queryClient, result: hook } = setup([resource({ current: 0 }), rage])
    let pending!: Promise<unknown>
    act(() => {
      pending = hook.current.takeRest(characterId, 'long', { hp: 'max' })
    })
    expect(cachedSheet(queryClient).current_hp).toBe(15)
    expect(hook.current.busy).toBe(true)
    await act(async () => {
      call.resolve(result)
      await pending
    })
    expect(takeCharacterRest).toHaveBeenCalledWith(characterId, 'long', { hp: 'max' })
    expect(cachedSheet(queryClient)).toMatchObject({ current_hp: 20, updated_at: 'rest-stamp' })
    expect(cachedRows(queryClient)[0]).toMatchObject({ current: 4, updated_at: 'rest-stamp' })
    expect(cachedRows(queryClient)[1]).toEqual(rage)
    expect(hook.current.busy).toBe(false)
  })

  it('shows the plan copy and reloads the trackers when the plan no longer fits', async () => {
    vi.mocked(takeCharacterRest).mockRejectedValue(new Error('resource_unavailable'))
    const { queryClient, result: hook } = setup()
    let answer: unknown = 'unset'
    await act(async () => {
      answer = await hook.current.takeRest(characterId, 'long', {})
    })
    expect(answer).toBeUndefined()
    expect(stale(queryClient, resourcesKey)).toBe(true)
    expect(hook.current.error).toMatch(/no longer available/)

    vi.mocked(takeCharacterRest).mockRejectedValue(new Error('rest_plan_invalid'))
    await act(async () => {
      await hook.current.takeRest(characterId, 'long', {})
    })
    expect(hook.current.error).toMatch(/Review it/)
  })
})

describe('death saves and status', () => {
  it('records a death save into the sheet', async () => {
    vi.mocked(recordDeathSave).mockResolvedValue({
      current_hp: 1,
      death_save_successes: 0,
      death_save_failures: 0,
      updated_at: 'ds',
    })
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.saveDeathSave(characterId, 'critical_success')
    })
    expect(recordDeathSave).toHaveBeenCalledWith(characterId, 'critical_success')
    expect(cachedSheet(queryClient)).toMatchObject({ current_hp: 1, updated_at: 'ds' })
  })

  it('explains a death save refused above 0 HP', async () => {
    vi.mocked(recordDeathSave).mockRejectedValue(new Error('not_dying'))
    const { result } = setup()
    await act(async () => {
      await result.current.saveDeathSave(characterId, 'success')
    })
    expect(result.current.error).toBe('Death saves are only rolled at 0 HP.')
  })

  it('caches the sheet returned by a status save', async () => {
    const saved = sheet({ conditions: ['prone'], exhaustion: 1, inspiration: true })
    vi.mocked(updateCharacterStatus).mockResolvedValue(saved)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.saveStatus(characterId, { conditions: ['prone'] })
    })
    expect(updateCharacterStatus).toHaveBeenCalledWith(characterId, { conditions: ['prone'] })
    expect(queryClient.getQueryData(sheetKey)).toEqual(saved)
  })

  it('shows the fallback copy when a status save fails', async () => {
    vi.mocked(updateCharacterStatus).mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => {
      await result.current.saveStatus(characterId, { inspiration: true })
    })
    expect(result.current.error).toBe(
      "We couldn't save this status. Check your connection and try again.",
    )
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})

describe('managing trackers', () => {
  const values = {
    kind: 'tracker' as const,
    name: 'Bardic Inspiration',
    slot_level: null,
    die: null,
    maximum: 3,
    current: 3,
    reset: 'long' as const,
    position: 2,
  }

  it('adds a tracker to the list', async () => {
    const added = resource({ id: 'bard', name: 'Bardic Inspiration', position: 2 })
    vi.mocked(addCharacterResource).mockResolvedValue(added)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.addResource(characterId, values)
    })
    expect(addCharacterResource).toHaveBeenCalledWith(characterId, values)
    expect(cachedRows(queryClient).map((row) => row.id)).toEqual(['ki', 'rage', 'bard'])
  })

  it('shows the cap copy when a character has 40 trackers', async () => {
    vi.mocked(addCharacterResource).mockRejectedValue(new Error('resource_limit'))
    const { result } = setup()
    await act(async () => {
      await result.current.addResource(characterId, values)
    })
    expect(result.current.error).toBe('A character can have up to 40 trackers.')
  })

  it('replaces an edited tracker with the row the database returned (current may be clamped)', async () => {
    vi.mocked(updateCharacterResource).mockResolvedValue({ ...ki, maximum: 2, current: 2 })
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.editResource(characterId, 'ki', { maximum: 2 })
    })
    expect(updateCharacterResource).toHaveBeenCalledWith('ki', { maximum: 2 })
    expect(cachedRows(queryClient)[0]).toMatchObject({ maximum: 2, current: 2 })
  })

  it('removes a tracker from the list', async () => {
    vi.mocked(deleteCharacterResource).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    let ok: unknown
    await act(async () => {
      ok = await result.current.removeResource(characterId, 'ki')
    })
    expect(ok).toBe(true)
    expect(cachedRows(queryClient).map((row) => row.id)).toEqual(['rage'])
  })
})
