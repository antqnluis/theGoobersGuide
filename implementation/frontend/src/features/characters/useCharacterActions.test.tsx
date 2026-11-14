import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCharacter,
  deleteCharacter,
  setCharacterInParty,
  setCharacterStatus,
  setSheetVisibility,
  updateCharacterDetails,
  updateCharacterSheetBody,
  updateCharacterVitals,
} from './characterService'
import type { CharacterSheet } from './characterTypes'
import { defaultSheetBody } from './characterValidation'
import { useCharacterActions } from './useCharacterActions'

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  createCharacter: vi.fn(),
  updateCharacterDetails: vi.fn(),
  setCharacterStatus: vi.fn(),
  setCharacterInParty: vi.fn(),
  setSheetVisibility: vi.fn(),
  updateCharacterVitals: vi.fn(),
  updateCharacterSheetBody: vi.fn(),
  deleteCharacter: vi.fn(),
}))

const campaignId = '00000000-0000-4000-8000-000000000011'
const userId = '00000000-0000-4000-8000-000000000001'
const characterId = '00000000-0000-4000-8000-000000000021'
const charactersKey = ['campaigns', 'characters', campaignId, userId]
const sheetKey = ['campaigns', 'characters', 'sheet', characterId, userId]
const detailKey = ['campaigns', 'detail', campaignId, userId]
const rosterKey = ['campaigns', 'roster', campaignId, userId]
const details = {
  name: 'Brand',
  species: null,
  class_name: null,
  subclass: null,
  background: null,
  level: 1,
}
const sheet: CharacterSheet = {
  character_id: characterId,
  max_hp: 10,
  current_hp: 5,
  temp_hp: 0,
  armor_class: null,
  speed: null,
  cp: 0,
  sp: 0,
  gp: 0,
  updated_at: 'new-stamp',
  sheet: defaultSheetBody(),
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const key of [charactersKey, sheetKey, detailKey, rosterKey]) {
    queryClient.setQueryData(key, 'cached')
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCharacterActions(campaignId, userId), { wrapper })
  return { queryClient, result }
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

describe('useCharacterActions', () => {
  it.each([
    [
      'create',
      () => vi.mocked(createCharacter).mockResolvedValue('id'),
      (actions: ReturnType<typeof setup>['result']['current']) => actions.create(details, true),
    ],
    [
      'saveDetails',
      () => vi.mocked(updateCharacterDetails).mockResolvedValue({} as never),
      (actions: ReturnType<typeof setup>['result']['current']) =>
        actions.saveDetails(characterId, details),
    ],
    [
      'changeStatus',
      () => vi.mocked(setCharacterStatus).mockResolvedValue(undefined),
      (actions: ReturnType<typeof setup>['result']['current']) =>
        actions.changeStatus(characterId, 'retired'),
    ],
    [
      'changeParty',
      () => vi.mocked(setCharacterInParty).mockResolvedValue(undefined),
      (actions: ReturnType<typeof setup>['result']['current']) =>
        actions.changeParty(characterId, true),
    ],
    [
      'changeVisibility',
      () => vi.mocked(setSheetVisibility).mockResolvedValue(undefined),
      (actions: ReturnType<typeof setup>['result']['current']) =>
        actions.changeVisibility(characterId, 'campaign'),
    ],
  ])('%s refreshes the characters and resolves true', async (_name, arrange, act_) => {
    arrange()
    const { queryClient, result } = setup()
    let ok = false
    await act(async () => {
      ok = await act_(result.current)
    })
    expect(ok).toBe(true)
    expect(stale(queryClient, charactersKey)).toBe(true)
    expect(stale(queryClient, sheetKey)).toBeFalsy()
    expect(result.current.error).toBeNull()
  })

  it('updates the sheet cache from the returned row after a vitals change', async () => {
    vi.mocked(updateCharacterVitals).mockResolvedValue(sheet)
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.saveVitals(characterId, { current_hp: 5 })
    })
    expect(updateCharacterVitals).toHaveBeenCalledWith(characterId, { current_hp: 5 })
    expect(queryClient.getQueryData(sheetKey)).toBe(sheet)
    expect(stale(queryClient, charactersKey)).toBeFalsy()
  })

  it('saves the body against the previous stamp and caches the returned row', async () => {
    vi.mocked(updateCharacterSheetBody).mockResolvedValue(sheet)
    const { queryClient, result } = setup()
    const body = defaultSheetBody()
    await act(async () => {
      await result.current.saveSheet(characterId, body, 'old-stamp')
    })
    expect(updateCharacterSheetBody).toHaveBeenCalledWith(characterId, body, 'old-stamp')
    expect(queryClient.getQueryData(sheetKey)).toBe(sheet)
  })

  it('marks the sheet stale and shows the conflict copy when another device saved first', async () => {
    vi.mocked(updateCharacterSheetBody).mockRejectedValue(new Error('sheet_conflict'))
    const { queryClient, result } = setup()
    let ok = true
    await act(async () => {
      ok = await result.current.saveSheet(characterId, defaultSheetBody(), 'old-stamp')
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe(
      'This sheet changed on another device. Reload it to see the latest version.',
    )
    expect(stale(queryClient, sheetKey)).toBe(true)
  })

  it('removes the sheet cache and refreshes the list after a delete', async () => {
    vi.mocked(deleteCharacter).mockResolvedValue(undefined)
    const { queryClient, result } = setup()
    await act(async () => {
      expect(await result.current.remove(characterId)).toBe(true)
    })
    expect(queryClient.getQueryData(sheetKey)).toBeUndefined()
    expect(stale(queryClient, charactersKey)).toBe(true)
  })

  it('shows known error copy and keeps caches untouched on an ordinary failure', async () => {
    vi.mocked(createCharacter).mockRejectedValue({ message: 'character_active_exists' })
    const { queryClient, result } = setup()
    let ok = true
    await act(async () => {
      ok = await result.current.create(details, false)
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe(
      'You already have an active character here. Retire them or mark them deceased first.',
    )
    expect(stale(queryClient, charactersKey)).toBeFalsy()
    expect(stale(queryClient, detailKey)).toBeFalsy()
  })

  it.each([
    [
      'create',
      (a: ReturnType<typeof setup>['result']['current']) => a.create(details, false),
      'create',
    ],
    [
      'status',
      (a: ReturnType<typeof setup>['result']['current']) => a.changeStatus(characterId, 'active'),
      'update',
    ],
    [
      'delete',
      (a: ReturnType<typeof setup>['result']['current']) => a.remove(characterId),
      'delete',
    ],
  ])('uses the %s fallback for unknown failures', async (_name, call, word) => {
    vi.mocked(createCharacter).mockRejectedValue(new Error('network'))
    vi.mocked(setCharacterStatus).mockRejectedValue(new Error('network'))
    vi.mocked(deleteCharacter).mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => {
      await call(result.current)
    })
    expect(result.current.error).toContain(`We couldn't ${word} `)
    expect(result.current.error).toContain('Check your connection and try again.')
  })

  it('refetches characters, campaign, and roster when the character is unavailable', async () => {
    vi.mocked(setCharacterInParty).mockRejectedValue({ message: 'character_unavailable' })
    const { queryClient, result } = setup()
    await act(async () => {
      await result.current.changeParty(characterId, true)
    })
    expect(result.current.error).toBe('This character is no longer available.')
    for (const key of [charactersKey, detailKey, rosterKey]) {
      expect(stale(queryClient, key)).toBe(true)
    }
  })

  it('tracks the pending action and character, then clears it', async () => {
    let finish: () => void = () => {}
    vi.mocked(setCharacterStatus).mockReturnValue(
      new Promise((resolve) => (finish = () => resolve())),
    )
    const { result } = setup()
    expect(result.current.pendingAction).toBeNull()

    let promise: Promise<boolean> = Promise.resolve(false)
    act(() => {
      promise = result.current.changeStatus(characterId, 'retired')
    })
    await waitFor(() => expect(result.current.pendingAction).toBe('status'))
    expect(result.current.pendingCharacterId).toBe(characterId)

    await act(async () => {
      finish()
      await promise
    })
    expect(result.current.pendingAction).toBeNull()
    expect(result.current.pendingCharacterId).toBeNull()
  })

  it('clears a previous error when the next action starts and on clearError', async () => {
    vi.mocked(createCharacter)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('id')
    const { result } = setup()
    await act(async () => {
      await result.current.create(details, false)
    })
    expect(result.current.error).not.toBeNull()
    await act(async () => {
      await result.current.create(details, false)
    })
    expect(result.current.error).toBeNull()

    vi.mocked(createCharacter).mockRejectedValueOnce(new Error('network'))
    await act(async () => {
      await result.current.create(details, false)
    })
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
