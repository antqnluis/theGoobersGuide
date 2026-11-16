import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { adventureKey, adventuresKey } from './adventureQueries'
import { mergeAdventure, summarizeAdventure } from './adventureRules'
import {
  addAdventureUpdate,
  addObjective,
  adventureError,
  createAdventure,
  deleteAdventureUpdate,
  deleteObjective,
  isAdventureConflict,
  isAdventureUnavailable,
  renameObjective,
  saveAdventureDetails,
  setAdventureArchived,
  setAdventureStatus,
  setObjectiveDone,
} from './adventureService'
import type {
  Adventure,
  AdventureCreateValues,
  AdventureDetail,
  AdventureObjective,
  AdventureStatus,
  AdventureSummary,
  AdventureUpdate,
  AdventureValues,
} from './adventureTypes'

export type AdventureAction =
  | 'create'
  | 'save'
  | 'status'
  | 'archive'
  | 'objective-add'
  | 'objective-edit'
  | 'objective-toggle'
  | 'objective-delete'
  | 'update-add'
  | 'update-delete'

/**
 * How a write ended, so the surface decides what follows (opening the adventure, moving focus,
 * keeping the writer's text). A conflict carries the latest version for "Load latest".
 */
export type AdventureResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'conflict'; latest: AdventureDetail }
  | { ok: false; reason: 'unavailable' | 'failed' }

const saveFailure = "We couldn't save this adventure. Check your connection and try again."

const fallbackCopy: Record<AdventureAction, string> = {
  create: saveFailure,
  save: saveFailure,
  status: "We couldn't change the status. Check your connection and try again.",
  archive: "We couldn't archive or restore this adventure. Check your connection and try again.",
  'objective-add': "We couldn't add the objective. Check your connection and try again.",
  'objective-edit': "We couldn't save the objective. Check your connection and try again.",
  'objective-toggle': "We couldn't change the objective. Check your connection and try again.",
  'objective-delete': "We couldn't delete the objective. Check your connection and try again.",
  'update-add': "We couldn't post the update. Check your connection and try again.",
  'update-delete': "We couldn't delete the update. Check your connection and try again.",
}

/** The actions that write the adventure itself; the rest write its objectives or updates. */
const adventureLevel: readonly AdventureAction[] = ['create', 'save', 'status', 'archive']

/**
 * Adventure mutations for one campaign. Called once by the workspace so mutation state survives
 * the Adventures page unmounting. Authorization stays in the database; failures surface as safe
 * copy. Writes update the caches at once and refresh the list in the background.
 */
export function useAdventureActions(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ action: AdventureAction; id: string | null }>()

  const listKey = adventuresKey(campaignId, userId)
  const clearError = useCallback(() => setError(null), [])

  const refreshList = () => void queryClient.invalidateQueries({ queryKey: listKey })

  const patchList = (edit: (adventures: AdventureSummary[]) => AdventureSummary[]) =>
    queryClient.setQueryData<AdventureSummary[]>(listKey, (rows) => (rows ? edit(rows) : rows))

  /** Edits a cached detail in place; an absent detail stays absent. */
  const patchDetail = (adventureId: string, edit: (detail: AdventureDetail) => AdventureDetail) =>
    queryClient.setQueryData<AdventureDetail>(adventureKey(adventureId, userId), (detail) =>
      detail ? edit(detail) : detail,
    )

  /** Puts a written adventure row in both caches; children stay as they were read. */
  const settleRow = (row: Adventure) => {
    patchDetail(row.id, (detail) => mergeAdventure(detail, row))
    patchList((rows) =>
      rows.map((existing) =>
        existing.id === row.id ? summarizeAdventure(row, existing) : existing,
      ),
    )
    refreshList()
  }

  /** A new or reloaded adventure with its children goes in both caches. */
  const settleDetail = (detail: AdventureDetail) => {
    queryClient.setQueryData(adventureKey(detail.id, userId), detail)
    const summary = summarizeAdventure(detail)
    patchList((rows) =>
      rows.some((row) => row.id === detail.id)
        ? rows.map((row) => (row.id === detail.id ? summary : row))
        : [summary, ...rows],
    )
    refreshList()
  }

  /** Edits a cached detail's objectives and brings the list row's progress along. */
  const patchObjectives = (
    adventureId: string,
    edit: (objectives: AdventureObjective[]) => AdventureObjective[],
  ) => {
    const detail = queryClient.getQueryData<AdventureDetail>(adventureKey(adventureId, userId))
    if (detail) {
      const next = { ...detail, objectives: edit(detail.objectives) }
      queryClient.setQueryData(adventureKey(adventureId, userId), next)
      patchList((rows) =>
        rows.map((row) => (row.id === adventureId ? summarizeAdventure(row, next) : row)),
      )
    }
    refreshList()
  }

  const patchUpdates = (
    adventureId: string,
    edit: (updates: AdventureUpdate[]) => AdventureUpdate[],
  ) => patchDetail(adventureId, (detail) => ({ ...detail, updates: edit(detail.updates) }))

  /** The adventure is gone for this member: forget it and show the truth. */
  const dropAdventure = (adventureId: string) => {
    queryClient.removeQueries({ queryKey: adventureKey(adventureId, userId) })
    patchList((rows) => rows.filter((row) => row.id !== adventureId))
    refreshList()
  }

  async function run<T>(
    action: AdventureAction,
    id: string | null,
    adventureId: string | null,
    task: () => Promise<T>,
  ): Promise<AdventureResult<T>> {
    setError(null)
    setPending({ action, id })
    try {
      return { ok: true, value: await task() }
    } catch (failure) {
      setError(adventureError(failure, fallbackCopy[action]))
      if (isAdventureConflict(failure)) {
        // The writer's text stays in the editor; the cache learns the latest version.
        settleDetail(failure.latest)
        return { ok: false, reason: 'conflict', latest: failure.latest }
      }
      if (isAdventureUnavailable(failure)) {
        if (!adventureId) refreshList()
        else if (adventureLevel.includes(action)) dropAdventure(adventureId)
        else {
          // An objective or update vanished, or the adventure did: the reread tells which.
          void queryClient.invalidateQueries({ queryKey: adventureKey(adventureId, userId) })
          refreshList()
        }
        // The membership may be gone too: the campaign's own queries decide what shows.
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'detail', campaignId, userId],
        })
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'roster', campaignId, userId],
        })
        return { ok: false, reason: 'unavailable' }
      }
      return { ok: false, reason: 'failed' }
    } finally {
      setPending(undefined)
    }
  }

  const create = (values: AdventureCreateValues) =>
    run('create', null, null, async () => {
      const detail = await createAdventure(campaignId, values)
      settleDetail(detail)
      return detail
    })

  /** Saves the details only against the stamp the form was opened on. */
  const save = (adventureId: string, values: AdventureValues, previousUpdatedAt: string) =>
    run('save', adventureId, adventureId, async () => {
      const row = await saveAdventureDetails(adventureId, values, previousUpdatedAt)
      settleRow(row)
      return row
    })

  const changeStatus = (adventureId: string, status: AdventureStatus) =>
    run('status', adventureId, adventureId, async () => {
      const row = await setAdventureStatus(adventureId, status)
      settleRow(row)
      return row
    })

  /** Archives or restores; only the creator may, and the database refuses anyone else. */
  const setArchived = (adventureId: string, archived: boolean) =>
    run('archive', adventureId, adventureId, async () => {
      const row = await setAdventureArchived(adventureId, archived)
      settleRow(row)
      return row
    })

  const addObjectiveTo = (adventureId: string, title: string) =>
    run('objective-add', adventureId, adventureId, async () => {
      const objective = await addObjective(adventureId, title)
      patchObjectives(adventureId, (objectives) => [...objectives, objective])
      return objective
    })

  const replaceObjective = (adventureId: string, objective: AdventureObjective) =>
    patchObjectives(adventureId, (objectives) =>
      objectives.map((row) => (row.id === objective.id ? objective : row)),
    )

  const editObjective = (adventureId: string, objectiveId: string, title: string) =>
    run('objective-edit', objectiveId, adventureId, async () => {
      const objective = await renameObjective(objectiveId, title)
      replaceObjective(adventureId, objective)
      return objective
    })

  const toggleObjective = (adventureId: string, objectiveId: string, done: boolean) =>
    run('objective-toggle', objectiveId, adventureId, async () => {
      const objective = await setObjectiveDone(objectiveId, done)
      replaceObjective(adventureId, objective)
      return objective
    })

  const removeObjective = (adventureId: string, objectiveId: string) =>
    run('objective-delete', objectiveId, adventureId, async () => {
      await deleteObjective(objectiveId)
      patchObjectives(adventureId, (objectives) =>
        objectives.filter((row) => row.id !== objectiveId),
      )
    })

  const postUpdate = (adventureId: string, body: string) =>
    run('update-add', adventureId, adventureId, async () => {
      const update = await addAdventureUpdate(adventureId, body)
      // The log reads newest first.
      patchUpdates(adventureId, (updates) => [update, ...updates])
      return update
    })

  const removeUpdate = (adventureId: string, updateId: string) =>
    run('update-delete', updateId, adventureId, async () => {
      await deleteAdventureUpdate(updateId)
      patchUpdates(adventureId, (updates) => updates.filter((row) => row.id !== updateId))
    })

  return {
    error,
    clearError,
    pendingAction: pending?.action ?? null,
    /** The adventure, objective, or update being written; null while idle or creating. */
    pendingId: pending?.id ?? null,
    create,
    save,
    changeStatus,
    archive: (adventureId: string) => setArchived(adventureId, true),
    restore: (adventureId: string) => setArchived(adventureId, false),
    addObjective: addObjectiveTo,
    editObjective,
    toggleObjective,
    removeObjective,
    postUpdate,
    removeUpdate,
  }
}
