import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { npcKey, npcsKey } from './npcQueries'
import { summarizeNpc } from './npcRules'
import {
  createNpc,
  deleteNpc,
  isNpcConflict,
  isNpcUnavailable,
  npcError,
  removeNpcPortrait,
  saveNpc,
  setNpcVisibility,
  uploadNpcPortrait,
} from './npcService'
import type { Npc, NpcCreateValues, NpcSummary, NpcValues, NpcVisibility } from './npcTypes'

export type NpcAction = 'create' | 'save' | 'visibility' | 'delete' | 'portrait'

/**
 * How a write ended, so the surface decides what follows (opening the NPC, keeping the
 * writer's text). A conflict carries the latest version for "Load latest".
 */
export type NpcResult =
  | { ok: true; npc: Npc }
  | { ok: false; reason: 'conflict'; latest: Npc }
  | { ok: false; reason: 'unavailable' | 'failed' }

const fallbackCopy: Record<NpcAction, string> = {
  create: "We couldn't save this NPC. Check your connection and try again.",
  save: "We couldn't save this NPC. Check your connection and try again.",
  visibility: "We couldn't change who can see this NPC. Check your connection and try again.",
  delete: "We couldn't delete this NPC. Check your connection and try again.",
  portrait: "We couldn't save this picture. Check your connection and try again.",
}

/**
 * NPC mutations for one campaign. Called once by the workspace so mutation state survives the
 * NPC tab unmounting. Authorization stays in the database; failures surface as safe copy.
 */
export function useNpcActions(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ action: NpcAction; npcId: string | null }>()

  const listKey = npcsKey(campaignId, userId)
  const clearError = useCallback(() => setError(null), [])

  const patchList = (edit: (npcs: NpcSummary[]) => NpcSummary[]) =>
    queryClient.setQueryData<NpcSummary[]>(listKey, (npcs) => (npcs ? edit(npcs) : npcs))

  /** Puts a written NPC in both caches and refreshes the list in the background. */
  const settle = (npc: Npc) => {
    queryClient.setQueryData(npcKey(npc.id, userId), npc)
    const summary = summarizeNpc(npc)
    patchList((npcs) =>
      npcs.some((row) => row.id === npc.id)
        ? npcs.map((row) => (row.id === npc.id ? summary : row))
        : [summary, ...npcs],
    )
    void queryClient.invalidateQueries({ queryKey: listKey })
  }

  /** The NPC is gone for this member: forget it and show the truth. */
  const dropNpc = (npcId: string) => {
    queryClient.removeQueries({ queryKey: npcKey(npcId, userId) })
    patchList((npcs) => npcs.filter((row) => row.id !== npcId))
    void queryClient.invalidateQueries({ queryKey: listKey })
  }

  async function run(
    action: NpcAction,
    npcId: string | null,
    task: () => Promise<Npc>,
  ): Promise<NpcResult> {
    setError(null)
    setPending({ action, npcId })
    try {
      return { ok: true, npc: await task() }
    } catch (failure) {
      setError(npcError(failure, fallbackCopy[action]))
      if (isNpcConflict(failure)) {
        // The writer's text stays in the editor; the cache learns the latest version.
        queryClient.setQueryData(npcKey(failure.latest.id, userId), failure.latest)
        patchList((npcs) =>
          npcs.map((row) => (row.id === failure.latest.id ? summarizeNpc(failure.latest) : row)),
        )
        void queryClient.invalidateQueries({ queryKey: listKey })
        return { ok: false, reason: 'conflict', latest: failure.latest }
      }
      if (isNpcUnavailable(failure)) {
        if (npcId) dropNpc(npcId)
        else void queryClient.invalidateQueries({ queryKey: listKey })
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

  const create = (values: NpcCreateValues) =>
    run('create', null, async () => {
      const npc = await createNpc(campaignId, values)
      settle(npc)
      return npc
    })

  const save = (npcId: string, values: NpcValues, previousUpdatedAt: string) =>
    run('save', npcId, async () => {
      const npc = await saveNpc(npcId, values, previousUpdatedAt)
      settle(npc)
      return npc
    })

  const changeVisibility = (npcId: string, visibility: NpcVisibility, previousUpdatedAt: string) =>
    run('visibility', npcId, async () => {
      const npc = await setNpcVisibility(npcId, visibility, previousUpdatedAt)
      settle(npc)
      return npc
    })

  const setPortrait = (npcId: string, file: File, previousPath: string | null) =>
    run('portrait', npcId, async () => {
      const npc = await uploadNpcPortrait(npcId, file, previousPath)
      settle(npc)
      return npc
    })

  const clearPortrait = (npcId: string, path: string) =>
    run('portrait', npcId, async () => {
      const npc = await removeNpcPortrait(npcId, path)
      settle(npc)
      return npc
    })

  /** Resolves to whether the NPC is gone (deleted now, or already unavailable). */
  const remove = async (npcId: string, portraitPath?: string | null) => {
    setError(null)
    setPending({ action: 'delete', npcId })
    try {
      await deleteNpc(npcId, portraitPath)
      dropNpc(npcId)
      return true
    } catch (failure) {
      setError(npcError(failure, fallbackCopy.delete))
      if (isNpcUnavailable(failure)) {
        dropNpc(npcId)
        return true
      }
      return false
    } finally {
      setPending(undefined)
    }
  }

  return {
    error,
    clearError,
    pendingAction: pending?.action ?? null,
    pendingNpcId: pending?.npcId ?? null,
    create,
    save,
    changeVisibility,
    setPortrait,
    clearPortrait,
    remove,
  }
}
