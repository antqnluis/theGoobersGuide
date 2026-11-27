import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  campaignLibrariesKey,
  libraryContentKey,
  allVisionsPrefix,
  libraryImportsKey,
  librariesKey,
  lastRestKey,
  visionsPrefix,
} from './craftingQueries'
import {
  callLongRest,
  craftingError,
  createLibrary,
  deleteLibrary,
  importPack,
  isLibraryUnavailable,
  saveVision,
  setCampaignLibrary,
  unsaveVision,
  updateLibrary,
} from './craftingService'
import type {
  CraftingLibrary,
  CraftingPack,
  LongRestResult,
  PackImportResult,
} from './craftingTypes'

/**
 * The DM's crafting writes. Each returns its result, or undefined after putting safe copy in
 * `error`; nothing is shown as done unless the database confirmed it.
 */
export function useCraftingActions(userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  const run = useCallback(
    async <T>(task: () => Promise<T>, fallback: string, onFailure?: () => void) => {
      setError(null)
      setPending((count) => count + 1)
      try {
        return await task()
      } catch (failure) {
        setError(craftingError(failure, fallback))
        // A library that is gone: refresh the list so it stops showing.
        if (isLibraryUnavailable(failure)) {
          void queryClient.invalidateQueries({ queryKey: librariesKey(userId) })
        }
        onFailure?.()
        return undefined
      } finally {
        setPending((count) => count - 1)
      }
    },
    [queryClient, userId],
  )

  const clearError = useCallback(() => setError(null), [])

  const refreshLibraries = () => queryClient.invalidateQueries({ queryKey: librariesKey(userId) })

  return {
    error,
    isPending: pending > 0,
    clearError,

    create: (name: string, description: string) =>
      run(async () => {
        const library = await createLibrary(name, description)
        await refreshLibraries()
        return library
      }, 'The library couldn’t be created. Check your connection and try again.'),

    rename: (library: CraftingLibrary, name: string, description: string) =>
      run(async () => {
        const updated = await updateLibrary(library.id, name, description)
        await refreshLibraries()
        return updated
      }, 'The library couldn’t be renamed. Check your connection and try again.'),

    remove: (libraryId: string, campaignId: string) =>
      run(async () => {
        await deleteLibrary(libraryId)
        await Promise.all([
          refreshLibraries(),
          queryClient.invalidateQueries({ queryKey: campaignLibrariesKey(campaignId, userId) }),
        ])
        queryClient.removeQueries({ queryKey: libraryContentKey(libraryId, userId) })
        return true as const
      }, 'The library couldn’t be deleted. Check your connection and try again.'),

    setEnabled: (campaignId: string, libraryId: string, enabled: boolean) =>
      run(async () => {
        await setCampaignLibrary(campaignId, libraryId, enabled)
        await queryClient.invalidateQueries({ queryKey: campaignLibrariesKey(campaignId, userId) })
        return true as const
      }, 'That couldn’t be changed. Check your connection and try again.'),

    /** The party rests: every cached vision list is out of date once it lands. */
    callRest: (campaignId: string) =>
      run<LongRestResult>(async () => {
        const result = await callLongRest(campaignId)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: allVisionsPrefix }),
          queryClient.invalidateQueries({ queryKey: lastRestKey(campaignId, userId) }),
        ])
        return result
      }, 'The rest couldn’t be called. Check your connection and try again.'),

    /** Saves or unsaves a vision; the list refetches either way, so a stale one clears. */
    setSaved: (characterId: string, recipeId: string, saved: boolean) =>
      run(
        async () => {
          if (saved) await saveVision(characterId, recipeId)
          else await unsaveVision(characterId, recipeId)
          await queryClient.invalidateQueries({ queryKey: visionsPrefix(characterId) })
          return true as const
        },
        saved
          ? 'That vision couldn’t be saved. Check your connection and try again.'
          : 'That vision couldn’t be removed. Check your connection and try again.',
        () => void queryClient.invalidateQueries({ queryKey: visionsPrefix(characterId) }),
      ),

    importPack: (libraryId: string, pack: CraftingPack, label: string | null) =>
      run<PackImportResult>(async () => {
        const result = await importPack(libraryId, pack, label)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: libraryContentKey(libraryId, userId) }),
          queryClient.invalidateQueries({ queryKey: libraryImportsKey(libraryId, userId) }),
          refreshLibraries(),
        ])
        return result
      }, 'The pack couldn’t be imported. Nothing was changed. Check your connection and try again.'),
  }
}

export type CraftingActions = ReturnType<typeof useCraftingActions>
