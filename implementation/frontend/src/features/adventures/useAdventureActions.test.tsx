import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeAdventure } from './adventureRules'
import {
  addAdventureUpdate,
  addObjective,
  AdventureConflictError,
  createAdventure,
  deleteAdventureUpdate,
  deleteObjective,
  renameObjective,
  saveAdventureDetails,
  setAdventureArchived,
  setAdventureStatus,
  setObjectiveDone,
} from './adventureService'
import { adventure, campaignId, objective, update, userId } from './adventureTestData'
import type { AdventureDetail, AdventureSummary, AdventureValues } from './adventureTypes'
import { useAdventureActions } from './useAdventureActions'

vi.mock('./adventureService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adventureService')>()),
  createAdventure: vi.fn(),
  saveAdventureDetails: vi.fn(),
  setAdventureStatus: vi.fn(),
  setAdventureArchived: vi.fn(),
  addObjective: vi.fn(),
  renameObjective: vi.fn(),
  setObjectiveDone: vi.fn(),
  deleteObjective: vi.fn(),
  addAdventureUpdate: vi.fn(),
  deleteAdventureUpdate: vi.fn(),
}))

const listKey = ['campaigns', 'adventures', campaignId, userId]
const detailKey = (id: string) => ['campaigns', 'adventures', 'detail', id, userId]
const campaignDetailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]

const first = adventure({ id: 'a1', title: 'First', objectives: [objective({ id: 'o1' })] })
const second = adventure({ id: 'a2', title: 'Second' })
const values: AdventureValues = {
  title: 'Edited',
  type: 'side',
  description: 'New text',
  next_step: '',
  reference: '',
}

/** The columns a write returns: the adventure without its children. */
function row(detail: AdventureDetail, overrides: Partial<AdventureDetail> = {}) {
  const { participants: _p, objectives: _o, updates: _u, ...columns } = { ...detail, ...overrides }
  void [_p, _o, _u]
  return columns
}

function setup(
  list: AdventureSummary[] | null = [summarizeAdventure(first), summarizeAdventure(second)],
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (list) queryClient.setQueryData(listKey, list)
  queryClient.setQueryData(detailKey('a1'), first)
  queryClient.setQueryData(detailKey('a2'), second)
  for (const key of [campaignDetailKey, rosterKey]) queryClient.setQueryData(key, 'cached')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useAdventureActions(campaignId, userId), { wrapper })
  return { queryClient, result }
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated

const list = (queryClient: QueryClient) => queryClient.getQueryData<AdventureSummary[]>(listKey)!
const detail = (queryClient: QueryClient, id: string) =>
  queryClient.getQueryData<AdventureDetail>(detailKey(id))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

describe('create', () => {
  const input = { type: 'personal', title: 'New', character_id: 'c1', next_step: '' } as const

  it('caches the new adventure, puts it first in the list, and refreshes', async () => {
    const created = adventure({ id: 'a3', title: 'New' })
    vi.mocked(createAdventure).mockResolvedValue(created)
    const { queryClient, result } = setup()
    await act(async () => {
      const outcome = await result.current.create(input)
      expect(outcome).toEqual({ ok: true, value: created })
    })
    expect(createAdventure).toHaveBeenCalledWith(campaignId, input)
    expect(detail(queryClient, 'a3')).toEqual(created)
    expect(list(queryClient).map((entry) => entry.id)).toEqual(['a3', 'a1', 'a2'])
    expect(stale(queryClient, listKey)).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.pendingAction).toBeNull()
  })

  it('leaves an unloaded list alone', async () => {
    vi.mocked(createAdventure).mockResolvedValue(adventure({ id: 'a3' }))
    const { queryClient, result } = setup(null)
    await act(async () => {
      await result.current.create(input)
    })
    expect(queryClient.getQueryData(listKey)).toBeUndefined()
  })

  it('shows known copy and refreshes everything when the campaign is no longer available', async () => {
    vi.mocked(createAdventure).mockRejectedValue(new Error('adventure_campaign_unavailable'))
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.create(input)).toEqual({ ok: false, reason: 'unavailable' })
    })
    expect(result.current.error).toBe('You can no longer add adventures to this campaign.')
    for (const key of [listKey, campaignDetailKey, rosterKey]) {
      expect(stale(queryClient, key)).toBe(true)
    }
  })

  it('uses safe copy for an unknown failure and changes nothing', async () => {
    vi.mocked(createAdventure).mockRejectedValue(new Error('network down'))
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.create(input)).toEqual({ ok: false, reason: 'failed' })
    })
    expect(result.current.error).toBe(
      "We couldn't save this adventure. Check your connection and try again.",
    )
    expect(stale(queryClient, listKey)).toBe(false)
  })
})

describe('save', () => {
  it('writes the row onto both caches, keeping the children', async () => {
    vi.mocked(saveAdventureDetails).mockResolvedValue(
      row(first, { title: 'Edited', type: 'side', updated_at: '2026-11-16T11:00:00+00:00' }),
    )
    const { queryClient, result } = setup()
    await act(async () => {
      const outcome = await result.current.save('a1', values, first.updated_at)
      expect(outcome.ok).toBe(true)
    })
    expect(saveAdventureDetails).toHaveBeenCalledWith('a1', values, first.updated_at)
    expect(detail(queryClient, 'a1')).toMatchObject({
      title: 'Edited',
      updated_at: '2026-11-16T11:00:00+00:00',
      objectives: first.objectives,
    })
    const summaryRow = list(queryClient).find((entry) => entry.id === 'a1')!
    expect(summaryRow.title).toBe('Edited')
    expect(summaryRow.objectives).toEqual([{ done: false }])
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('on a conflict returns the latest, adopts it in the caches, and keeps the error copy', async () => {
    const latest = adventure({
      ...first,
      title: 'Someone else',
      updated_at: '2026-11-16T11:00:00+00:00',
    })
    vi.mocked(saveAdventureDetails).mockRejectedValue(new AdventureConflictError(latest))
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.save('a1', values, first.updated_at)).toEqual({
        ok: false,
        reason: 'conflict',
        latest,
      })
    })
    expect(result.current.error).toBe(
      'This adventure changed while you were editing. Your text is still here.',
    )
    expect(detail(queryClient, 'a1')).toEqual(latest)
    expect(list(queryClient).find((entry) => entry.id === 'a1')!.title).toBe('Someone else')
  })

  it('drops the adventure from both caches when it is no longer available', async () => {
    vi.mocked(saveAdventureDetails).mockRejectedValue(new Error('adventure_unavailable'))
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.save('a1', values, first.updated_at)).toEqual({
        ok: false,
        reason: 'unavailable',
      })
    })
    expect(result.current.error).toBe(
      'This adventure is no longer available. It may have been archived.',
    )
    expect(detail(queryClient, 'a1')).toBeUndefined()
    expect(list(queryClient).map((entry) => entry.id)).toEqual(['a2'])
    expect(detail(queryClient, 'a2')).toBeDefined()
    expect(stale(queryClient, listKey)).toBe(true)
    expect(stale(queryClient, campaignDetailKey)).toBe(true)
    expect(stale(queryClient, rosterKey)).toBe(true)
  })

  it('reports an archived adventure as a failure that keeps the caches', async () => {
    vi.mocked(saveAdventureDetails).mockRejectedValue({ message: 'adventure_archived' })
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.save('a1', values, first.updated_at)).toEqual({
        ok: false,
        reason: 'failed',
      })
    })
    expect(result.current.error).toBe('This adventure is archived. Restore it to make changes.')
    expect(detail(queryClient, 'a1')).toBeDefined()
  })
})

describe('status and archive', () => {
  it('changes the status in both caches', async () => {
    vi.mocked(setAdventureStatus).mockResolvedValue(
      row(first, { status: 'completed', status_changed_by: userId }),
    )
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.changeStatus('a1', 'completed')
    })
    expect(setAdventureStatus).toHaveBeenCalledWith('a1', 'completed')
    expect(detail(queryClient, 'a1')!.status).toBe('completed')
    expect(list(queryClient).find((entry) => entry.id === 'a1')!.status).toBe('completed')
  })

  it('archives and restores through the same write', async () => {
    const { queryClient, result } = setup()
    vi.mocked(setAdventureArchived).mockResolvedValueOnce(
      row(first, { archived_at: '2026-11-16T12:00:00+00:00' }),
    )
    await act(async () => {
      await result.current.archive('a1')
    })
    expect(setAdventureArchived).toHaveBeenLastCalledWith('a1', true)
    expect(detail(queryClient, 'a1')!.archived_at).not.toBeNull()

    vi.mocked(setAdventureArchived).mockResolvedValueOnce(row(first, { archived_at: null }))
    await act(async () => {
      await result.current.restore('a1')
    })
    expect(setAdventureArchived).toHaveBeenLastCalledWith('a1', false)
    expect(detail(queryClient, 'a1')!.archived_at).toBeNull()
  })

  it('shows safe copy when archiving fails for a reason it does not know', async () => {
    vi.mocked(setAdventureArchived).mockRejectedValue({
      code: '42501',
      message: 'adventure_archive_creator_only',
    })
    const { result } = setup()
    await act(async () => {
      expect(await result.current.archive('a1')).toEqual({ ok: false, reason: 'failed' })
    })
    expect(result.current.error).toBe(
      "We couldn't archive or restore this adventure. Check your connection and try again.",
    )
  })
})

describe('objectives', () => {
  it('adds an objective to the detail and the list row’s progress', async () => {
    const added = objective({ id: 'o2', adventure_id: 'a1' })
    vi.mocked(addObjective).mockResolvedValue(added)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.addObjective('a1', 'Search')
    })
    expect(addObjective).toHaveBeenCalledWith('a1', 'Search')
    expect(detail(queryClient, 'a1')!.objectives.map((entry) => entry.id)).toEqual(['o1', 'o2'])
    expect(list(queryClient).find((entry) => entry.id === 'a1')!.objectives).toHaveLength(2)
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('ticks and renames in place and tracks which objective is pending', async () => {
    let finish: (value: ReturnType<typeof objective>) => void = () => {}
    vi.mocked(setObjectiveDone).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { queryClient, result } = setup()
    let running: Promise<unknown> = Promise.resolve()
    act(() => {
      running = result.current.toggleObjective('a1', 'o1', true)
    })
    expect(result.current.pendingAction).toBe('objective-toggle')
    expect(result.current.pendingId).toBe('o1')
    await act(async () => {
      finish({
        ...first.objectives[0],
        done: true,
        completed_by: userId,
        completed_at: '2026-11-16T11:00:00Z',
      })
      await running
    })
    expect(detail(queryClient, 'a1')!.objectives[0].done).toBe(true)
    expect(list(queryClient).find((entry) => entry.id === 'a1')!.objectives).toEqual([
      { done: true },
    ])
    expect(result.current.pendingAction).toBeNull()

    vi.mocked(renameObjective).mockResolvedValue({ ...first.objectives[0], title: 'Renamed' })
    await act(async () => {
      await result.current.editObjective('a1', 'o1', 'Renamed')
    })
    expect(renameObjective).toHaveBeenCalledWith('o1', 'Renamed')
    expect(detail(queryClient, 'a1')!.objectives[0].title).toBe('Renamed')
  })

  it('deletes an objective from both caches', async () => {
    vi.mocked(deleteObjective).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    await act(async () => {
      expect((await result.current.removeObjective('a1', 'o1')).ok).toBe(true)
    })
    expect(deleteObjective).toHaveBeenCalledWith('o1')
    expect(detail(queryClient, 'a1')!.objectives).toEqual([])
    expect(list(queryClient).find((entry) => entry.id === 'a1')!.objectives).toEqual([])
  })

  it('refetches the adventure, not drops it, when an objective write finds nothing', async () => {
    vi.mocked(setObjectiveDone).mockRejectedValue(new Error('adventure_unavailable'))
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.toggleObjective('a1', 'o1', true)).toEqual({
        ok: false,
        reason: 'unavailable',
      })
    })
    expect(detail(queryClient, 'a1')).toBeDefined()
    expect(stale(queryClient, detailKey('a1'))).toBe(true)
    expect(stale(queryClient, detailKey('a2'))).toBe(false)
    expect(stale(queryClient, listKey)).toBe(true)
  })

  it('shows the cap copy and keeps the caches', async () => {
    vi.mocked(addObjective).mockRejectedValue({ message: 'adventure_objective_limit_reached' })
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.addObjective('a1', 'One more')).toEqual({
        ok: false,
        reason: 'failed',
      })
    })
    expect(result.current.error).toBe('An adventure can have up to 50 objectives.')
    expect(detail(queryClient, 'a1')!.objectives).toHaveLength(1)
  })
})

describe('updates', () => {
  it('posts newest first and deletes by id', async () => {
    const older = update({ id: 'u1', adventure_id: 'a1' })
    const newer = update({ id: 'u2', adventure_id: 'a1', body: 'Later' })
    vi.mocked(addAdventureUpdate).mockResolvedValueOnce(older).mockResolvedValueOnce(newer)
    vi.mocked(deleteAdventureUpdate).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.postUpdate('a1', 'The cellar was empty.')
    })
    await act(async () => {
      await result.current.postUpdate('a1', 'Later')
    })
    expect(detail(queryClient, 'a1')!.updates.map((entry) => entry.id)).toEqual(['u2', 'u1'])

    await act(async () => {
      await result.current.removeUpdate('a1', 'u2')
    })
    expect(deleteAdventureUpdate).toHaveBeenCalledWith('u2')
    expect(detail(queryClient, 'a1')!.updates.map((entry) => entry.id)).toEqual(['u1'])
  })

  it('shows the cap copy for the 501st update', async () => {
    vi.mocked(addAdventureUpdate).mockRejectedValue({ message: 'adventure_update_limit_reached' })
    const { result } = setup()
    await act(async () => {
      await result.current.postUpdate('a1', 'One more')
    })
    expect(result.current.error).toBe('This adventure has reached 500 updates.')
  })
})

describe('error state', () => {
  it('clears the error when the next write starts or when asked', async () => {
    vi.mocked(setAdventureStatus).mockRejectedValueOnce(new Error('network down'))
    const { result } = setup()
    await act(async () => {
      await result.current.changeStatus('a1', 'completed')
    })
    expect(result.current.error).toBe(
      "We couldn't change the status. Check your connection and try again.",
    )
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
