import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { campaignCharactersKey, characterResourcesKey, characterSheetKey } from './characterQueries'
import { isCharacterUnavailable, updateCharacterStatus } from './characterService'
import type {
  CharacterResource,
  CharacterSheet,
  CharacterStatusState,
  ResourceValues,
} from './characterTypes'
import {
  hpAfter,
  type DeathSaveResult,
  type HpKind,
  type RestKind,
  type RestPlan,
} from './resourceRules'
import {
  addCharacterResource,
  adjustCharacterResource,
  applyCharacterHp,
  deleteCharacterResource,
  isResourceStale,
  recordDeathSave,
  resourceError,
  takeCharacterRest,
  updateCharacterResource,
  type HpChange,
  type ResourcePatch,
  type RestResult,
} from './resourceService'

export type ResourceAction =
  | 'hp'
  | 'spend'
  | 'rest'
  | 'death-save'
  | 'status'
  | 'resource-add'
  | 'resource-edit'
  | 'resource-delete'

const fallbackCopy: Record<ResourceAction, string> = {
  hp: "We couldn't change HP. Check your connection and try again.",
  spend: "We couldn't update this tracker. Check your connection and try again.",
  rest: "We couldn't take this rest. Check your connection and try again.",
  'death-save': "We couldn't record this death save. Check your connection and try again.",
  status: "We couldn't save this status. Check your connection and try again.",
  'resource-add': "We couldn't save this tracker. Check your connection and try again.",
  'resource-edit': "We couldn't save this tracker. Check your connection and try again.",
  'resource-delete': "We couldn't remove this tracker. Check your connection and try again.",
}

/**
 * Live-resource mutations for one campaign (M04 §6). Called once by the workspace, like
 * `useCharacterActions`, so state survives panels unmounting. HP and tracker taps are optimistic:
 * the cache changes at once, taps on the same target run in order, and a failure puts back what
 * was there and shows safe copy. Rests and everything else wait for the server.
 *
 * Each action resolves to its result, or `undefined` when it failed (the error is then set).
 */
export function useResourceActions(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingAction, setPendingAction] = useState<{
    action: ResourceAction
    characterId: string
    resourceId: string | null
  }>()

  /** The tail of each target's chain of taps, so one target's calls reach the server in order. */
  const queues = useRef(new Map<string, Promise<unknown>>())
  /** Taps not yet answered per target. The server's answer is shown only after the last one. */
  const inFlight = useRef(new Map<string, number>())

  const charactersKey = campaignCharactersKey(campaignId, userId)
  const detailKey = ['campaigns', 'detail', campaignId, userId]
  const rosterKey = ['campaigns', 'roster', campaignId, userId]

  const clearError = useCallback(() => setError(null), [])

  const sheetKey = (characterId: string) => characterSheetKey(characterId, userId)
  const listKey = (characterId: string) => characterResourcesKey(characterId, userId)

  const patchSheet = (characterId: string, patch: Partial<CharacterSheet>) =>
    queryClient.setQueryData<CharacterSheet | null | undefined>(sheetKey(characterId), (sheet) =>
      sheet ? { ...sheet, ...patch } : sheet,
    )

  const patchResources = (
    characterId: string,
    edit: (rows: CharacterResource[]) => CharacterResource[],
  ) =>
    queryClient.setQueryData<CharacterResource[] | undefined>(listKey(characterId), (rows) =>
      rows ? edit(rows) : rows,
    )

  const failed = (
    action: ResourceAction,
    characterId: string,
    failure: unknown,
    options: { refetch: () => void },
  ) => {
    if (isCharacterUnavailable(failure)) {
      // The character or the membership is gone: show the truth.
      void queryClient.invalidateQueries({ queryKey: charactersKey })
      void queryClient.invalidateQueries({ queryKey: detailKey })
      void queryClient.invalidateQueries({ queryKey: rosterKey })
    }
    if (isResourceStale(failure)) {
      // Another device changed or removed the tracker: show the latest list.
      void queryClient.invalidateQueries({ queryKey: listKey(characterId) })
    }
    options.refetch()
    setError(resourceError(failure, fallbackCopy[action]))
  }

  /** An action that waits for the server before the cache changes. */
  async function run<T>(
    action: ResourceAction,
    characterId: string,
    task: () => Promise<T>,
    resourceId: string | null = null,
  ): Promise<T | undefined> {
    setError(null)
    setPendingAction({ action, characterId, resourceId })
    setPendingCount((count) => count + 1)
    try {
      return await task()
    } catch (failure) {
      failed(action, characterId, failure, { refetch: () => undefined })
      return undefined
    } finally {
      setPendingCount((count) => count - 1)
      setPendingAction(undefined)
    }
  }

  /**
   * A tap: `apply` changes the cache now and returns how to put it back; `send` calls the
   * server after the earlier taps on this target; `settle` stores the answer (only when this was
   * the last tap, so the screen never steps back through values of taps still in flight).
   */
  async function tap<T>(
    action: ResourceAction,
    characterId: string,
    target: string,
    apply: () => (() => void) | undefined,
    send: () => Promise<T>,
    settle: (answer: T) => void,
    refetchKey: readonly unknown[],
    resourceId: string | null = null,
  ): Promise<T | undefined> {
    setError(null)
    const undo = apply()
    inFlight.current.set(target, (inFlight.current.get(target) ?? 0) + 1)
    setPendingCount((count) => count + 1)
    setPendingAction({ action, characterId, resourceId })

    const previous = queues.current.get(target) ?? Promise.resolve()
    const call = previous.catch(() => undefined).then(send)
    queues.current.set(target, call)
    try {
      const answer = await call
      if (inFlight.current.get(target) === 1) settle(answer)
      return answer
    } catch (failure) {
      // Put back what this tap showed when nothing else is in flight; otherwise the refetch
      // below shows the truth once the remaining taps are done.
      if (inFlight.current.get(target) === 1) undo?.()
      failed(action, characterId, failure, {
        refetch: () => void queryClient.invalidateQueries({ queryKey: refetchKey }),
      })
      return undefined
    } finally {
      const left = (inFlight.current.get(target) ?? 1) - 1
      if (left <= 0) {
        inFlight.current.delete(target)
        queues.current.delete(target)
      } else {
        inFlight.current.set(target, left)
      }
      setPendingCount((count) => count - 1)
      setPendingAction(undefined)
    }
  }

  /** Damage, healing, or temporary HP. The sheet's HP bar moves at once. */
  const changeHp = (characterId: string, kind: HpKind, amount: number) =>
    tap<HpChange>(
      'hp',
      characterId,
      `hp:${characterId}`,
      () => {
        const sheet = queryClient.getQueryData<CharacterSheet | null>(sheetKey(characterId))
        const next = sheet ? hpAfter(sheet, kind, amount) : null
        if (!sheet || !next) return undefined
        const before = {
          current_hp: sheet.current_hp,
          temp_hp: sheet.temp_hp,
          death_save_successes: sheet.death_save_successes,
          death_save_failures: sheet.death_save_failures,
        }
        patchSheet(characterId, {
          current_hp: next.current_hp,
          temp_hp: next.temp_hp,
          death_save_successes: next.death_save_successes,
          death_save_failures: next.death_save_failures,
        })
        return () => patchSheet(characterId, before)
      },
      () => applyCharacterHp(characterId, kind, amount),
      (change) =>
        patchSheet(characterId, {
          current_hp: change.current_hp,
          temp_hp: change.temp_hp,
          death_save_successes: change.death_save_successes,
          death_save_failures: change.death_save_failures,
          updated_at: change.updated_at,
        }),
      sheetKey(characterId),
    )

  /** Spends (negative) or restores (positive) a tracker. The pips move at once. */
  const adjustResource = (characterId: string, resourceId: string, delta: number) =>
    tap(
      'spend',
      characterId,
      `resource:${resourceId}`,
      () => {
        const row = queryClient
          .getQueryData<CharacterResource[]>(listKey(characterId))
          ?.find((entry) => entry.id === resourceId)
        if (!row) return undefined
        const previous = row.current
        const next = Math.min(row.maximum, Math.max(0, previous + delta))
        patchResources(characterId, (rows) =>
          rows.map((entry) => (entry.id === resourceId ? { ...entry, current: next } : entry)),
        )
        return () =>
          patchResources(characterId, (rows) =>
            rows.map((entry) =>
              entry.id === resourceId ? { ...entry, current: previous } : entry,
            ),
          )
      },
      () => adjustCharacterResource(resourceId, delta),
      ({ current, updated_at }) =>
        patchResources(characterId, (rows) =>
          rows.map((entry) =>
            entry.id === resourceId ? { ...entry, current, updated_at } : entry,
          ),
        ),
      listKey(characterId),
      resourceId,
    )

  const applyRest = (characterId: string, result: RestResult) => {
    patchSheet(characterId, result.sheet)
    const current = new Map(result.resources.map((entry) => [entry.id, entry]))
    patchResources(characterId, (rows) =>
      rows.map((row) => {
        const changed = current.get(row.id)
        return changed ? { ...row, current: changed.current, updated_at: changed.updated_at } : row
      }),
    )
  }

  /** Applies a confirmed rest preview. Not optimistic: the dialog shows "Resting…" meanwhile. */
  const takeRest = (characterId: string, kind: RestKind, plan: RestPlan) =>
    run('rest', characterId, async () => {
      const result = await takeCharacterRest(characterId, kind, plan)
      applyRest(characterId, result)
      return result
    })

  /** Records a death save that the dice already rolled. */
  const saveDeathSave = (characterId: string, result: DeathSaveResult) =>
    run('death-save', characterId, async () => {
      const { updated_at, ...vitals } = await recordDeathSave(characterId, result)
      patchSheet(characterId, { ...vitals, updated_at })
      return vitals
    })

  /** Conditions, exhaustion, death-save pips, concentration, or inspiration. */
  const saveStatus = (characterId: string, patch: Partial<CharacterStatusState>) =>
    run('status', characterId, async () => {
      const sheet = await updateCharacterStatus(characterId, patch)
      queryClient.setQueryData(sheetKey(characterId), sheet)
      return sheet
    })

  const addResource = (characterId: string, values: ResourceValues) =>
    run('resource-add', characterId, async () => {
      const row = await addCharacterResource(characterId, values)
      patchResources(characterId, (rows) => [...rows, row])
      void queryClient.invalidateQueries({ queryKey: listKey(characterId) })
      return row
    })

  const editResource = (characterId: string, resourceId: string, patch: ResourcePatch) =>
    run(
      'resource-edit',
      characterId,
      async () => {
        const row = await updateCharacterResource(resourceId, patch)
        patchResources(characterId, (rows) =>
          rows.map((entry) => (entry.id === row.id ? row : entry)),
        )
        return row
      },
      resourceId,
    )

  const removeResource = (characterId: string, resourceId: string) =>
    run(
      'resource-delete',
      characterId,
      async () => {
        await deleteCharacterResource(resourceId)
        patchResources(characterId, (rows) => rows.filter((entry) => entry.id !== resourceId))
        return true as const
      },
      resourceId,
    )

  return {
    error,
    clearError,
    /** Calls in progress, including taps waiting their turn. */
    busy: pendingCount > 0,
    pendingAction,
    changeHp,
    adjustResource,
    takeRest,
    saveDeathSave,
    saveStatus,
    addResource,
    editResource,
    removeResource,
  }
}

export type ResourceActions = ReturnType<typeof useResourceActions>
